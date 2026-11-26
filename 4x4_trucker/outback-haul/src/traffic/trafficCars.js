import { BufferGeometry, BufferAttribute, InstancedMesh, MeshLambertMaterial, MeshBasicMaterial, Object3D, Color } from 'three';
import { lerp } from '../util/math.js';

/** Builds one merged low-poly geometry out of boxes, with per-vertex colours. */
class GeoBuilder {
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

// Vertex colours multiply with the per-car paint colour, so "paint" parts are white and the rest are dark.
const PAINT = [1, 1, 1], TYRE = [0.07, 0.07, 0.08], GLASS = [0.1, 0.14, 0.18];
const HEADLIGHT = [1, 0.95, 0.78], TAILLIGHT = [1, 0.12, 0.08];

function wheels(b, L, W, r, zFrac) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.28, r * 2, r * 2, sx * (W / 2 - 0.1), r, sz * L * zFrac, TYRE);
}
function lamps(l, L, W, y, tailY = y) {
  for (const s of [-1, 1]) {
    l.box(0.34, 0.13, 0.07, s * (W / 2 - 0.32), y, L / 2 + 0.01, HEADLIGHT);
    l.box(0.36, 0.12, 0.07, s * (W / 2 - 0.3), tailY, -L / 2 - 0.01, TAILLIGHT);
  }
}

function car(L, W, cabinLen, cabinShift) {
  const body = new GeoBuilder(), lights = new GeoBuilder();
  wheels(body, L, W, 0.31, 0.32);
  body.box(W, 0.6, L, 0, 0.58, 0, PAINT);
  body.box(W * 0.88, 0.52, L * cabinLen, 0, 1.14, L * cabinShift, PAINT);
  body.box(W * 0.88 + 0.04, 0.3, L * cabinLen + 0.04, 0, 1.16, L * cabinShift, GLASS);
  lamps(lights, L, W, 0.66, 0.7);
  return { body, lights };
}

function van(L, W) {
  const body = new GeoBuilder(), lights = new GeoBuilder();
  wheels(body, L, W, 0.34, 0.3);
  body.box(W, 0.65, L, 0, 0.65, 0, PAINT);
  body.box(W * 0.96, 0.95, L * 0.78, 0, 1.4, -L * 0.08, PAINT);
  body.box(W * 0.88, 0.5, 0.08, 0, 1.5, L * 0.31 + 0.02, GLASS);
  body.box(W * 0.96 + 0.04, 0.3, L * 0.3, 0, 1.55, L * 0.12, GLASS);
  lamps(lights, L, W, 0.75, 0.85);
  return { body, lights };
}

function boxTruck(L, W) {
  const body = new GeoBuilder(), lights = new GeoBuilder();
  wheels(body, L, W, 0.45, 0.3);
  body.box(W * 0.9, 0.35, L, 0, 0.55, 0, TYRE);
  body.box(W * 0.96, 1.2, 2.0, 0, 1.2, L / 2 - 1.2, PAINT);
  body.box(W * 0.84, 0.5, 0.08, 0, 1.45, L / 2 - 0.18, GLASS);
  body.box(W, 2.1, L - 2.5, 0, 1.6, -L / 2 + (L - 2.5) / 2, [0.92, 0.92, 0.92]);
  lamps(lights, L, W, 0.8, 0.9);
  return { body, lights };
}

/** weight = how common. length/width are used for collisions and spacing. */
export const CAR_TYPES = [
  { name: 'sedan', length: 4.5, width: 1.8, weight: 4, speed: 1, build: () => car(4.5, 1.8, 0.5, -0.06) },
  { name: 'hatch', length: 3.8, width: 1.7, weight: 3, speed: 1.05, build: () => car(3.8, 1.7, 0.62, -0.12) },
  { name: 'van', length: 5.2, width: 2.0, weight: 1.5, speed: 0.92, build: () => van(5.2, 2.0) },
  { name: 'truck', length: 7.0, width: 2.3, weight: 0.8, speed: 0.8, build: () => boxTruck(7.0, 2.3) },
];

export const CAR_PAINT = [0xd9d9dc, 0xf2f2f2, 0x1d1f23, 0x8d9299, 0xb3131f, 0x1f4e8c, 0x2f6b3b, 0xd8a31e, 0x7b3f20, 0x5a2a7a, 0xc9c1a8, 0x2e7d8c];

const dummy = new Object3D();

/** One InstancedMesh pair (body + lights) per car type: the whole fleet is ~8 draw calls. */
export class TrafficCarRenderer {
  constructor(group, capacity) {
    this.bodyMat = new MeshLambertMaterial({ vertexColors: true });
    this.lightMat = new MeshBasicMaterial({ vertexColors: true });
    this.types = CAR_TYPES.map((t) => {
      const { body, lights } = t.build();
      const bodyMesh = new InstancedMesh(body.geometry(), this.bodyMat, capacity);
      const lightMesh = new InstancedMesh(lights.geometry(), this.lightMat, capacity);
      bodyMesh.setColorAt(0, new Color(1, 1, 1)); // allocates instanceColor before the first compile
      for (const m of [bodyMesh, lightMesh]) { m.frustumCulled = false; m.count = 0; group.add(m); }
      bodyMesh.castShadow = true;
      return { bodyMesh, lightMesh };
    });
    this.setNight(0);
  }

  render(cars) {
    this.types.forEach(({ bodyMesh, lightMesh }, ti) => {
      let k = 0;
      for (const c of cars) {
        if (c.type !== ti || !c.seg) continue;
        dummy.position.set(c.x, 0, c.z);
        dummy.rotation.set(0, c.h, 0);
        dummy.updateMatrix();
        bodyMesh.setMatrixAt(k, dummy.matrix);
        lightMesh.setMatrixAt(k, dummy.matrix);
        bodyMesh.setColorAt(k, c.color);
        k++;
      }
      bodyMesh.count = lightMesh.count = k;
      bodyMesh.instanceMatrix.needsUpdate = lightMesh.instanceMatrix.needsUpdate = true;
      bodyMesh.instanceColor.needsUpdate = true;
    });
  }

  /** lamps look dim in daylight and bright at night */
  setNight(n) {
    this.lightMat.color.setScalar(lerp(0.5, 1, n));
  }
}
