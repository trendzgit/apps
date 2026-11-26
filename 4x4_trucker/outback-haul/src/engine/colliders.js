/**
 * Spatial hash of simple 2D (top-down) colliders: circles and axis-aligned boxes.
 * Maps register their trees, rocks, buildings, poles here. Each collider is stored in every
 * cell its (padded) bounds touch, so a lookup for the car's cell returns everything it could hit.
 */
const OFFSET = 1024;

export class ColliderGrid {
  constructor(cellSize = 32, pad = 3.5) {
    this.cell = cellSize;
    this.pad = pad; // >= largest vehicle collision radius
    this.cells = new Map();
    this.count = 0;
  }

  _key(ix, iz) {
    return (ix + OFFSET) * 4096 + (iz + OFFSET);
  }

  _insert(x0, z0, x1, z1, item) {
    const c = this.cell;
    const ix0 = Math.floor(x0 / c), ix1 = Math.floor(x1 / c);
    const iz0 = Math.floor(z0 / c), iz1 = Math.floor(z1 / c);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const k = this._key(ix, iz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(item);
      }
    }
    this.count++;
  }

  addCircle(x, z, r) {
    const p = this.pad + r;
    this._insert(x - p, z - p, x + p, z + p, { t: 0, x, z, r });
  }

  /** hw/hd are half-extents along x/z. */
  addBox(x, z, hw, hd) {
    const p = this.pad;
    this._insert(x - hw - p, z - hd - p, x + hw + p, z + hd + p, { t: 1, x, z, hw, hd });
  }

  query(x, z) {
    return this.cells.get(this._key(Math.floor(x / this.cell), Math.floor(z / this.cell))) || EMPTY;
  }

  clear() {
    this.cells.clear();
    this.count = 0;
  }
}

const EMPTY = [];

const _p = { x: 0, z: 0 };

/** Push one sample point out of every static collider near it and bounce `vel`. Returns impact speed. */
function resolvePoint(grid, p, vel, radius) {
  let hit = 0;
  for (const c of grid.query(p.x, p.z)) {
    let nx, nz;
    if (c.t === 0) {
      const R = c.r + radius;
      const dx = p.x - c.x, dz = p.z - c.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2) || 1;
      nx = dx / d; nz = dz / d;
      p.x = c.x + nx * R;
      p.z = c.z + nz * R;
    } else {
      const cx = Math.max(c.x - c.hw, Math.min(c.x + c.hw, p.x));
      const cz = Math.max(c.z - c.hd, Math.min(c.z + c.hd, p.z));
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nx = dx / d; nz = dz / d;
        p.x = cx + nx * radius;
        p.z = cz + nz * radius;
      } else {
        // centre is inside the box: leave through the nearest face
        const px = c.hw - Math.abs(p.x - c.x), pz = c.hd - Math.abs(p.z - c.z);
        if (px < pz) { nx = p.x >= c.x ? 1 : -1; nz = 0; p.x = c.x + nx * (c.hw + radius); }
        else { nz = p.z >= c.z ? 1 : -1; nx = 0; p.z = c.z + nz * (c.hd + radius); }
      }
    }
    const vn = vel.x * nx + vel.z * nz;
    if (vn < 0) {
      vel.x -= 1.4 * vn * nx;
      vel.z -= 1.4 * vn * nz;
      hit = Math.max(hit, -vn);
    }
  }
  return hit;
}

/**
 * Vehicle-vs-world collision. The vehicle is a capsule along its heading: three circles of `radius`
 * (centre, nose, tail) so a long car can't poke its bumper through a wall. Mutates `pos` and `vel`
 * (x/z only) and returns the strongest impact speed (0 if nothing was hit).
 */
export function resolveColliders(grid, pos, vel, radius, heading = 0, halfLength = 0) {
  const reach = Math.max(0, halfLength - radius);
  const fx = Math.sin(heading), fz = Math.cos(heading);
  let hit = 0;
  for (const off of reach > 0.2 ? [0, reach, -reach] : [0]) {
    const sx = pos.x + fx * off, sz = pos.z + fz * off;
    _p.x = sx; _p.z = sz;
    hit = Math.max(hit, resolvePoint(grid, _p, vel, radius));
    pos.x += _p.x - sx;
    pos.z += _p.z - sz;
  }
  return hit;
}
