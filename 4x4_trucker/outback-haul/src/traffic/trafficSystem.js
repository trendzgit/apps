import { Group, Color } from 'three';
import { makeRng, clamp } from '../util/math.js';
import { GridNetwork, RED, YELLOW } from './gridNetwork.js';
import { CAR_TYPES, CAR_PAINT, TrafficCarRenderer } from './trafficCars.js';
import { SignalsView } from './signalsView.js';

// Intelligent Driver Model (car following) tuning
const ACCEL = 2.2;      // m/s^2
const COMFY_BRAKE = 3.5;
const HEADWAY = 1.3;    // s
const MIN_GAP = 2.2;    // m bumper to bumper at standstill
const MAX_BRAKE = 9;

const STOP_MARGIN = 3;  // the stop line is this far before the junction edge (the zebra crossing is the last 3 m)
const CLAIM_TTA = 2.6;  // ask for the junction when we'd reach it within this many seconds
const BOX_RADIUS = 12;  // the player counts as "in the junction" inside this radius
const TURN_SPEED = { 1: 4.5, [-1]: 6.5 }; // m/s for right / left turns

const idm = (v, v0, gap, vLeader) => {
  let acc = ACCEL * (1 - Math.pow(v / v0, 4));
  if (gap < 1e8) {
    const dv = v - vLeader;
    const wanted = MIN_GAP + Math.max(0, v * HEADWAY + (v * dv) / (2 * Math.sqrt(ACCEL * COMFY_BRAKE)));
    acc -= ACCEL * (wanted / Math.max(gap, 0.1)) ** 2;
  }
  return Math.max(acc, -MAX_BRAKE);
};

/**
 * Ambient traffic on a grid road network:
 *  - cars follow lanes (right-hand traffic), turn at junctions along curved paths and pick random routes
 *  - car following (IDM), traffic lights, one car inside a junction at a time
 *  - cars react to the player: they brake for you, wait if you block the road or a junction, and honk
 *  - a "bubble" of cars around the player: cars that fall far behind are re-spawned ahead, out of sight
 *  - the player collides with cars (oriented boxes); a hit car stops for a couple of seconds
 */
export class TrafficSystem {
  constructor({ config, group, colliders, onHonk = null, seed = 777 }) {
    this.net = new GridNetwork(config);
    this.rng = makeRng(seed);
    this.root = new Group();
    group.add(this.root);
    this.count = config.count ?? 40;
    this.bubble = config.bubble ?? 330;
    this.onHonk = onHonk;
    this.time = 0;
    this._pt = { x: 0, z: 0, h: 0 };

    this.renderer = new TrafficCarRenderer(this.root, this.count);
    this.signals = new SignalsView(this.root, this.net, colliders);

    const totalWeight = CAR_TYPES.reduce((s, t) => s + t.weight, 0);
    this.cars = [];
    for (let i = 0; i < this.count; i++) {
      let r = this.rng() * totalWeight, type = 0;
      while (r > CAR_TYPES[type].weight) r -= CAR_TYPES[type++].weight;
      const t = CAR_TYPES[type];
      const occupants = type >= 2
        ? 1 + (this.rng() < 0.48 ? 1 : 0) // vans/trucks: driver, sometimes one passenger
        : 1 + Math.floor(this.rng() * 4); // cars: one to four occupants
      this.cars.push({
        type, len: t.length, wid: t.width, occupants,
        color: new Color(CAR_PAINT[(this.rng() * CAR_PAINT.length) | 0]),
        v0: (10 + this.rng() * 5) * t.speed,
        seg: null, u: 0, v: 0, out: 0, claim: null, release: null,
        stun: 0, waited: 0, blocked: 0, honkCd: 0, x: 0, z: 0, h: 0,
      });
    }
  }

  /** Scatter the fleet around the player (call once after the map is built). */
  populate(player) {
    for (const car of this.cars) this.respawn(car, player, 70, this.bubble * 0.9, false);
  }

  // ---- placement ------------------------------------------------------------------------------

  _leave(car) {
    if (car.seg) {
      const i = car.seg.cars.indexOf(car);
      if (i >= 0) car.seg.cars.splice(i, 1);
    }
    for (const n of [car.claim, car.release]) if (n && n.owner === car) n.owner = null;
    car.claim = car.release = null;
  }

  _chooseOut(lane) {
    const outs = this.net.validOuts(lane.endNode, lane.d);
    const r = this.rng();
    const straight = outs.includes(lane.d);
    const weights = outs.map((d) => (d === lane.d ? 0.6 : straight ? 0.2 : 0.5));
    let total = weights.reduce((a, b) => a + b, 0);
    let pick = r * total, i = 0;
    while (i < outs.length - 1 && pick > weights[i]) pick -= weights[i++];
    return outs[i];
  }

  /** Put `car` on a random free lane position between minD and maxD metres from the player. */
  respawn(car, player, minD, maxD, preferBehind) {
    const lanes = this.net.laneList;
    const fx = Math.sin(player.h), fz = Math.cos(player.h);
    for (let attempt = 0; attempt < 45; attempt++) {
      const lane = lanes[(this.rng() * lanes.length) | 0];
      const u = car.len / 2 + 2 + this.rng() * (lane.len - car.len - 12);
      lane.pointAt(u, this._pt);
      const dx = this._pt.x - player.x, dz = this._pt.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < minD || d > maxD) continue;
      if (preferBehind && attempt < 30 && (dx * fx + dz * fz) / d > 0.2) continue; // keep pop-in out of view
      if (lane.cars.some((c) => Math.abs(c.u - u) < c.len / 2 + car.len / 2 + 8)) continue;
      this._leave(car);
      car.seg = lane;
      car.u = u;
      lane.cars.push(car);
      car.v = Math.min(car.v0 * 0.8, 9);
      car.stun = car.waited = car.blocked = 0;
      car.out = this._chooseOut(lane);
      car.x = this._pt.x; car.z = this._pt.z; car.h = this._pt.h;
      return true;
    }
    return false;
  }

  // ---- junction control -----------------------------------------------------------------------

  _tryClaim(car, lane, frontToEnd, player) {
    const node = lane.endNode;
    if (node.owner && node.owner !== car) return false;
    if (frontToEnd / Math.max(car.v, 2.5) > CLAIM_TTA) return false;
    if (Math.hypot(player.x - node.x, player.z - node.z) < BOX_RADIUS) return false;
    const light = this.net.signal(node, lane.d & 1, this.time);
    if (light === RED) return false;
    if (light === YELLOW && (car.v * car.v) / (2 * COMFY_BRAKE) < frontToEnd - STOP_MARGIN - 1) return false; // can stop: do
    const out = this.net.lane(node, car.out);
    if (out && out.cars.some((c) => c.u - c.len / 2 < 10)) return false; // no room on the other side
    node.owner = car;
    car.claim = node;
    return true;
  }

  // ---- simulation -----------------------------------------------------------------------------

  update(dt, player) {
    this.time += dt;
    for (const car of this.cars) if (car.seg && !car.stolen) this._step(car, dt, player);

    for (const car of this.cars) { // keep the bubble populated / recover stuck cars
      if (car.stolen) continue;
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      if (!car.seg || d > this.bubble || (car.waited > 50 && d > 70) || car.waited > 120) {
        if (this.respawn(car, player, 150, this.bubble * 0.92, true)) car.waited = 0;
      }
    }
    this.renderer.render(this.cars);
    this.signals.update(this.time);
  }

  _step(car, dt, player) {
    const net = this.net, seg = car.seg;
    const front = car.u + car.len / 2;
    const frontToEnd = seg.len - front;
    let gap = 1e9, vLead = 0, leadIsPlayer = false;
    const consider = (g, v, isPlayer = false) => {
      if (g < gap) { gap = g; vLead = v; leadIsPlayer = isPlayer; }
    };

    for (const c of seg.cars) if (c !== car && c.u > car.u) consider(c.u - car.u - (c.len + car.len) / 2, c.v);

    if (seg.kind === 'lane') {
      if (!car.claim) this._tryClaim(car, seg, frontToEnd, player);
      if (car.claim) {
        if (frontToEnd < 45) { // look through the junction at the lane we're about to join
          const out = net.lane(seg.endNode, car.out), conn = net.conn(seg.endNode, seg.d, car.out);
          for (const c of out.cars) consider(frontToEnd + conn.len + c.u - c.len / 2, c.v);
        }
      } else {
        const stopFront = seg.len - STOP_MARGIN;
        consider((front <= stopFront + 0.3 ? stopFront : seg.len) - front, 0); // stop line, then junction edge
      }
    } else {
      const out = net.lane(seg.node, seg.dout);
      const rem = seg.len - front;
      for (const c of out.cars) consider(rem + c.u - c.len / 2, c.v);
    }

    // Pedestrians are obstacles too: AI cars slow before a person crossing their lane.
    if (this.peds) {
      const pedGap = this.peds.gapAhead(car.x, car.z, fs, fc, car.wid, car.len, 22);
      if (pedGap < gap) consider(pedGap, 0, false);
    }

    // the player is an obstacle if they're in our lane ahead of us
    const fs = Math.sin(car.h), fc = Math.cos(car.h);
    const px = player.x - car.x, pz = player.z - car.z;
    const along = px * fs + pz * fc;
    if (along > 0 && along < 45 && Math.abs(-px * fc + pz * fs) < car.wid / 2 + player.width / 2 + 0.4) {
      consider(along - car.len / 2 - player.length / 2, player.v * (Math.sin(player.h) * fs + Math.cos(player.h) * fc), true);
    }

    // desired speed: slower through and before turns
    let v0 = car.v0;
    if (seg.kind === 'conn') {
      if (seg.turn) v0 = Math.min(v0, TURN_SPEED[seg.turn]);
    } else if (car.out !== seg.d) {
      v0 = Math.min(v0, TURN_SPEED[car.out === (seg.d + 1) % 4 ? 1 : -1] + Math.max(0, frontToEnd - 2) * 0.55);
    }

    let acc;
    if (car.stun > 0) { car.stun -= dt; acc = -MAX_BRAKE; } else acc = idm(car.v, v0, gap, vLead);
    car.v = Math.max(0, car.v + acc * dt);
    car.u += car.v * dt;

    // patience: honk at a player who blocks us, note how long we've been stuck
    car.honkCd -= dt;
    car.waited = car.v < 0.3 ? car.waited + dt : 0;
    car.blocked = leadIsPlayer && gap < 9 && car.v < 0.5 ? car.blocked + dt : 0;
    if (car.blocked > 2.5 && car.honkCd <= 0) this._honk(car, player);

    // move on to the next segment
    if (seg.kind === 'lane' && car.u >= seg.len && car.claim) {
      const conn = net.conn(seg.endNode, seg.d, car.out);
      seg.cars.splice(seg.cars.indexOf(car), 1);
      car.u -= seg.len;
      car.seg = conn;
      conn.cars.push(car);
    } else if (seg.kind === 'conn' && car.u >= seg.len) {
      const lane = net.lane(seg.node, seg.dout);
      seg.cars.splice(seg.cars.indexOf(car), 1);
      car.u -= seg.len;
      car.seg = lane;
      lane.cars.push(car);
      car.release = car.claim; // keep the junction locked until our tail has cleared it
      car.claim = null;
      car.out = this._chooseOut(lane);
    } else if (seg.kind === 'lane' && car.u >= seg.len) {
      car.u = seg.len - 0.01; car.v = 0; // never leave a lane without permission
    }
    if (car.release && car.seg.kind === 'lane' && car.u > car.len / 2 + 0.5) {
      if (car.release.owner === car) car.release.owner = null;
      car.release = null;
    }

    car.seg.pointAt(car.u, this._pt);
    car.x = this._pt.x; car.z = this._pt.z; car.h = this._pt.h;
  }

  _honk(car, player) {
    car.honkCd = 7;
    this.onHonk?.(Math.hypot(car.x - player.x, car.z - player.z));
  }

  // ---- player collision -----------------------------------------------------------------------

  /**
   * Push the player's capsule (three circles of `radius` along `heading`) out of every car and bounce.
   * Mutates pos/vel, returns the strongest impact speed.
   */
  resolve(pos, vel, radius, heading, halfLength) {
    const reach = Math.max(0, halfLength - radius);
    const hs = Math.sin(heading), hc = Math.cos(heading);
    let hit = 0;
    for (const off of reach > 0.2 ? [0, reach, -reach] : [0]) {
      const ox = pos.x + hs * off, oz = pos.z + hc * off;
      let sx = ox, sz = oz;
      for (const car of this.cars) {
        if (!car.seg || car.stolen) continue;
        const dx = sx - car.x, dz = sz - car.z;
        const R = car.len / 2 + radius + 0.5;
        if (dx * dx + dz * dz > R * R) continue;
        const fs = Math.sin(car.h), fc = Math.cos(car.h);
        const lx = dx * fc - dz * fs; // car-local: x = its left, z = its forward
        const lz = dx * fs + dz * fc;
        const hw = car.wid / 2, hl = car.len / 2;
        const ex = lx - clamp(lx, -hw, hw), ez = lz - clamp(lz, -hl, hl);
        const d2 = ex * ex + ez * ez;
        if (d2 >= radius * radius) continue;
        let nlx, nlz, push;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          nlx = ex / d; nlz = ez / d; push = radius - d;
        } else { // centre inside the car: leave through the nearest face
          const px = hw - Math.abs(lx), pz = hl - Math.abs(lz);
          if (px < pz) { nlx = lx >= 0 ? 1 : -1; nlz = 0; push = px + radius; }
          else { nlz = lz >= 0 ? 1 : -1; nlx = 0; push = pz + radius; }
        }
        const nx = nlx * fc + nlz * fs, nz = -nlx * fs + nlz * fc; // back to world space
        sx += nx * push;
        sz += nz * push;
        const vn = (vel.x - car.v * fs) * nx + (vel.z - car.v * fc) * nz; // closing speed
        if (vn < 0) {
          vel.x -= 1.4 * vn * nx;
          vel.z -= 1.4 * vn * nz;
          hit = Math.max(hit, -vn);
          car.stun = 2.5;
          car.v *= 0.25;
          if (-vn > 3 && car.honkCd <= 0) this._honk(car, { x: pos.x, z: pos.z });
        }
      }
      pos.x += sx - ox;
      pos.z += sz - oz;
    }
    return hit;
  }

  /** Return the closest live street vehicle within interaction range. */
  findNearestVehicle(player, maxDistance = 5.6) {
    let best = null;
    let bestDistance = maxDistance;
    for (const car of this.cars) {
      if (!car.seg || car.stolen) continue;
      const distance = Math.hypot(car.x - player.x, car.z - player.z);
      if (distance < bestDistance) {
        best = car;
        bestDistance = distance;
      }
    }
    return best ? { car: best, distance: bestDistance } : null;
  }

  /**
   * Remove a traffic vehicle from lane simulation and hand its transform/type/paint to the
   * player. The caller creates the visible driver exit and the drivable vehicle body.
   */
  takeVehicle(car) {
    if (!car || !car.seg || car.stolen) return null;
    const result = {
      type: car.type,
      occupants: car.occupants || 1,
      x: car.x, z: car.z, h: car.h,
      length: car.len, width: car.wid,
      color: car.color.getHex(),
      speed: car.v,
    };
    this._leave(car);
    car.seg = null;
    car.stolen = true;
    car.v = 0;
    this.renderer.render(this.cars);
    return result;
  }

  setNight(n) { this.renderer.setNight(n); }

  /** Handy for debugging / tests. */
  stats() {
    let moving = 0, waiting = 0, inJunction = 0;
    for (const c of this.cars) { if (c.stolen) continue; if (c.v > 0.5) moving++; else waiting++; if (c.seg && c.seg.kind === 'conn') inJunction++; }
    return { cars: this.cars.length, moving, waiting, inJunction };
  }
}
