import { Group, Color } from 'three';
import { makeRng, clamp } from '../util/math.js';
import { resolveColliders } from '../engine/colliders.js';
import { PedNetwork } from './pedNetwork.js';
import { PedestrianRenderer, SHIRTS, PANTS, SKINS } from './pedestrianModels.js';

const RADIUS = 0.3;            // collision radius of a person
const CROSS_NEEDS_RED = 10.5;  // seconds of red they need left before stepping off the kerb (crossing takes ~8 s)
const CROSS_SPEED = 1.6;
const HURRY_SPEED = 3.4;       // when the light is about to change mid-crossing
const FLEE_SPEED = 4.8;
const LOOK_RADIUS = 11;        // a moving car this close to the crossing makes people wait
const MIN_HIT_SPEED = 2.5;     // m/s: faster than this knocks a pedestrian down

const lerpAngle = (a, b, t) => {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
};

/**
 * Pedestrians on the sidewalks of a grid city.
 *  - walk the sidewalk network, choosing a random way at every corner
 *  - cross roads only at zebra crossings, only when that road's signal has been red long enough
 *  - dodge a car that's speeding toward them; cars (AI) stop for people in their path
 *  - if the player hits one, they get knocked down (no gore), get back up and carry on; the player is fined
 *  - a "bubble" around the player: far-away people are re-spawned out of sight
 */
export class PedestrianSystem {
  constructor({ config, traffic, group, colliders, onHit = null, seed = 4242 }) {
    this.traffic = traffic;       // for the signal clock + timing
    this.tnet = traffic.net;
    this.net = new PedNetwork(config);
    this.colliders = colliders;
    this.onHit = onHit;
    this.rng = makeRng(seed);
    this.count = config.count ?? 60;
    this.bubble = config.bubble ?? 200;
    this.fine = config.fine ?? 50;
    this.root = new Group();
    group.add(this.root);
    this.renderer = new PedestrianRenderer(this.root, this.count);
    this._tmp = { x: 0, z: 0 };
    this._v = { x: 0, z: 0 };

    const pick = (list) => list[(this.rng() * list.length) | 0];
    this.peds = [];
    for (let i = 0; i < this.count; i++) {
      const p = {
        i, x: 0, z: 0, yaw: 0, pitch: 0, lift: 0, scale: 0.92 + this.rng() * 0.16, phase: this.rng() * 6, swing: 0,
        visible: false, speed: 1.1 + this.rng() * 0.55, lat: (this.rng() - 0.5) * 1.2,
        edge: null, fwd: true, s: 0, state: 'walk', t: 0, checkT: this.rng() * 0.25, vx: 0, vz: 0, hitCd: 0,
        look: { shirt: new Color(pick(SHIRTS)), pants: new Color(pick(PANTS)), skin: new Color(pick(SKINS)) },
      };
      this.renderer.setLook(i, p.look);
      this.peds.push(p);
    }
  }

  populate(player) {
    for (const p of this.peds) this.respawn(p, player, 40, this.bubble * 0.9, false);
    this.renderer.update(this.peds);
  }

  // ---- placement ------------------------------------------------------------------------------

  _target(p, out) {
    const e = p.edge, a = p.fwd ? e.a : e.b;
    const ux = p.fwd ? e.ux : -e.ux, uz = p.fwd ? e.uz : -e.uz;
    const lat = p.lat * (e.kind === 'cross' ? 0.4 : 1); // stay inside the zebra stripes
    out.x = a.x + ux * p.s - uz * lat;
    out.z = a.z + uz * p.s + ux * lat;
  }

  respawn(p, player, minD, maxD, preferBehind) {
    const edges = this.net.walkEdges;
    const fx = Math.sin(player.h), fz = Math.cos(player.h);
    for (let attempt = 0; attempt < 40; attempt++) {
      p.edge = edges[(this.rng() * edges.length) | 0];
      p.fwd = this.rng() < 0.5;
      p.s = this.rng() * p.edge.len;
      this._target(p, this._tmp);
      const dx = this._tmp.x - player.x, dz = this._tmp.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < minD || d > maxD) continue;
      if (preferBehind && attempt < 25 && (dx * fx + dz * fz) / d > 0.3) continue; // keep pop-in out of view
      p.x = this._tmp.x; p.z = this._tmp.z;
      p.yaw = Math.atan2(p.fwd ? p.edge.ux : -p.edge.ux, p.fwd ? p.edge.uz : -p.edge.uz);
      p.state = 'walk'; p.t = 0; p.pitch = 0; p.lift = 0; p.hitCd = 0; p.visible = true;
      return true;
    }
    return false;
  }

  /** After being knocked about, put the pedestrian back on the nearest walkway. */
  _snap(p) {
    let best = null, bestD = 1e9, bestT = 0;
    for (const e of this.net.edges) {
      const t = clamp((p.x - e.a.x) * e.ux + (p.z - e.a.z) * e.uz, 0, e.len);
      const dx = p.x - (e.a.x + e.ux * t), dz = p.z - (e.a.z + e.uz * t);
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = e; bestT = t; }
    }
    p.fwd = best.ux * Math.sin(p.yaw) + best.uz * Math.cos(p.yaw) >= 0; // keep walking the way we faced
    p.edge = best;
    p.s = p.fwd ? bestT : best.len - bestT;
    p.state = 'walk'; p.t = 0; p.pitch = 0; p.lift = 0;
  }

  // ---- simulation -----------------------------------------------------------------------------

  update(dt, player) {
    for (const p of this.peds) if (p.visible) this._step(p, dt, player);
    for (const p of this.peds) {
      if (!p.visible || Math.hypot(p.x - player.x, p.z - player.z) > this.bubble) this.respawn(p, player, 90, this.bubble * 0.95, true);
    }
    this.renderer.update(this.peds);
  }

  _step(p, dt, player) {
    p.t += dt;
    p.hitCd -= dt;
    switch (p.state) {
      case 'walk': this._walk(p, dt, player); break;
      case 'wait': this._wait(p, dt, player); break;
      case 'flee': this._flee(p, dt); break;
      default: this._down(p, dt);
    }
    this._v.x = this._v.z = 0; // keep people out of walls, poles and trees
    resolveColliders(this.colliders, p, this._v, RADIUS);
  }

  /** -1/+1 = sidestep this way, 0 = no danger. A fast car heading at us within a few metres. */
  _threat(p, player) {
    const speed = Math.abs(player.v);
    if (speed < 3) return 0;
    const fs = Math.sin(player.h), fc = Math.cos(player.h);
    const dx = p.x - player.x, dz = p.z - player.z;
    const along = (dx * fs + dz * fc) * Math.sign(player.v);
    const lat = dx * fc - dz * fs;
    if (along > 1 && along < 6 + speed * 0.8 && Math.abs(lat) < player.width / 2 + 1.3) {
      return Math.abs(lat) < 0.15 ? (this.rng() < 0.5 ? 1 : -1) : Math.sign(lat);
    }
    return 0;
  }

  _startFlee(p, side, player) {
    const fs = Math.sin(player.h), fc = Math.cos(player.h);
    p.state = 'flee';
    p.t = 0;
    p.vx = fc * side * FLEE_SPEED;
    p.vz = -fs * side * FLEE_SPEED;
  }

  _move(p, dt) {
    this._target(p, this._tmp);
    const k = 1 - Math.exp(-9 * dt);
    p.x += (this._tmp.x - p.x) * k;
    p.z += (this._tmp.z - p.z) * k;
    const e = p.edge;
    p.yaw = lerpAngle(p.yaw, Math.atan2(p.fwd ? e.ux : -e.ux, p.fwd ? e.uz : -e.uz), 1 - Math.exp(-8 * dt));
  }

  /** "Look both ways": is any moving car close to this crossing? (Cars stopped at a red light don't count.) */
  _carsNear(edge) {
    const mx = (edge.a.x + edge.b.x) / 2, mz = (edge.a.z + edge.b.z) / 2;
    for (const c of this.traffic.cars) {
      if (!c.seg || c.v < 0.3) continue;
      const dx = c.x - mx, dz = c.z - mz;
      if (dx * dx + dz * dz < LOOK_RADIUS * LOOK_RADIUS) return true;
    }
    return false;
  }

  _canCross(edge, player) {
    const junction = this.tnet.nodes[edge.jIdx];
    if (this.tnet.redRemaining(junction, edge.axis, this.traffic.time) < CROSS_NEEDS_RED) return false;
    if (this._carsNear(edge)) return false;
    if (Math.abs(player.v) > 3) { // be careful of a speeding car heading for the crossing
      const dx = (edge.a.x + edge.b.x) / 2 - player.x, dz = (edge.a.z + edge.b.z) / 2 - player.z;
      if (dx * dx + dz * dz < 1600 && (dx * Math.sin(player.h) + dz * Math.cos(player.h)) * Math.sign(player.v) > 0) return false;
    }
    return true;
  }

  _walk(p, dt, player) {
    const side = this._threat(p, player);
    if (side) return this._startFlee(p, side, player);

    const e = p.edge;
    let v = p.speed;
    if (e.kind === 'cross') {
      v = Math.max(p.speed, CROSS_SPEED);
      if (this.tnet.redRemaining(this.tnet.nodes[e.jIdx], e.axis, this.traffic.time) < 4.5) v = HURRY_SPEED;
    }
    p.s += v * dt;
    p.phase += v * dt * 3.3;
    p.swing = 1;
    if (p.s >= e.len) this._arrive(p, p.s - e.len, player);
    this._move(p, dt);
  }

  _arrive(p, over, player) {
    const e = p.edge, node = p.fwd ? e.b : e.a;
    const options = node.edges.filter((o) => o !== e);
    let next, fwd;
    if (!options.length) { next = e; fwd = !p.fwd; } // dead end: turn round
    else {
      const w = options.map((o) => (o.kind === 'cross' ? 0.55 : 1));
      let r = this.rng() * w.reduce((a, b) => a + b, 0), i = 0;
      while (i < options.length - 1 && r > w[i]) r -= w[i++];
      next = options[i];
      fwd = next.a === node;
    }
    p.edge = next;
    p.fwd = fwd;
    p.s = over;
    if (next.kind === 'cross' && !this._canCross(next, player)) {
      p.state = 'wait';
      p.s = 0;
      p.checkT = 0.25;
    }
  }

  _wait(p, dt, player) {
    const side = this._threat(p, player);
    if (side) return this._startFlee(p, side, player);
    p.swing = 0;
    this._move(p, dt);
    p.checkT -= dt;
    if (p.checkT <= 0) {
      p.checkT = 0.25;
      if (this._canCross(p.edge, player)) p.state = 'walk';
    }
  }

  _flee(p, dt) {
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.yaw = lerpAngle(p.yaw, Math.atan2(p.vx, p.vz), 1 - Math.exp(-14 * dt));
    p.phase += dt * 15;
    p.swing = 1.4;
    if (p.t > 0.8) this._snap(p);
  }

  /** Knocked down: fall (0.3 s), lie (1.7 s), get up (0.9 s), carry on. */
  _down(p, dt) {
    const T = p.t;
    p.swing = 0;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const damp = Math.exp(-3 * dt);
    p.vx *= damp;
    p.vz *= damp;
    if (T < 0.3) { const k = T / 0.3; p.pitch = -1.5 * k; p.lift = 0.2 * k; }
    else if (T < 2.0) { p.pitch = -1.5; p.lift = 0.2; }
    else if (T < 2.9) { const k = (T - 2) / 0.9; p.pitch = -1.5 * (1 - k); p.lift = 0.2 * (1 - k); }
    else this._snap(p);
  }

  // ---- interaction with vehicles ---------------------------------------------------------------

  /**
   * Player collision (same signature as TrafficSystem.resolve). Fast contact knocks the pedestrian down and
   * fines the player; slow contact just nudges them aside. Never bounces the player, so returns 0.
   */
  resolve(pos, vel, radius, heading, halfLength) {
    const speed = Math.hypot(vel.x, vel.z);
    const reach = Math.max(0, halfLength - radius);
    const hs = Math.sin(heading), hc = Math.cos(heading);
    for (const off of reach > 0.2 ? [0, reach, -reach] : [0]) {
      const cx = pos.x + hs * off, cz = pos.z + hc * off;
      for (const p of this.peds) {
        if (!p.visible || p.state === 'down' || p.hitCd > 0) continue;
        const dx = p.x - cx, dz = p.z - cz, R = radius + RADIUS;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        if (speed >= MIN_HIT_SPEED) {
          const k = Math.min(speed * 0.45, 7) / speed;
          p.state = 'down'; p.t = 0; p.hitCd = 5;
          p.vx = vel.x * k; p.vz = vel.z * k;
          vel.x *= 0.94; vel.z *= 0.94; // a thump slows you slightly
          this.onHit?.(speed);
        } else {
          const d = Math.sqrt(d2) || 1;
          p.x = cx + (dx / d) * (R + 0.02);
          p.z = cz + (dz / d) * (R + 0.02);
        }
      }
    }
    return 0;
  }

  /** Distance from a car's front bumper to the nearest person in its path (Infinity if clear). */
  gapAhead(x, z, fs, fc, halfWidth, halfLength, maxAlong) {
    let best = Infinity;
    const reach2 = (maxAlong + 3) * (maxAlong + 3);
    for (const p of this.peds) {
      if (!p.visible) continue;
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz > reach2) continue;
      const along = dx * fs + dz * fc;
      if (along <= 0 || along > maxAlong) continue;
      if (Math.abs(dx * fc - dz * fs) > halfWidth + 1.1) continue; // generous: people step sideways into the road
      best = Math.min(best, along - halfLength - RADIUS);
    }
    return best;
  }

  /** Handy for debugging / tests. */
  stats() {
    const s = { total: this.peds.length, walk: 0, wait: 0, flee: 0, down: 0, crossing: 0 };
    for (const p of this.peds) {
      s[p.state]++;
      if (p.visible && p.edge && p.edge.kind === 'cross' && p.state === 'walk') s.crossing++;
    }
    return s;
  }
}
