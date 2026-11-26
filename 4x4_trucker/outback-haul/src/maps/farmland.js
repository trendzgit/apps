import {
  Mesh, MeshStandardMaterial, MeshLambertMaterial, InstancedMesh, BoxGeometry, CylinderGeometry,
  IcosahedronGeometry, DodecahedronGeometry,
} from 'three';
import { clamp, smoothstep, makeRng } from '../util/math.js';
import { createTerrainGeometry, createGroundTexture } from './builders/terrain.js';
import { placeInstance } from './builders/instancing.js';

/**
 * MAP 3 - Green Valley. Rolling farmland: a patchwork of crop fields (wheat, pasture, ploughed mud),
 * winding gravel roads between five farms, barns, silos, hay bales and scattered trees.
 */

const SIZE = 1000;
const FARMS = [
  { name: 'Maple Farm', x: 0, z: 0 },
  { name: 'Brook Mill', x: 240, z: 200 },
  { name: 'Hillcrest Barn', x: -230, z: 240 },
  { name: 'Orchard Gate', x: 170, z: -260 },
  { name: 'Stone Bridge', x: -280, z: -210 },
];
// road links (indices into FARMS). Each gets a gentle S-bend.
const ROADS = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 3], [2, 4]];
const ROAD_HALF_WIDTH = 3.4;

const farmBlend = (x, z) => {
  let t = 1;
  for (const f of FARMS) t = Math.min(t, smoothstep(22, 62, Math.hypot(x - f.x, z - f.z)));
  return t; // 0 in the farmyard, 1 out in the fields
};

/** Distance from (x,z) to the nearest wiggly road centreline. */
function roadDistance(x, z) {
  let best = 1e9;
  for (let i = 0; i < ROADS.length; i++) {
    const a = FARMS[ROADS[i][0]], b = FARMS[ROADS[i][1]];
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz, len = Math.sqrt(len2);
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / len2);
    const bend = Math.sin(t * len * 0.026 + i * 1.7) * 14 * Math.sin(Math.PI * t);
    const px = a.x + dx * t + (-dz / len) * bend;
    const pz = a.z + dz * t + (dx / len) * bend;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  return best;
}

const hash = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Field type: 0 crops, 1 wheat, 2 ploughed, 3 pasture. Fields are 90 x 70 m cells. */
const fieldAt = (x, z) => {
  const h = hash(Math.floor(x / 90), Math.floor(z / 70));
  return h < 0.3 ? 0 : h < 0.55 ? 1 : h < 0.72 ? 2 : 3;
};

const heightAt = (x, z) =>
  (5 * Math.sin(x * 0.008) * Math.cos(z * 0.009) + 2.5 * Math.sin(x * 0.021 + z * 0.017) + 1.2 * Math.sin(z * 0.05) * Math.sin(x * 0.043)) *
  farmBlend(x, z);

/** 0 gravel (roads + farmyards), 1 grass/crops, 2 ploughed mud */
function surfaceAt(x, z) {
  if (farmBlend(x, z) < 0.5 || roadDistance(x, z) < ROAD_HALF_WIDTH) return 0;
  return fieldAt(x, z) === 2 ? 2 : 1;
}

const FIELD_COLOR = [[0.3, 0.52, 0.2], [0.82, 0.72, 0.32], [0.36, 0.26, 0.17], [0.27, 0.45, 0.19]];
const ROAD_COLOR = [0.56, 0.47, 0.35];
const YARD_COLOR = [0.6, 0.53, 0.42];

function terrainColor(x, z) {
  const shade = 0.88 + 0.12 * Math.sin(x * 0.7) * Math.sin(z * 0.6) + 0.06 * Math.sin(x * 0.11) * Math.cos(z * 0.13);
  const yard = 1 - smoothstep(0.35, 0.75, farmBlend(x, z));
  const road = 1 - smoothstep(ROAD_HALF_WIDTH - 0.8, ROAD_HALF_WIDTH + 0.6, roadDistance(x, z));
  const field = FIELD_COLOR[fieldAt(x, z)];
  return [0, 1, 2].map((k) => {
    let c = field[k] + (YARD_COLOR[k] - field[k]) * yard;
    c = c + (ROAD_COLOR[k] - c) * road;
    return c * shade;
  });
}

function minimapColor(x, z) {
  const c = terrainColor(x, z);
  const hill = clamp(1 + (heightAt(x, z) - heightAt(x + 8, z + 8)) * 0.1, 0.65, 1.35);
  return c.map((v) => Math.min(255, v * 255 * hill));
}

export default {
  id: 'farmland',
  name: 'Green Valley',
  tagline: 'Patchwork fields, gravel lanes and five farms.',
  size: SIZE,
  bound: 480,
  physicsDivisions: 200,
  spawn: { x: 0, z: -14, h: 0, name: 'Maple Farm' },
  locations: FARMS,
  economy: { minDistance: 130, distancePerLevel: 45, maxDistance: 520 },
  atmosphere: {
    fogDensity: 0.003,
    dayHorizon: [0.78, 0.86, 0.93],
    dayZenith: [0.2, 0.5, 0.86],
    duskHorizon: [0.96, 0.62, 0.4],
  },
  surfaces: [
    { name: 'Gravel', grip: 1, drag: 1, shake: 0.012, dust: 0xc8b898, tireFreq: 1000, tireGain: 1 },
    { name: 'Grass', grip: 0.85, drag: 1.5, shake: 0.02, dust: 0x8a9a5a, tireFreq: 500, tireGain: 0.9 },
    { name: 'Ploughed soil', grip: 0.6, drag: 2, shake: 0.03, dust: 0x5a4332, tireFreq: 260, tireGain: 0.8 },
  ],
  heightAt,
  surfaceAt,
  minimapColor,

  build({ group, colliders, low }) {
    const rng = makeRng(21);
    const lambert = (c) => new MeshLambertMaterial({ color: c });

    const tex = createGroundTexture(rng);
    const ground = new Mesh(
      createTerrainGeometry({ size: SIZE, segments: 200, heightAt, colorAt: terrainColor }),
      new MeshStandardMaterial({ vertexColors: true, map: tex, bumpMap: low ? null : tex, bumpScale: 0.8, roughness: 1, metalness: 0 }),
    );
    ground.receiveShadow = true;
    group.add(ground);

    // ---- scatter: trees, rocks, hay bales -----------------------------------------------------
    const TREES = 380, ROCKS = 90, BALES = 70;
    const trunks = new InstancedMesh(new CylinderGeometry(0.3, 0.45, 4, 6), lambert(0x6b4f3a), TREES);
    const crowns = new InstancedMesh(new IcosahedronGeometry(2.8, 1), lambert(0x4e8a3e), TREES);
    const crowns2 = new InstancedMesh(new IcosahedronGeometry(2.2, 1), lambert(0x5f9a48), TREES);
    const rocks = new InstancedMesh(new DodecahedronGeometry(1, 1), lambert(0x8c8c88), ROCKS);
    const bales = new InstancedMesh(new CylinderGeometry(0.95, 0.95, 1.5, 12).rotateZ(Math.PI / 2), lambert(0xd8be5a), BALES);

    const spot = () => [(rng() - 0.5) * 960, (rng() - 0.5) * 960];
    const free = (x, z) => farmBlend(x, z) >= 1 && roadDistance(x, z) > 7;
    const put = (mesh, i, x, z, scale, yOffset, yScale = 1) =>
      placeInstance(mesh, i, { x, z, y: heightAt(x, z), scale, yOffset, yScale, yaw: rng() * 6 });

    for (let n = 0; n < TREES; ) {
      const [x, z] = spot();
      if (!free(x, z)) continue;
      const s = 0.8 + rng() * 0.7;
      put(trunks, n, x, z, s, 2, 1);
      put(crowns, n, x, z, s, 5.6, 0.85);
      put(crowns2, n, x + 1.4 * s, z - 0.9 * s, s * 0.8, 4.7, 0.85);
      colliders.addCircle(x, z, 0.65 * s);
      n++;
    }
    for (let n = 0; n < ROCKS; ) {
      const [x, z] = spot();
      if (!free(x, z)) continue;
      const s = 0.7 + rng() * 1.6;
      put(rocks, n, x, z, s, 0.2, 0.7);
      colliders.addCircle(x, z, s * 0.9);
      n++;
    }
    for (let n = 0; n < BALES; ) { // only in wheat fields and pasture
      const [x, z] = spot();
      const f = fieldAt(x, z);
      if (!free(x, z) || (f !== 1 && f !== 3)) continue;
      put(bales, n, x, z, 1, 0.95);
      colliders.addCircle(x, z, 1.1);
      n++;
    }
    for (const m of [trunks, crowns, crowns2, rocks, bales]) {
      m.frustumCulled = false;
      m.castShadow = true;
      group.add(m);
    }

    // ---- farms: barn, farmhouse, silo ----------------------------------------------------------
    const roofMat = lambert(0x6e3a2e), barnMat = lambert(0xa5322b), houseMat = lambert(0xeee6d8);
    const siloMat = lambert(0xb9c0c4), houseRoofMat = lambert(0x4a4f57);
    const prismRoof = (width, depth, material) => {
      // a 3-sided cylinder lying along z makes a triangular gable roof
      const r = width / Math.sqrt(3);
      const roof = new Mesh(new CylinderGeometry(r, r, depth, 3).rotateX(-Math.PI / 2), material);
      roof.scale.y = 0.4;
      return { roof, rise: r * 0.5 * 0.4 };
    };
    for (const f of FARMS) {
      const y = heightAt(f.x, f.z);
      const place = (mesh, dx, dy, dz) => {
        mesh.position.set(f.x + dx, y + dy, f.z + dz);
        mesh.castShadow = true;
        group.add(mesh);
      };
      place(new Mesh(new BoxGeometry(16, 8, 12), barnMat), 22, 4, 8);
      const barn = prismRoof(17, 13, roofMat);
      place(barn.roof, 22, 8 + barn.rise, 8);
      colliders.addBox(f.x + 22, f.z + 8, 8, 6);

      place(new Mesh(new BoxGeometry(10, 5, 8), houseMat), -22, 2.5, 10);
      const house = prismRoof(11, 9, houseRoofMat);
      place(house.roof, -22, 5 + house.rise, 10);
      colliders.addBox(f.x - 22, f.z + 10, 5, 4);

      place(new Mesh(new CylinderGeometry(2.6, 2.6, 11, 14), siloMat), 36, 5.5, -6);
      colliders.addCircle(f.x + 36, f.z - 6, 2.8);
    }
  },
};
