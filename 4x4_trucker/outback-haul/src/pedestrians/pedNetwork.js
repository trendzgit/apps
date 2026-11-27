/**
 * Walkable graph for a square block grid (the same grid the traffic uses).
 *
 *  - Nodes are the four sidewalk CORNERS of every junction, one per adjoining block.
 *  - 'walk' edges run along a block's sidewalk between two junctions.
 *  - 'cross' edges cross one road arm at its zebra crossing (6-9 m from the junction centre).
 *
 * A pedestrian only ever leaves the sidewalk on a 'cross' edge, and only when that road's signal
 * is red for long enough (see PedestrianSystem).
 */
export class PedNetwork {
  /** @param cfg {pitch, roadWidth, min, max, sidewalkOffset?}  (junction indices min..max inclusive) */
  constructor({ pitch, roadWidth, min, max, sidewalkOffset }) {
    this.pitch = pitch;
    this.min = min;
    this.max = max;
    this.count = max - min + 1;
    this.offset = sidewalkOffset ?? roadWidth / 2 + 2.6; // centre line of the sidewalk, from the road centre
    this.slots = new Array(this.count * this.count * 4).fill(null);
    this.nodes = [];
    this.edges = [];
    this.walkEdges = [];

    // a corner only exists if the block in that quadrant exists
    const blockOk = (i, j, sx, sz) => {
      const bi = i + (sx > 0 ? 0 : -1), bj = j + (sz > 0 ? 0 : -1);
      return bi >= min && bi <= max - 1 && bj >= min && bj <= max - 1;
    };
    for (let i = min; i <= max; i++) {
      for (let j = min; j <= max; j++) {
        for (const sz of [-1, 1]) {
          for (const sx of [-1, 1]) {
            if (!blockOk(i, j, sx, sz)) continue;
            const node = { i, j, sx, sz, x: i * pitch + sx * this.offset, z: j * pitch + sz * this.offset, edges: [] };
            this.slots[this._slot(i, j, sx, sz)] = node;
            this.nodes.push(node);
          }
        }
      }
    }

    // sidewalk edges along each block side
    for (const node of this.nodes) {
      if (node.sx > 0) this._link(node, this.corner(node.i + 1, node.j, -1, node.sz), 'walk');
      if (node.sz > 0) this._link(node, this.corner(node.i, node.j + 1, node.sx, -1), 'walk');
    }
    // zebra crossings: one per junction arm that continues (the corners on both sides must exist)
    for (let i = min; i <= max; i++) {
      for (let j = min; j <= max; j++) {
        const jIdx = (i - min) * this.count + (j - min);
        const cross = (a, b, axis) => a && b && this._link(a, b, 'cross', axis, jIdx);
        if (j < max) cross(this.corner(i, j, -1, 1), this.corner(i, j, 1, 1), 1);   // arm toward +z: crossing a z-axis road
        if (j > min) cross(this.corner(i, j, -1, -1), this.corner(i, j, 1, -1), 1); // arm toward -z
        if (i < max) cross(this.corner(i, j, 1, -1), this.corner(i, j, 1, 1), 0);   // arm toward +x: crossing an x-axis road
        if (i > min) cross(this.corner(i, j, -1, -1), this.corner(i, j, -1, 1), 0); // arm toward -x
      }
    }
  }

  _slot(i, j, sx, sz) { return ((i - this.min) * this.count + (j - this.min)) * 4 + (sx > 0 ? 1 : 0) + (sz > 0 ? 2 : 0); }

  corner(i, j, sx, sz) {
    if (i < this.min || i > this.max || j < this.min || j > this.max) return null;
    return this.slots[this._slot(i, j, sx, sz)];
  }

  _link(a, b, kind, axis = -1, jIdx = -1) {
    if (!a || !b) return;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const edge = { a, b, len, kind, axis, jIdx, ux: (b.x - a.x) / len, uz: (b.z - a.z) / len };
    a.edges.push(edge);
    b.edges.push(edge);
    this.edges.push(edge);
    if (kind === 'walk') this.walkEdges.push(edge);
  }
}
