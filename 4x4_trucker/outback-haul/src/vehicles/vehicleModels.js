import {
  Group, Mesh, Shape, ExtrudeGeometry, BoxGeometry, TorusGeometry, CylinderGeometry, Box3, Vector3,
  MeshPhongMaterial, MeshBasicMaterial,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { lambert } from '../util/materials.js';

/** @returns {{group: Group, wheels: Mesh[], cockpit: Group|null, lamp: any, extOn: boolean|undefined}} */
export function createVehicleVisual(def) {
  const visual = def.detailed ? buildDetailedCar(def) : buildBoxVehicle(def);
  visual.group.rotation.order = 'YXZ';
  return visual;
}

function addBox(parent, w, h, d, material, x, y, z) {
  const m = new Mesh(new BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** Simple, readable box vehicles (Ute / Truck / Quad). */
function buildBoxVehicle(def) {
  const group = new Group();
  const wheels = [];
  const base = def.wheelRadius + 0.25;
  const W = def.width, L = def.length;
  const c = def.cabin, load = def.load;

  addBox(group, W, 0.7, L, lambert(def.color), 0, base + 0.35, 0);
  addBox(group, W * 0.92, c.height, L * c.length, lambert(c.color ?? 0x33414d), 0, base + 0.7 + c.height / 2, L * c.z);
  if (c.height > 0.5) addBox(group, W * 0.94, 0.08, L * c.length, lambert(def.color), 0, base + 0.74 + c.height, L * c.z);
  if (load) addBox(group, W * 0.96, load.height, L * load.length, lambert(load.color ?? def.color), 0, base + 0.7 + load.height / 2, L * load.z);

  const tyre = lambert(0x1c1c1c);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new Mesh(new CylinderGeometry(def.wheelRadius, def.wheelRadius, W * 0.2 + 0.15, 14).rotateZ(Math.PI / 2), tyre);
      wheel.position.set(sx * (W / 2 + 0.02), def.wheelRadius, sz * L * def.wheelFactor);
      wheel.castShadow = true;
      group.add(wheel);
      wheels.push(wheel);
    }
  }
  return { group, wheels, cockpit: null, lamp: null, extOn: undefined };
}

/** The extruded-profile SUV (first vehicle). */
function buildDetailedCar(def) {
  const group = new Group();
  const wheels = [];
  const paintMat = (c) => new MeshPhongMaterial({ color: c, shininess: 90, specular: 0x888888 });
  const body = paintMat(def.color), trim = paintMat(0x15171a), chrome = paintMat(0xb9bdc2), rubber = paintMat(0x101010);
  const glass = new MeshPhongMaterial({ color: 0x16222c, shininess: 120, specular: 0xaabbcc });
  const headLight = new MeshBasicMaterial({ color: 0xfff4d6 });
  const tailLight = new MeshBasicMaterial({ color: 0xff2a1a });
  const box = (w, h, d, m, x, y, z) => addBox(group, w, h, d, m, x, y, z);

  const extrude = (profile, depth, material) => {
    const shape = new Shape();
    profile.forEach((p, i) => (i ? shape.lineTo(p[0], p[1]) : shape.moveTo(p[0], p[1])));
    const geo = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.09, bevelSegments: 3 });
    geo.rotateY(-Math.PI / 2);
    geo.translate(depth / 2, 0, 0);
    const mesh = new Mesh(geo, material);
    mesh.castShadow = true;
    group.add(mesh);
  };

  // lower body and glasshouse side profiles (z along the car, y up)
  extrude([[-2.1, 0.42], [-2.15, 0.78], [-2.05, 1.08], [-0.2, 1.1], [1.05, 1.1], [1.75, 1], [2.08, 0.9], [2.12, 0.62], [2.05, 0.42]], 1.58, body);
  extrude([[-1.95, 1.06], [-1.55, 1.52], [-1.3, 1.6], [0.45, 1.6], [1, 1.12]], 1.4, glass);
  box(1.5, 0.05, 1.8, trim, 0, 1.71, -0.42); // roof panel
  box(1.86, 0.14, 2, trim, 0, 0.46, 0); // sills
  box(0.95, 0.28, 0.06, trim, 0, 0.74, 2.22); // grille
  box(0.9, 0.07, 0.07, chrome, 0, 0.47, 2.2);
  box(1.5, 0.12, 0.1, trim, 0, 0.5, -2.16); // rear bumper
  box(1.3, 0.08, 0.05, tailLight, 0, 1, -2.2); // tail light bar
  for (const s of [-1, 1]) {
    box(0.5, 0.07, 0.06, headLight, s * 0.62, 0.88, 2.2);
    box(0.12, 0.12, 0.06, headLight, s * 0.72, 0.52, 2.18);
    box(0.35, 0.22, 0.05, tailLight, s * 0.66, 0.95, -2.2);
    box(0.14, 0.1, 0.22, trim, s * 0.98, 1.12, 0.75); // mirrors
    box(0.05, 0.05, 1.6, chrome, s * 0.7, 1.76, -0.5); // roof rails
  }

  const arch = new TorusGeometry(0.46, 0.06, 6, 14, Math.PI).rotateY(Math.PI / 2);
  const tyreGeo = new CylinderGeometry(0.35, 0.35, 0.23, 18).rotateZ(Math.PI / 2);
  const hubGeo = new CylinderGeometry(0.24, 0.24, 0.24, 5).rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new Group();
      const tyre = new Mesh(tyreGeo, rubber);
      const wheelArch = new Mesh(arch, trim);
      tyre.castShadow = true;
      wheel.add(tyre, new Mesh(hubGeo, chrome));
      wheel.position.set(sx * 0.8, 0.35, sz * 1.31);
      wheelArch.position.set(sx * 0.9, 0.35, sz * 1.31);
      group.add(wheel, wheelArch);
      wheels.push(wheel);
    }
  }
  return { group, wheels, cockpit: null, lamp: null, extOn: undefined };
}

/**
 * Optional: replace the procedural body with ./models/<model>.glb if the file exists.
 * Silently does nothing when it doesn't (404 or parse error).
 */
export function tryLoadGlb(def, visual) {
  const source = def.modelUrl || ('./models/' + def.model + '.glb');
  new GLTFLoader().load(
    source,
    (gltf) => {
      const model = gltf.scene;
      const box = new Box3().setFromObject(model);
      const size = box.getSize(new Vector3());
      const scaleX = def.width / Math.max(size.x, 0.001);
      const scaleZ = def.length / Math.max(size.z, 0.001);
      const scaleY = Math.min(scaleX, scaleZ);
      const wheelNodes = ['wheel_rr', 'wheel_fr', 'wheel_rl', 'wheel_fl'].map((n) => model.getObjectByName(n));
      const hasWheels = wheelNodes.every(Boolean);

      // The Kenney GLBs are complete vehicle models (including their own wheels),
      // so hide all procedural body/wheel meshes but preserve the independent cockpit.
      const keep = new Set();
      visual.cockpit?.traverse((o) => keep.add(o));
      visual.group.traverse((o) => {
        if (o.isMesh && !keep.has(o)) { o.visible = false; o.userData.hidden = true; }
      });

      model.scale.set(scaleX, scaleY, scaleZ);
      model.position.set(-((box.min.x + box.max.x) / 2) * scaleX, -box.min.y * scaleY, -((box.min.z + box.max.z) / 2) * scaleZ);
      model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      visual.group.add(model);

      if (hasWheels) {
        wheelNodes.forEach((w) => { w.userData.baseY = w.position.y; w.userData.unit = 1 / Math.max(scaleX, scaleZ); });
        visual.wheels = wheelNodes;
      }
    },
    undefined,
    () => {},
  );
}
