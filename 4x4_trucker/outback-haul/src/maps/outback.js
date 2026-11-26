import {
  Mesh, MeshStandardMaterial, MeshLambertMaterial, InstancedMesh, BoxGeometry, CylinderGeometry,
  IcosahedronGeometry, DodecahedronGeometry, ConeGeometry,
} from 'three';
import { clamp, smoothstep, makeRng } from '../util/math.js';
import { createTerrainGeometry, createGroundTexture } from './builders/terrain.js';
import { placeInstance } from './builders/instancing.js';

/** MAP 1 - the original Outback Haul world: red desert, five outback towns. */

const SIZE = 1000;
const TOWNS = [
  { name: 'Dusty Creek', x: 0, z: 0 },
  { name: 'Red Rock', x: 260, z: 180 },
  { name: 'Coober Flat', x: -240, z: 260 },
  { name: 'Mulga Bore', x: 150, z: -280 },
  { name: 'Wilga Well', x: -300, z: -220 },
];

/** 0 inside a town clearing, 1 out in the bush (terrain is flattened near towns). */
const townBlend = (x, z) => {
  let t = 1;
  for (const town of TOWNS) t = Math.min(t, smoothstep(25, 70, Math.hypot(x - town.x, z - town.z)));
  return t;
};

const heightAt = (x, z) =>
  (7 * Math.sin(x * 0.011) * Math.cos(z * 0.013) +
    3.5 * Math.sin(x * 0.031 + z * 0.023) +
    1.4 * Math.sin(z * 0.071) * Math.sin(x * 0.053) +
    2 * Math.sin((x + z) * 0.006)) *
  townBlend(x, z);

/** 0 packed dirt, 1 sand, 2 mud */
const surfaceAt = (x, z) => {
  const t = Math.sin(x * 0.021 + 1) * Math.sin(z * 0.026) + Math.sin(x * 0.012 - z * 0.014);
  return t > 1.05 ? 1 : t < -1.2 ? 2 : 0;
};

const SURFACE_COLOR = [[0.62, 0.29, 0.16], [0.86, 0.7, 0.45], [0.32, 0.22, 0.15]];
const TOWN_COLOR = [0.58, 0.5, 0.4];
const GRASS_COLOR = [0.46, 0.4, 0.2];

function terrainColor(x, z) {
  const town = townBlend(x, z);
  const base = SURFACE_COLOR[surfaceAt(x, z)];
  const patch = Math.sin(x * 0.037 + 2) * Math.sin(z * 0.041) + Math.sin((x - z) * 0.017);
  const grass = surfaceAt(x, z) === 0 ? clamp((patch - 0.5) * 1.5) : 0;
  const shade = 0.85 + 0.15 * Math.sin(x * 0.9) * Math.sin(z * 0.8) + 0.1 * Math.sin(x * 0.13) * Math.cos(z * 0.17);
  return [0, 1, 2].map((k) => ((base[k] + (GRASS_COLOR[k] - base[k]) * grass) * town + TOWN_COLOR[k] * (1 - town)) * shade);
}

const MINIMAP_SURFACE = [[158, 74, 41], [219, 179, 115], [82, 56, 38]];
const MINIMAP_TOWN = [148, 128, 102];

function minimapColor(x, z) {
  const base = MINIMAP_SURFACE[surfaceAt(x, z)];
  const town = townBlend(x, z);
  const hill = clamp(1 + (heightAt(x, z) - heightAt(x + 8, z + 8)) * 0.1, 0.6, 1.4);
  return [0, 1, 2].map((k) => Math.min(255, (base[k] * town + MINIMAP_TOWN[k] * (1 - town)) * hill));
}

export default {
  id: 'outback',
  name: 'Outback',
  tagline: 'Red dust, mud flats and five lonely towns.',
  size: SIZE,
  bound: 480,
  physicsDivisions: 200,
  spawn: { x: 0, z: -12, h: 0, name: 'Dusty Creek' },
  locations: TOWNS,
  economy: {}, // defaults = original balance
  surfaces: [
    { name: 'Packed dirt', grip: 1, drag: 1, shake: 0.012, dust: 0xb88457, tireFreq: 800, tireGain: 1 },
    { name: 'Sand', grip: 0.8, drag: 1.6, shake: 0.02, dust: 0xe4cb97, tireFreq: 2600, tireGain: 1.3 },
    { name: 'Mud', grip: 0.5, drag: 2.2, shake: 0.03, dust: 0x5a4332, tireFreq: 260, tireGain: 0.8 },
  ],
  heightAt,
  surfaceAt,
  minimapColor,

  build({ group, colliders, low }) {
    // NOTE: RNG call order is part of the world's identity. Don't reorder.
    const rng = makeRng(7);

    const groundTexture = createGroundTexture(rng);
    const ground = new Mesh(
      createTerrainGeometry({ size: SIZE, segments: 200, heightAt, colorAt: terrainColor }),
      new MeshStandardMaterial({
        vertexColors: true, map: groundTexture, bumpMap: low ? null : groundTexture,
        bumpScale: 1.2, roughness: 1, metalness: 0,
      }),
    );
    ground.receiveShadow = true;
    group.add(ground);

    const lambert = (c) => new MeshLambertMaterial({ color: c });
    const trunks = new InstancedMesh(new CylinderGeometry(0.25, 0.4, 5, 6), lambert(0xd9cfc0), 420);
    const crowns = new InstancedMesh(new IcosahedronGeometry(2.4, 1), lambert(0x6a8a62), 420);
    const rocks = new InstancedMesh(new DodecahedronGeometry(1, 1), lambert(0x8a5a42), 260);
    const crowns2 = new InstancedMesh(new IcosahedronGeometry(2.4, 1), lambert(0x587a56), 420);
    const bushes = new InstancedMesh(new ConeGeometry(0.7, 0.9, 6), lambert(0xb5a05a), 900);

    const put = (mesh, i, x, z, scale, yOffset, yScale) =>
      placeInstance(mesh, i, { x, z, y: heightAt(x, z), scale, yOffset, yScale, yaw: rng() * 6 });

    // 420 gum trees then 260 rocks, kept clear of the towns
    for (let n = 0; n < 680; ) {
      const x = (rng() - 0.5) * 960, z = (rng() - 0.5) * 960;
      if (townBlend(x, z) < 1) continue;
      if (n < 420) {
        const s = 0.8 + rng() * 0.7;
        put(trunks, n, x, z, s, 2.5, 1);
        put(crowns, n, x, z, s, 5.5, 0.6);
        put(crowns2, n, x + 1.2 * s, z - 0.8 * s, s * 0.75, 4.6, 0.6);
        colliders.addCircle(x, z, 0.7 * s);
      } else {
        const s = 0.8 + rng() * 2;
        put(rocks, n - 420, x, z, s, 0.2, 0.7);
        colliders.addCircle(x, z, s * 0.9);
      }
      n++;
    }
    // 900 spinifex tufts (no collision), none in mud or towns
    for (let n = 0; n < 900; ) {
      const x = (rng() - 0.5) * 960, z = (rng() - 0.5) * 960;
      if (townBlend(x, z) < 1 || surfaceAt(x, z) === 2) continue;
      put(bushes, n++, x, z, 0.6 + rng() * 0.9, 0.4, 1);
    }
    for (const m of [trunks, crowns, crowns2, rocks, bushes]) {
      m.frustumCulled = false;
      m.castShadow = m !== bushes;
      group.add(m);
    }

    // each town: a shed and a water tank
    for (const t of TOWNS) {
      const y = heightAt(t.x, t.z);
      const shed = new Mesh(new BoxGeometry(14, 5, 9), lambert(0xb8c0c4));
      const tank = new Mesh(new CylinderGeometry(2.5, 2.5, 7, 12), lambert(0x9aa7ad));
      shed.position.set(t.x + 18, y + 2.5, t.z + 10);
      tank.position.set(t.x + 30, y + 3.5, t.z - 4);
      shed.castShadow = tank.castShadow = true;
      group.add(shed, tank);
      colliders.addBox(t.x + 18, t.z + 10, 7, 4.5);
      colliders.addCircle(t.x + 30, t.z - 4, 2.6);
    }
  },
};
