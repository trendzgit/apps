import { BufferGeometry, BufferAttribute } from 'three';

/** Builds one merged low-poly geometry out of boxes, with per-vertex colours. */
export class GeoBuilder {
  constructor() { this.pos = []; this.nrm = []; this.col = []; }

  box(w, h, d, x, y, z, color) {
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const faces = [
      [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [0, 0, 1]],
      [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [0, 0, -1]],
      [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [1, 0, 0]],
      [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-1, 0, 0]],
      [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [0, 1, 0]],
    ];
    for (const f of faces) {
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const p = f[i];
        this.pos.push(p[0] + x, p[1] + y, p[2] + z);
        this.nrm.push(...f[4]);
        this.col.push(...color);
      }
    }
  }

  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    return g;
  }
}
