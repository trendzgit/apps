import { InstancedMesh, CylinderGeometry, BoxGeometry, MeshLambertMaterial, MeshBasicMaterial, Color, Matrix4 } from 'three';
import { DX, DZ, RX, RZ } from './gridNetwork.js';

const COLORS = [new Color(0.15, 1, 0.3), new Color(1, 0.82, 0.08), new Color(1, 0.12, 0.08)];

/**
 * Traffic-signal masts at the far-right corner of every approach: a pole, a dark head and a lamp
 * that switches green / yellow / red with the network's signal timing.
 */
export class SignalsView {
  constructor(group, net, colliders) {
    this.net = net;
    this.heads = [];
    for (const node of net.nodes) {
      for (let d = 0; d < 4; d++) {
        if (!net.hasNode(node.i - DX[d], node.j - DZ[d])) continue; // nobody arrives from there
        this.heads.push({
          node, axis: d & 1, state: -1,
          x: node.x + DX[d] * 7.6 + RX[d] * 7.3,
          z: node.z + DZ[d] * 7.6 + RZ[d] * 7.3,
          lx: -DX[d] * 0.36, lz: -DZ[d] * 0.36, // lamp sits on the side facing oncoming cars
        });
      }
    }
    const n = this.heads.length;
    const metal = new MeshLambertMaterial({ color: 0x3a3e44 });
    const poles = new InstancedMesh(new CylinderGeometry(0.1, 0.13, 5.6, 6), metal, n);
    const boxes = new InstancedMesh(new BoxGeometry(0.62, 1.4, 0.62), metal, n);
    this.lamps = new InstancedMesh(new BoxGeometry(0.44, 0.44, 0.44), new MeshBasicMaterial({ color: 0xffffff, fog: false }), n);
    this.lamps.setColorAt(0, COLORS[0]);
    const m = new Matrix4();
    this.heads.forEach((h, i) => {
      poles.setMatrixAt(i, m.makeTranslation(h.x, 2.8, h.z));
      boxes.setMatrixAt(i, m.makeTranslation(h.x, 5.3, h.z));
      this.lamps.setMatrixAt(i, m.makeTranslation(h.x + h.lx, 5.55, h.z + h.lz));
      colliders.addCircle(h.x, h.z, 0.2);
    });
    for (const mesh of [poles, boxes, this.lamps]) { mesh.frustumCulled = false; group.add(mesh); }
    poles.castShadow = true;
  }

  update(time) {
    let dirty = false;
    this.heads.forEach((h, i) => {
      const s = this.net.signal(h.node, h.axis, time);
      if (s !== h.state) { h.state = s; this.lamps.setColorAt(i, COLORS[s]); dirty = true; }
    });
    if (dirty) this.lamps.instanceColor.needsUpdate = true;
  }
}

