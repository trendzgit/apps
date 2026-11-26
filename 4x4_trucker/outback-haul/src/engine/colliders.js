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

/**
 * Push `pos` (x/z) out of any collider and bounce `vel`. Returns the impact speed (0 if none).
 * Same response as the original game: radius = vehicle half-width + 0.4, 1.4x velocity reflection.
 */
export function resolveColliders(grid, pos, vel, radius) {
  let hit = 0;
  for (const c of grid.query(pos.x, pos.z)) {
    let nx, nz;
    if (c.t === 0) {
      const R = c.r + radius;
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2) || 1;
      nx = dx / d; nz = dz / d;
      pos.x = c.x + nx * R;
      pos.z = c.z + nz * R;
    } else {
      const cx = Math.max(c.x - c.hw, Math.min(c.x + c.hw, pos.x));
      const cz = Math.max(c.z - c.hd, Math.min(c.z + c.hd, pos.z));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nx = dx / d; nz = dz / d;
        pos.x = cx + nx * radius;
        pos.z = cz + nz * radius;
      } else {
        // centre is inside the box: leave through the nearest face
        const px = c.hw - Math.abs(pos.x - c.x), pz = c.hd - Math.abs(pos.z - c.z);
        if (px < pz) { nx = pos.x >= c.x ? 1 : -1; nz = 0; pos.x = c.x + nx * (c.hw + radius); }
        else { nz = pos.z >= c.z ? 1 : -1; nx = 0; pos.z = c.z + nz * (c.hd + radius); }
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
