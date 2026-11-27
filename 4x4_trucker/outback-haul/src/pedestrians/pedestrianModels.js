import { InstancedMesh, MeshLambertMaterial, Matrix4, Quaternion, Euler, Vector3, Color } from 'three';
import { GeoBuilder } from '../util/geoBuilder.js';

const WHITE = [1, 1, 1], HAIR = [0.14, 0.11, 0.1];

export const SHIRTS = [0xc0392b, 0x2980b9, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xecf0f1, 0x34495e, 0xe67e22, 0x16a085, 0xe84393, 0x7f8c8d, 0x2c3e50];
export const PANTS = [0x2c3e50, 0x34495e, 0x1b1b1f, 0x6d5a45, 0x4a5568, 0x8a96a3];
export const SKINS = [0xf2c9a5, 0xe0ac86, 0xc68642, 0x8d5524, 0x5c3a21];

const geo = (fn) => { const b = new GeoBuilder(); fn(b); return b.geometry(); };

/**
 * Each body part is its own InstancedMesh so legs and arms can swing independently, which is what
 * makes the walk cycle. `pivot` is the joint (hip / shoulder) the part rotates around, `swing` the
 * direction of its swing (legs and arms alternate), `tint` which per-person colour it takes.
 */
const PARTS = [
  { name: 'torso', tint: 'shirt', pivot: [0, 0, 0], swing: 0, geometry: geo((b) => b.box(0.36, 0.6, 0.2, 0, 1.18, 0, WHITE)) },
  {
    name: 'head', tint: 'skin', pivot: [0, 0, 0], swing: 0,
    geometry: geo((b) => { b.box(0.2, 0.22, 0.2, 0, 1.62, 0, WHITE); b.box(0.215, 0.07, 0.215, 0, 1.725, -0.005, HAIR); }),
  },
  { name: 'legL', tint: 'pants', pivot: [-0.1, 0.88, 0], swing: 1, geometry: geo((b) => b.box(0.15, 0.88, 0.16, 0, -0.44, 0, WHITE)) },
  { name: 'legR', tint: 'pants', pivot: [0.1, 0.88, 0], swing: -1, geometry: geo((b) => b.box(0.15, 0.88, 0.16, 0, -0.44, 0, WHITE)) },
  { name: 'armL', tint: 'shirt', pivot: [-0.24, 1.46, 0], swing: -1, geometry: geo((b) => b.box(0.1, 0.58, 0.12, 0, -0.29, 0, WHITE)) },
  { name: 'armR', tint: 'shirt', pivot: [0.24, 1.46, 0], swing: 1, geometry: geo((b) => b.box(0.1, 0.58, 0.12, 0, -0.29, 0, WHITE)) },
];

const base = new Matrix4(), local = new Matrix4(), rot = new Matrix4(), out = new Matrix4();
const quat = new Quaternion(), euler = new Euler(0, 0, 0, 'YXZ'), pos = new Vector3(), scl = new Vector3();
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/** Renders `capacity` pedestrians; instance slot i always belongs to pedestrian i. */
export class PedestrianRenderer {
  constructor(group, capacity) {
    this.capacity = capacity;
    const material = new MeshLambertMaterial({ vertexColors: true });
    this.meshes = PARTS.map((part) => {
      const mesh = new InstancedMesh(part.geometry, material, Math.max(1, capacity));
      mesh.setColorAt(0, new Color(1, 1, 1)); // allocate instanceColor before first compile
      mesh.frustumCulled = false;
      mesh.castShadow = part.name === 'torso';
      for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, HIDDEN);
      group.add(mesh);
      return mesh;
    });
  }

  /** (Re)colour pedestrian i. */
  setLook(i, look) {
    PARTS.forEach((part, k) => this.meshes[k].setColorAt(i, look[part.tint]));
    this.colorsDirty = true;
  }

  /** @param peds array with x, z, yaw, pitch, lift, scale, phase, swing, visible */
  update(peds) {
    for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      if (!p.visible) { for (const m of this.meshes) m.setMatrixAt(i, HIDDEN); continue; }
      euler.set(p.pitch, p.yaw, 0);
      quat.setFromEuler(euler);
      pos.set(p.x, p.lift, p.z);
      scl.setScalar(p.scale);
      base.compose(pos, quat, scl);
      const stride = Math.sin(p.phase) * 0.62 * p.swing;
      PARTS.forEach((part, k) => {
        if (part.swing) {
          local.makeTranslation(part.pivot[0], part.pivot[1], part.pivot[2]);
          rot.makeRotationX(stride * part.swing);
          local.multiply(rot);
          out.multiplyMatrices(base, local);
        } else out.copy(base);
        this.meshes[k].setMatrixAt(i, out);
      });
    }
    for (const m of this.meshes) {
      m.instanceMatrix.needsUpdate = true;
      if (this.colorsDirty && m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.colorsDirty = false;
  }
}
