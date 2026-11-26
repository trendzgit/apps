/**
 * Lane graph for a square road grid (like the City map).
 *
 *  - Nodes are junctions at (i*pitch, j*pitch).
 *  - Between neighbouring junctions there is one LaneSeg per direction (right-hand traffic).
 *  - Inside a junction a car follows a ConnSeg: a straight line or a quadratic Bezier turn.
 *
 * Directions: 0 = +x, 1 = +z, 2 = -x, 3 = -z.  Heading h means forward = (sin h, cos h), the same
 * convention as the player's car. Turning right from d goes to (d+1)%4, left to (d+3)%4.
 */

export const DX = [1, 0, -1, 0];
export const DZ = [0, 1, 0, -1];
const HEAD = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
export const RX = [0, -1, 0, 1]; // unit vector to the RIGHT of each direction
export const RZ = [1, 0, -1, 0];

export const GREEN = 0, YELLOW = 1, RED = 2;
const G = 11, Y = 2.5, ALL_RED = 1.5;
const PHASE = G + Y + ALL_RED;
const CYCLE = PHASE * 2;

export class LaneSeg {
  constructor(net, node, d) {
    this.kind = 'lane';
    this.d = d;
    this.node = node;                       // the junction this lane leaves
    this.endNode = net.node(node.i + DX[d], node.j + DZ[d]);
    this.len = net.pitch - 2 * net.half;
    this.sx = node.x + DX[d] * net.half + RX[d] * net.laneOffset;
    this.sz = node.z + DZ[d] * net.half + RZ[d] * net.laneOffset;
    this.h = HEAD[d];
    this.cars = [];
  }

  pointAt(u, out) {
    out.x = this.sx + DX[this.d] * u;
    out.z = this.sz + DZ[this.d] * u;
    out.h = this.h;
  }
}

export class ConnSeg {
  constructor(net, node, din, dout) {
    this.kind = 'conn';
    this.node = node;
    this.din = din;
    this.dout = dout;
    this.cars = [];
    const { half, laneOffset } = net;
    const p0x = node.x - DX[din] * half + RX[din] * laneOffset;
    const p0z = node.z - DZ[din] * half + RZ[din] * laneOffset;
    const p1x = node.x + DX[dout] * half + RX[dout] * laneOffset;
    const p1z = node.z + DZ[dout] * half + RZ[dout] * laneOffset;
    this.turn = din === dout ? 0 : dout === (din + 1) % 4 ? 1 : -1; // 0 straight, 1 right, -1 left

    const N = this.turn === 0 ? 1 : 14;
    // control point = where the two lane centrelines cross (the lanes are perpendicular)
    const t = (p1x - p0x) * DX[din] + (p1z - p0z) * DZ[din];
    const kx = p0x + DX[din] * t, kz = p0z + DZ[din] * t;
    this.xs = []; this.zs = []; this.hs = []; this.cum = [0];
    for (let n = 0; n <= N; n++) {
      const s = n / N, a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, c = s * s;
      this.xs.push(a * p0x + b * kx + c * p1x);
      this.zs.push(a * p0z + b * kz + c * p1z);
      const dx = 2 * (1 - s) * (kx - p0x) + 2 * s * (p1x - kx);
      const dz = 2 * (1 - s) * (kz - p0z) + 2 * s * (p1z - kz);
      this.hs.push(Math.atan2(dx || 1e-9, dz));
      if (n) this.cum.push(this.cum[n - 1] + Math.hypot(this.xs[n] - this.xs[n - 1], this.zs[n] - this.zs[n - 1]));
    }
    for (let n = 1; n <= N; n++) { // unwrap the heading so interpolation never spins the long way round
      while (this.hs[n] - this.hs[n - 1] > Math.PI) this.hs[n] -= 2 * Math.PI;
      while (this.hs[n] - this.hs[n - 1] < -Math.PI) this.hs[n] += 2 * Math.PI;
    }
    this.len = this.cum[N];
  }

  pointAt(u, out) {
    const { cum } = this;
    u = Math.max(0, Math.min(this.len, u));
    let n = 1;
    while (n < cum.length - 1 && cum[n] < u) n++;
    const f = (u - cum[n - 1]) / (cum[n] - cum[n - 1] || 1);
    out.x = this.xs[n - 1] + (this.xs[n] - this.xs[n - 1]) * f;
    out.z = this.zs[n - 1] + (this.zs[n] - this.zs[n - 1]) * f;
    out.h = this.hs[n - 1] + (this.hs[n] - this.hs[n - 1]) * f;
  }
}

export class GridNetwork {
  /** @param cfg {pitch, roadWidth, min, max, laneOffset?} (junction indices min..max inclusive) */
  constructor({ pitch, roadWidth, min, max, laneOffset }) {
    this.pitch = pitch;
    this.half = roadWidth / 2;
    this.laneOffset = laneOffset ?? roadWidth / 4;
    this.min = min;
    this.max = max;
    this.count = max - min + 1;
    this.nodes = [];
    for (let i = min; i <= max; i++) {
      for (let j = min; j <= max; j++) {
        const idx = this.nodes.length;
        this.nodes.push({ i, j, idx, x: i * pitch, z: j * pitch, owner: null, phase: ((idx * 7919) % 101) / 101 * CYCLE });
      }
    }
    this.lanes = new Array(this.nodes.length * 4).fill(null);
    this.laneList = [];
    for (const node of this.nodes) {
      for (let d = 0; d < 4; d++) {
        if (!this.hasNode(node.i + DX[d], node.j + DZ[d])) continue;
        const lane = new LaneSeg(this, node, d);
        this.lanes[node.idx * 4 + d] = lane;
        this.laneList.push(lane);
      }
    }
    this.connCache = new Map();
  }

  hasNode(i, j) { return i >= this.min && i <= this.max && j >= this.min && j <= this.max; }
  node(i, j) { return this.nodes[(i - this.min) * this.count + (j - this.min)]; }
  lane(node, d) { return this.lanes[node.idx * 4 + d]; }

  conn(node, din, dout) {
    const key = node.idx * 16 + din * 4 + dout;
    let c = this.connCache.get(key);
    if (!c) this.connCache.set(key, (c = new ConnSeg(this, node, din, dout)));
    return c;
  }

  /** Directions a car arriving at `node` heading `din` may leave in (never a U-turn unless it's the only way). */
  validOuts(node, din) {
    const outs = [];
    for (const d of [din, (din + 1) % 4, (din + 3) % 4]) if (this.lane(node, d)) outs.push(d);
    if (!outs.length) outs.push((din + 2) % 4);
    return outs;
  }

  /** Traffic light for travel along `axis` (0 = x-axis roads, 1 = z-axis roads). */
  signal(node, axis, time) {
    let t = (time + node.phase) % CYCLE;
    t = (t - (axis ? PHASE : 0) + CYCLE) % CYCLE;
    return t < G ? GREEN : t < G + Y ? YELLOW : RED;
  }
}
