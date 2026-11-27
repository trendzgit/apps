import {
  Mesh, MeshStandardMaterial, MeshLambertMaterial, InstancedMesh, BoxGeometry, CylinderGeometry,
  DodecahedronGeometry, ConeGeometry,
  BufferGeometry, Float32BufferAttribute, CanvasTexture, RepeatWrapping,
  Vector3, CatmullRomCurve3, SphereGeometry, Object3D, Color, DoubleSide,
} from 'three';
import { clamp, smoothstep, makeRng } from '../util/math.js';
import { createTerrainGeometry, createGroundTexture } from './builders/terrain.js';
import { addInstancedNatureSet } from './builders/natureAssets.js';
import { addInstancedLibrarySet } from './builders/libraryAssets.js';

/** MAP 1 - the original Outback Haul world: red desert, five outback towns. */

const SIZE = 1000;
const ROAD_HALF_WIDTH = 4.2;
const ROAD_SHOULDER = 2.6;
const TOWNS = [
  { name: 'Dusty Creek', x: 0, z: 0 },
  { name: 'Red Rock', x: 260, z: 180 },
  { name: 'Coober Flat', x: -240, z: 260 },
  { name: 'Mulga Bore', x: 150, z: -280 },
  { name: 'Wilga Well', x: -300, z: -220 },
];

// Scenic red-dirt routes. The first route runs directly ahead of the starting vehicle.
// Each route is smoothed into a Catmull-Rom spline so it reads as a continuous country road.
const ROAD_PATHS = [
  [[0, -44], [0, -10], [0, 28], [14, 68], [58, 98], [118, 128], [184, 158], [260, 180]],
  [[0, 0], [-34, 38], [-82, 92], [-148, 164], [-240, 260]],
  [[0, 0], [25, -40], [58, -96], [112, -190], [150, -280]],
  [[0, 0], [-42, -36], [-104, -82], [-188, -148], [-300, -220]],
  [[260, 180], [244, 102], [224, 22], [196, -72], [172, -172], [150, -280]],
  [[-240, 260], [-184, 172], [-148, 72], [-186, -34], [-242, -136], [-300, -220]],
];

const ROAD_SAMPLES = ROAD_PATHS.map((points) => {
  const curve = new CatmullRomCurve3(points.map(([x, z]) => new Vector3(x, 0, z)), false, 'centripetal');
  return curve.getPoints(Math.max(72, points.length * 22)).map((p) => ({ x: p.x, z: p.z }));
});
const ROAD_SEGMENTS = ROAD_SAMPLES.flatMap((samples) =>
  samples.slice(1).map((b, i) => ({ a: samples[i], b })),
);
// A small spatial index avoids scanning the entire road network for every terrain vertex.
const ROAD_CELL_SIZE = 24;
const ROAD_QUERY_MARGIN = ROAD_HALF_WIDTH + 8;
const ROAD_GRID = new Map();
for (const segment of ROAD_SEGMENTS) {
  const minX = Math.floor((Math.min(segment.a.x, segment.b.x) - ROAD_QUERY_MARGIN) / ROAD_CELL_SIZE);
  const maxX = Math.floor((Math.max(segment.a.x, segment.b.x) + ROAD_QUERY_MARGIN) / ROAD_CELL_SIZE);
  const minZ = Math.floor((Math.min(segment.a.z, segment.b.z) - ROAD_QUERY_MARGIN) / ROAD_CELL_SIZE);
  const maxZ = Math.floor((Math.max(segment.a.z, segment.b.z) + ROAD_QUERY_MARGIN) / ROAD_CELL_SIZE);
  for (let ix = minX; ix <= maxX; ix++) for (let iz = minZ; iz <= maxZ; iz++) {
    const key = `${ix},${iz}`;
    if (!ROAD_GRID.has(key)) ROAD_GRID.set(key, []);
    ROAD_GRID.get(key).push(segment);
  }
}

/** Distance from the nearest point on the Outback road network. */
function roadDistance(x, z) {
  const candidates = ROAD_GRID.get(`${Math.floor(x / ROAD_CELL_SIZE)},${Math.floor(z / ROAD_CELL_SIZE)}`);
  if (!candidates) return Infinity;
  let bestSq = Infinity;
  for (const { a, b } of candidates) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz;
    const t = lenSq > 0 ? clamp(((x - a.x) * dx + (z - a.z) * dz) / lenSq, 0, 1) : 0;
    const ex = x - (a.x + dx * t), ez = z - (a.z + dz * t);
    const dSq = ex * ex + ez * ez;
    if (dSq < bestSq) bestSq = dSq;
  }
  return Math.sqrt(bestSq);
}

/** 0 inside a town clearing, 1 out in the bush (terrain is flattened near towns). */
const townBlend = (x, z) => {
  let t = 1;
  for (const town of TOWNS) t = Math.min(t, smoothstep(25, 70, Math.hypot(x - town.x, z - town.z)));
  return t;
};

const heightAt = (x, z) =>
  (10 * Math.sin(x * 0.008) * Math.cos(z * 0.009) +
    4.2 * Math.sin(x * 0.021 + z * 0.017) +
    1.2 * Math.sin(z * 0.046) * Math.sin(x * 0.037) +
    2.8 * Math.sin((x + z) * 0.0045)) *
  townBlend(x, z);

/** 0 packed dirt, 1 sand, 2 mud */
const surfaceAt = (x, z) => {
  // The road and its immediate gravel shoulder are always packed dirt.
  if (roadDistance(x, z) <= ROAD_HALF_WIDTH + ROAD_SHOULDER) return 0;
  const t = Math.sin(x * 0.021 + 1) * Math.sin(z * 0.026) + Math.sin(x * 0.012 - z * 0.014);
  return t > 1.05 ? 1 : t < -1.2 ? 2 : 0;
};

const SURFACE_COLOR = [[0.62, 0.29, 0.16], [0.86, 0.7, 0.45], [0.32, 0.22, 0.15]];
const TOWN_COLOR = [0.58, 0.5, 0.4];
const GRASS_COLOR = [0.48, 0.43, 0.25];

function terrainColor(x, z) {
  const town = townBlend(x, z);
  const surface = surfaceAt(x, z);
  const base = SURFACE_COLOR[surface];
  const patch = Math.sin(x * 0.037 + 2) * Math.sin(z * 0.041) + Math.sin((x - z) * 0.017);
  const grass = surface === 0 ? clamp((patch - 0.5) * 1.5) : 0;
  // Broad low-frequency variation; avoid the harsh, tiny checker-like ground pattern.
  const shade = 0.94 + 0.035 * Math.sin(x * 0.055) * Math.cos(z * 0.062) + 0.025 * Math.sin(x * 0.021 + z * 0.018);
  return [0, 1, 2].map((k) => ((base[k] + (GRASS_COLOR[k] - base[k]) * grass) * town + TOWN_COLOR[k] * (1 - town)) * shade);
}

const MINIMAP_SURFACE = [[158, 74, 41], [219, 179, 115], [82, 56, 38]];
const MINIMAP_TOWN = [148, 128, 102];

function minimapColor(x, z) {
  const onRoad = roadDistance(x, z) <= ROAD_HALF_WIDTH + 0.4;
  const base = onRoad ? [105, 66, 47] : MINIMAP_SURFACE[surfaceAt(x, z)];
  const town = townBlend(x, z);
  const hill = clamp(1 + (heightAt(x, z) - heightAt(x + 8, z + 8)) * 0.1, 0.6, 1.4);
  return [0, 1, 2].map((k) => Math.min(255, (base[k] * town + MINIMAP_TOWN[k] * (1 - town)) * hill));
}


/** Build a ribbon that follows the terrain and the sampled road centreline. */
function createRoadRibbon(samples, halfWidth, heightOffset, tileLength = 18) {
  const positions = [], uvs = [], indices = [];
  let distanceAlong = 0;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    if (i > 0) distanceAlong += Math.hypot(p.x - samples[i - 1].x, p.z - samples[i - 1].z);
    const before = samples[Math.max(0, i - 1)];
    const after = samples[Math.min(samples.length - 1, i + 1)];
    let tx = after.x - before.x, tz = after.z - before.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len; tz /= len;
    const nx = -tz, nz = tx;
    for (const side of [1, -1]) {
      const x = p.x + nx * halfWidth * side;
      const z = p.z + nz * halfWidth * side;
      positions.push(x, heightAt(x, z) + heightOffset, z);
      uvs.push(side === 1 ? 0 : 1, distanceAlong / tileLength);
    }
    if (i > 0) {
      const prev = (i - 1) * 2, next = i * 2;
      // Winding faces upward for a path travelling along +Z.
      indices.push(prev, next, prev + 1, prev + 1, next, next + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createRoadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const rng = makeRng(918); // separate seed keeps all existing scenery placement stable
  const image = ctx.createImageData(128, 128);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (rng() - 0.5) * 28;
    image.data[i] = Math.max(0, Math.min(255, 125 + n));
    image.data[i + 1] = Math.max(0, Math.min(255, 77 + n * 0.72));
    image.data[i + 2] = Math.max(0, Math.min(255, 52 + n * 0.5));
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  // Subtle longitudinal tyre-worn bands and scattered gravel flecks.
  ctx.strokeStyle = 'rgba(54,35,27,0.13)';
  ctx.lineWidth = 5;
  for (const x of [42, 86]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 128); ctx.stroke(); }
  for (let i = 0; i < 520; i++) {
    const x = rng() * 128, y = rng() * 128;
    const r = 0.25 + rng() * 0.8;
    ctx.fillStyle = rng() > 0.5 ? 'rgba(224,174,126,0.28)' : 'rgba(53,37,29,0.22)';
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r, rng() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.anisotropy = 4;
  return texture;
}


/** Atmospheric mountain silhouettes beyond the playable terrain add a distant horizon. */
function createDistantRidge({ seed, radius, baseY, minHeight, maxHeight, lowColor, highColor }) {
  const segments = 360;
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const colors = new Float32Array(positions.length);
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const broad = Math.sin(a * 3 + seed) * 0.48 + Math.sin(a * 7 - seed * 1.7) * 0.25;
    const fine = Math.sin(a * 17 + seed * 2.1) * 0.12 + Math.sin(a * 31 - seed) * 0.07;
    const peak = Math.pow(Math.max(0, Math.sin(a * 5 + seed * 0.65)), 3) * 0.22;
    const ridge = clamp(0.5 + broad + fine + peak, 0, 1);
    const r = radius + Math.sin(a * 4 + seed) * 10 + Math.sin(a * 11 - seed) * 4;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const top = minHeight + (maxHeight - minHeight) * ridge;
    const k = i * 6;
    positions[k] = x; positions[k + 1] = baseY; positions[k + 2] = z;
    positions[k + 3] = x; positions[k + 4] = top; positions[k + 5] = z;
    for (let c = 0; c < 3; c++) {
      colors[k + c] = lowColor[c];
      colors[k + 3 + c] = lowColor[c] * 0.48 + highColor[c] * 0.52;
    }
    if (i < segments) {
      const b = i * 2, n = (i + 1) * 2;
      indices.push(b, b + 1, n, n, b + 1, n + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const scenicDummy = new Object3D();
const upAxis = new Vector3(0, 1, 0);
function setScenicInstance(mesh, index, x, y, z, sx, sy, sz, yaw = 0, rx = 0, rz = 0) {
  scenicDummy.position.set(x, y, z);
  scenicDummy.rotation.set(rx, yaw, rz);
  scenicDummy.scale.set(sx, sy, sz);
  scenicDummy.updateMatrix();
  mesh.setMatrixAt(index, scenicDummy.matrix);
}

export default {
  id: 'outback',
  name: 'Outback',
  tagline: 'Winding red-dirt roads, open country and five outback towns.',
  atmosphere: {
    fogDensity: 0.00225,
    dayHorizon: [0.72, 0.78, 0.79],
    dayZenith: [0.19, 0.42, 0.72],
    duskHorizon: [0.93, 0.57, 0.36],
  },
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

    const groundTexture = createGroundTexture(rng, 58);
    const ground = new Mesh(
      createTerrainGeometry({ size: SIZE, segments: 200, heightAt, colorAt: terrainColor }),
      new MeshStandardMaterial({
        vertexColors: true, map: groundTexture, bumpMap: low ? null : groundTexture,
        bumpScale: low ? 0 : 0.22, roughness: 1, metalness: 0,
      }),
    );
    ground.receiveShadow = true;
    group.add(ground);

    // Visible all-weather country roads with broad dusty shoulders. The ribbons follow the
    // exact terrain height so the player drives on the road instead of seeing a painted decal.
    const shoulderMaterial = new MeshStandardMaterial({ color: 0x9a795d, roughness: 1, metalness: 0 });
    const roadTexture = createRoadTexture();
    const roadMaterial = new MeshStandardMaterial({ map: roadTexture, roughness: 1, metalness: 0 });
    for (const samples of ROAD_SAMPLES) {
      const shoulders = new Mesh(
        createRoadRibbon(samples, ROAD_HALF_WIDTH + ROAD_SHOULDER, 0.055), shoulderMaterial,
      );
      shoulders.receiveShadow = true;
      shoulders.renderOrder = 1;
      group.add(shoulders);

      const road = new Mesh(createRoadRibbon(samples, ROAD_HALF_WIDTH, 0.12), roadMaterial);
      road.receiveShadow = true;
      road.castShadow = false;
      road.renderOrder = 2;
      group.add(road);
    }

    const lambert = (c) => new MeshLambertMaterial({ color: c });

    // Eucalyptus stands: tapered pale trunks, visible spreading branches and layered foliage.
    // All foliage is instanced so the richer silhouettes remain browser friendly.
    // The curated glTF trees are heavier than the old primitives, so use fewer
    // hero plants while keeping the existing grove placement pattern.
    const TREE_COUNT = low ? 92 : 148;
    const ROCK_COUNT = low ? 75 : 135;
    const SHRUB_COUNT = low ? 150 : 250;
    const treeRng = makeRng(2031); // independent seed; road and town placement remain stable
    const trunks = new InstancedMesh(
      new CylinderGeometry(0.105, 0.245, 7.8, 7, 2),
      new MeshLambertMaterial({ color: 0xffffff }), TREE_COUNT,
    );
    const branches = new InstancedMesh(
      new CylinderGeometry(0.045, 0.09, 3.3, 5, 1),
      new MeshLambertMaterial({ color: 0xffffff }), TREE_COUNT * 6,
    );
    const canopy = new InstancedMesh(
      new SphereGeometry(1, 8, 6),
      new MeshLambertMaterial({ color: 0xffffff }), TREE_COUNT * 10,
    );
    const canopyPalette = [
      new Color(0x657b60), new Color(0x74876a), new Color(0x596f58),
      new Color(0x879477), new Color(0x6b8064),
    ];
    const rocks = new InstancedMesh(new DodecahedronGeometry(1, 1), lambert(0x98715a), ROCK_COUNT);
    const shrubs = new InstancedMesh(
      new SphereGeometry(1, 8, 6), new MeshLambertMaterial({ color: 0xffffff }), SHRUB_COUNT,
    );
    const grassBladesA = new InstancedMesh(
      new ConeGeometry(0.095, 0.92, 5), new MeshLambertMaterial({ color: 0xffffff }), low ? 1350 : 2100,
    );
    const grassBladesB = new InstancedMesh(
      new ConeGeometry(0.075, 0.72, 5), new MeshLambertMaterial({ color: 0xffffff }), low ? 850 : 1500,
    );
    const vegetationCenters = [];
    const treePlacements = [];
    const rockPlacements = [];
    const shrubPlacements = [];
    const grassPlacements = [];
    for (let attempt = 0; vegetationCenters.length < 22 && attempt < 800; attempt++) {
      const x = (treeRng() - 0.5) * 880, z = (treeRng() - 0.5) * 880;
      if (townBlend(x, z) > 0.96 && roadDistance(x, z) > ROAD_HALF_WIDTH + ROAD_SHOULDER + 22) {
        vegetationCenters.push({ x, z });
      }
    }

    let treeIndex = 0, branchIndex = 0, leafIndex = 0;
    while (treeIndex < TREE_COUNT) {
      let x, z;
      // Natural groves mixed with scattered individual trees; avoid grid-like placement.
      if (vegetationCenters.length && treeRng() < 0.68) {
        const center = vegetationCenters[(treeRng() * vegetationCenters.length) | 0];
        const angle = treeRng() * Math.PI * 2, radius = Math.pow(treeRng(), 0.65) * 62;
        x = center.x + Math.cos(angle) * radius;
        z = center.z + Math.sin(angle) * radius;
      } else {
        x = (treeRng() - 0.5) * 960;
        z = (treeRng() - 0.5) * 960;
      }
      if (townBlend(x, z) < 1 || roadDistance(x, z) < ROAD_HALF_WIDTH + ROAD_SHOULDER + 5) continue;

      const s = 0.76 + treeRng() * 0.48;
      const yaw = treeRng() * Math.PI * 2;
      const groundY = heightAt(x, z);
      const leanX = (treeRng() - 0.5) * 0.075;
      const leanZ = (treeRng() - 0.5) * 0.075;
      setScenicInstance(trunks, treeIndex, x, groundY + 3.9 * s, z, s, s, s, yaw, leanX, leanZ);
      trunks.setColorAt(treeIndex, new Color().setRGB(0.58 + treeRng() * 0.16, 0.48 + treeRng() * 0.12, 0.36 + treeRng() * 0.10));

      // Sparse mallee/eucalypt limbs: fewer heavy branches, more visible open space.
      // This silhouette deliberately avoids a round, continuous ball-shaped crown.
      const branchAngles = [0.15, 1.18, 2.32, 3.35, 4.42, 5.46];
      for (let b = 0; b < branchAngles.length; b++) {
        const a = yaw + branchAngles[b] + (treeRng() - 0.5) * 0.42;
        const length = 0.62 + treeRng() * 0.24;
        const dir = new Vector3(Math.cos(a) * length, 0.58 + treeRng() * 0.26, Math.sin(a) * length).normalize();
        scenicDummy.position.set(
          x + dir.x * (0.72 + treeRng() * 0.18) * s,
          groundY + (4.5 + b * 0.34 + (treeRng() - 0.5) * 0.3) * s,
          z + dir.z * (0.72 + treeRng() * 0.18) * s,
        );
        scenicDummy.quaternion.setFromUnitVectors(upAxis, dir);
        scenicDummy.scale.set(s * 0.48, s * (0.72 + treeRng() * 0.15), s * 0.48);
        scenicDummy.updateMatrix();
        branches.setMatrixAt(branchIndex, scenicDummy.matrix);
        branches.setColorAt(branchIndex, new Color(0.48 + treeRng() * 0.12, 0.39 + treeRng() * 0.10, 0.29 + treeRng() * 0.08));
        branchIndex++;
      }

      // Narrow, elongated leaf clusters placed along branch tips. Each is much
      // smaller than the old spherical crowns, leaving sky gaps between clusters.
      const crownShapes = [
        [-1.18, 5.18, -0.12, 0.62, 0.22, 0.34],
        [ 1.12, 5.36,  0.18, 0.66, 0.23, 0.33],
        [-0.62, 6.12,  0.92, 0.58, 0.21, 0.31],
        [ 0.72, 6.34, -0.92, 0.58, 0.22, 0.32],
        [-1.78, 4.82,  0.86, 0.48, 0.19, 0.28],
        [ 1.82, 5.02, -0.82, 0.50, 0.19, 0.29],
        [ 0.02, 7.18,  0.10, 0.44, 0.24, 0.31],
        [-0.10, 5.84, -1.48, 0.48, 0.20, 0.30],
        [ 0.16, 5.92,  1.48, 0.47, 0.20, 0.30],
        [-0.48, 6.68,  0.05, 0.42, 0.21, 0.28],
      ];
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      for (let c = 0; c < crownShapes.length; c++) {
        const [ox, oy, oz, sx, syScale, sz] = crownShapes[c];
        const jx = (treeRng() - 0.5) * 0.42, jy = (treeRng() - 0.5) * 0.34, jz = (treeRng() - 0.5) * 0.42;
        const localX = (ox + jx) * s, localZ = (oz + jz) * s;
        const leafX = x + localX * cy + localZ * sy;
        const leafZ = z - localX * sy + localZ * cy;
        const leafScale = 0.78 + treeRng() * 0.28;
        setScenicInstance(canopy, leafIndex, leafX, groundY + (oy + jy) * s, leafZ,
          sx * s * leafScale, syScale * s * leafScale, sz * s * leafScale, treeRng() * Math.PI * 2,
          (treeRng() - 0.5) * 0.24, (treeRng() - 0.5) * 0.24);
        canopy.setColorAt(leafIndex, canopyPalette[(treeRng() * canopyPalette.length) | 0]);
        leafIndex++;
      }
      colliders.addCircle(x, z, 0.72 * s);
      treePlacements.push({ x, z, yaw, scale: s });
      treeIndex++;
    }

    let rockIndex = 0;
    while (rockIndex < ROCK_COUNT) {
      const x = (treeRng() - 0.5) * 960, z = (treeRng() - 0.5) * 960;
      if (townBlend(x, z) < 1 || roadDistance(x, z) < ROAD_HALF_WIDTH + ROAD_SHOULDER + 3) continue;
      const s = 0.55 + treeRng() * 2.1;
      const yaw = treeRng() * 6.28;
      setScenicInstance(rocks, rockIndex, x, heightAt(x, z) + 0.35 * s, z,
        s * (0.95 + treeRng() * 0.48), s * (0.55 + treeRng() * 0.28), s * (0.72 + treeRng() * 0.48), yaw);
      colliders.addCircle(x, z, s * 0.82);
      rockPlacements.push({ x, z, yaw, scale: 0.68 + s * 0.44 });
      rockIndex++;
    }

    // Low native scrub fills the gaps between trees. Rounded, irregular mounds replace the old cones.
    let shrubIndex = 0;
    while (shrubIndex < shrubs.count) {
      const x = (treeRng() - 0.5) * 960, z = (treeRng() - 0.5) * 960;
      if (townBlend(x, z) < 1 || surfaceAt(x, z) === 2 || roadDistance(x, z) < ROAD_HALF_WIDTH + ROAD_SHOULDER + 2.5) continue;
      const s = 0.7 + treeRng() * 1.35;
      const yaw = treeRng() * 6.28;
      setScenicInstance(shrubs, shrubIndex, x, heightAt(x, z) + 0.52 * s, z,
        s * (0.8 + treeRng() * 0.65), s * (0.42 + treeRng() * 0.22), s * (0.85 + treeRng() * 0.6), yaw);
      const shade = treeRng();
      shrubs.setColorAt(shrubIndex, new Color(shade < 0.34 ? 0x72764a : shade < 0.68 ? 0x8e8955 : 0xa09a68));
      shrubPlacements.push({ x, z, yaw, scale: 0.62 + s * 0.62 });
      shrubIndex++;
    }

    // Thin grass blades are grouped into tiny clumps; no tall triangular spikes across the ground.
    let grassA = 0, grassB = 0;
    for (let tuft = 0; tuft < (low ? 280 : 480); ) {
      const x = (treeRng() - 0.5) * 960, z = (treeRng() - 0.5) * 960;
      if (townBlend(x, z) < 1 || surfaceAt(x, z) === 2 || roadDistance(x, z) < ROAD_HALF_WIDTH + ROAD_SHOULDER + 2) continue;
      const y = heightAt(x, z);
      const tuftScale = 0.58 + treeRng() * 0.72;
      const tuftYaw = Math.atan2(z, x) + 0.7; // stable orientation without consuming the scenery RNG
      grassPlacements.push({ x, z, yaw: tuftYaw, scale: tuftScale });
      for (let blade = 0; blade < 3 && grassA < grassBladesA.count; blade++) {
        const a = treeRng() * Math.PI * 2, offset = treeRng() * 0.34;
        const bx = x + Math.cos(a) * offset, bz = z + Math.sin(a) * offset;
        const scale = 0.42 + treeRng() * 0.58;
        setScenicInstance(grassBladesA, grassA, bx, y + 0.36 * scale, bz,
          scale * (0.72 + treeRng() * 0.22), scale, scale * (0.72 + treeRng() * 0.22), a,
          (treeRng() - 0.5) * 0.2, (treeRng() - 0.5) * 0.2);
        const tint = treeRng();
        grassBladesA.setColorAt(grassA, new Color(tint < 0.5 ? 0xa39a61 : 0x827b4a));
        grassA++;
      }
      if (grassB < grassBladesB.count) {
        const a = treeRng() * Math.PI * 2;
        const scale = 0.45 + treeRng() * 0.55;
        setScenicInstance(grassBladesB, grassB, x, y + 0.28 * scale, z,
          scale * 0.75, scale, scale * 0.75, a, 0.08, -0.08);
        grassBladesB.setColorAt(grassB, new Color(0xb1a46a));
        grassB++;
      }
      tuft++;
    }
    branches.count = branchIndex;
    canopy.count = leafIndex;
    grassBladesA.count = grassA;
    grassBladesB.count = grassB;

    // Three soft, irregular ridge layers give the world a real horizon rather than a flat edge.
    const ridgeLayers = [
      { seed: 1.7, radius: 508, baseY: -18, minHeight: 12, maxHeight: 39, lowColor: [0.25, 0.20, 0.15], highColor: [0.52, 0.36, 0.25] },
      { seed: 3.1, radius: 545, baseY: -22, minHeight: 25, maxHeight: 56, lowColor: [0.25, 0.28, 0.26], highColor: [0.47, 0.49, 0.39] },
      { seed: 4.6, radius: 590, baseY: -26, minHeight: 40, maxHeight: 78, lowColor: [0.27, 0.32, 0.37], highColor: [0.43, 0.50, 0.56] },
    ];
    for (const options of ridgeLayers) {
      const ridge = new Mesh(
        createDistantRidge(options),
        new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, fog: true }),
      );
      ridge.frustumCulled = false;
      ridge.receiveShadow = false;
      ridge.castShadow = false;
      group.add(ridge);
    }

    for (const m of [trunks, branches, canopy, rocks, shrubs, grassBladesA, grassBladesB]) {
      m.frustumCulled = false;
      m.castShadow = m === trunks || m === branches || m === canopy || m === rocks;
      m.receiveShadow = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      group.add(m);
    }

    // Asset-based scenery: use only the slim and tall Kenney silhouettes for
    // the Outback biome. The broad default/detailed/oak trees were too round.
    // Both CC0 models are compressed horizontally and given more vertical scale.
    // The procedural mallee-style meshes above remain as a matching fallback.
    const treeAssetSpecs = [
      { id: 'tree-thin', file: 'packs/nature-kit/tree-thin.glb', targetHeight: 8.4, scaleX: 0.66, scaleY: 1.12, scaleZ: 0.66, castShadow: true },
      { id: 'tree-tall', file: 'packs/nature-kit/tree-tall.glb', targetHeight: 8.9, scaleX: 0.72, scaleY: 1.08, scaleZ: 0.72, castShadow: true },
    ];
    const treeBuckets = new Map(treeAssetSpecs.map((spec) => [spec.id, []]));
    for (let i = 0; i < treePlacements.length; i++) {
      const placement = treePlacements[i];
      const model = (i % 5 === 0) ? 'tree-tall' : 'tree-thin';
      treeBuckets.get(model).push({ ...placement, model, scale: 0.78 + treeRng() * 0.24 });
    }
    addInstancedLibrarySet({
      group, specs: treeAssetSpecs, placements: [...treeBuckets.values()].flat(), heightAt, low,
      fallback: [trunks, branches, canopy], category: 'kenney-trees',
    });

    const shrubAssetSpecs = [
      { name: 'Bush_Common', scale: 0.92, castShadow: false },
    ];
    const shrubAssetPlacements = shrubPlacements.map((p) => ({
      ...p, model: 'Bush_Common', scale: p.scale * 0.72,
    }));
    addInstancedNatureSet({
      group, specs: shrubAssetSpecs, placements: shrubAssetPlacements, heightAt, low,
      fallbacks: [shrubs], category: 'shrubs',
    });

    const grassAssetSpecs = [
      { name: 'Grass_Common_Tall', scale: 0.74, castShadow: false, receiveShadow: false },
      { name: 'Grass_Wispy_Short', scale: 0.92, castShadow: false, receiveShadow: false },
    ];
    const grassAssetPlacements = grassPlacements.map((p, i) => ({
      ...p, model: i % 2 ? 'Grass_Wispy_Short' : 'Grass_Common_Tall', scale: p.scale * 0.78,
    }));
    addInstancedNatureSet({
      group, specs: grassAssetSpecs, placements: grassAssetPlacements, heightAt, low,
      fallbacks: [grassBladesA, grassBladesB], category: 'grass',
    });

    const rockAssetSpecs = [
      { name: 'Rock_Medium_1', scale: 0.78, castShadow: true },
      { name: 'Rock_Medium_2', scale: 0.82, castShadow: true },
    ];
    const rockAssetPlacements = rockPlacements.map((p, i) => ({
      ...p, model: i % 2 ? 'Rock_Medium_2' : 'Rock_Medium_1', scale: p.scale * 0.86,
    }));
    addInstancedNatureSet({
      group, specs: rockAssetSpecs, placements: rockAssetPlacements, heightAt, low,
      fallbacks: [rocks], category: 'rocks',
    });

    // -----------------------------------------------------------------------
    // Open-source world props. These are selected CC0 Kenney GLB models from
    // the shared tge-assets library. They are decorative layers only: no road,
    // vehicle, terrain or gameplay geometry is replaced.
    // -----------------------------------------------------------------------
    const propRng = makeRng(81273);
    const roadsidePlacements = [];
    const signPlacements = [];
    const fencePlacements = [];
    const buildingPlacements = [];
    const parkedVehiclePlacements = [];
    const animalPlacements = [];
    const townDetailPlacements = [];

    // Utility poles follow the road network, but sit well outside the driving
    // surface. A few shorter warning/stop signs mark the town approaches.
    let poleIndex = 0;
    for (let routeIndex = 0; routeIndex < ROAD_SAMPLES.length; routeIndex++) {
      const samples = ROAD_SAMPLES[routeIndex];
      const stride = routeIndex === 0 ? 24 : 32;
      for (let i = 26 + (routeIndex % 3) * 5; i < samples.length - 12; i += stride) {
        const p = samples[i], before = samples[Math.max(0, i - 2)], after = samples[Math.min(samples.length - 1, i + 2)];
        const dx = after.x - before.x, dz = after.z - before.z;
        const len = Math.hypot(dx, dz) || 1;
        const side = poleIndex % 2 === 0 ? 1 : -1;
        const x = p.x + (-dz / len) * side * 15.5;
        const z = p.z + (dx / len) * side * 15.5;
        if (Math.abs(x) > 470 || Math.abs(z) > 470 || roadDistance(x, z) < 11) continue;
        roadsidePlacements.push({ model: 'electricity-pole-single', x, z, yaw: Math.atan2(dx, dz), scale: 1 });
        poleIndex++;
      }
    }
    for (let i = 0; i < TOWNS.length; i++) {
      const t = TOWNS[i];
      signPlacements.push({ model: i % 2 ? 'road-sign-warning' : 'road-sign-stop', x: t.x - 20, z: t.z + 18, yaw: 0.55 + i * 0.17, scale: 1 });
      signPlacements.push({ model: 'road-sign-street', x: t.x + 24, z: t.z - 18, yaw: -0.72 + i * 0.14, scale: 0.96 });
    }

    // Small rural town clusters: houses are placed on the edges of the clearings,
    // away from the road centerline and from the existing shed/water-tank props.
    const buildingModelIds = ['building-type-a', 'building-type-c', 'building-type-h', 'building-type-k'];
    for (let townIndex = 0; townIndex < TOWNS.length; townIndex++) {
      const t = TOWNS[townIndex];
      const offsets = [
        [42, 30], [-42, 32], [38, -42], [-36, -44],
      ];
      for (let j = 0; j < (townIndex === 0 ? 3 : 2); j++) {
        const [ox, oz] = offsets[(townIndex + j) % offsets.length];
        const x = t.x + ox, z = t.z + oz;
        if (roadDistance(x, z) < 14) continue;
        const model = buildingModelIds[(townIndex * 2 + j) % buildingModelIds.length];
        buildingPlacements.push({ model, x, z, yaw: propRng() * Math.PI * 2, scale: 1 });
      }
    }

    // Two fenced grazing lots add a visible rural-use layer beyond the towns.
    // Kenney Nature Kit fence panels are repeated along each perimeter, with slight
    // offsets to avoid a mathematically perfect rectangle.
    const paddocks = [
      { x: 116, z: 214, w: 28, d: 18 },
      { x: -365, z: -68, w: 26, d: 18 },
    ];
    for (let lot = 0; lot < paddocks.length; lot++) {
      const pad = paddocks[lot];
      const spacing = 4.8;
      for (let x = -pad.w; x <= pad.w; x += spacing) {
        fencePlacements.push({ model: lot === 0 ? 'fence-simple' : 'fence-planks', x: pad.x + x, z: pad.z - pad.d, yaw: 0, scale: 1 });
        fencePlacements.push({ model: lot === 0 ? 'fence-simple' : 'fence-planks', x: pad.x + x, z: pad.z + pad.d, yaw: Math.PI, scale: 1 });
      }
      for (let z = -pad.d + spacing; z < pad.d; z += spacing) {
        fencePlacements.push({ model: lot === 0 ? 'fence-simple' : 'fence-planks', x: pad.x - pad.w, z: pad.z + z, yaw: Math.PI * 0.5, scale: 1 });
        fencePlacements.push({ model: lot === 0 ? 'fence-simple' : 'fence-planks', x: pad.x + pad.w, z: pad.z + z, yaw: -Math.PI * 0.5, scale: 1 });
      }
      // Gate on the near edge of each paddock.
      fencePlacements.push({ model: 'fence-gate', x: pad.x, z: pad.z - pad.d, yaw: 0, scale: 1 });
    }

    // Static farm and town vehicles are scenery only; the player's drivable SUV
    // and traffic AI remain unchanged. A few horses provide scale and life.
    const vehicleModels = ['suv', 'truck-flat', 'tractor', 'van'];
    for (let i = 0; i < TOWNS.length; i++) {
      const t = TOWNS[i];
      const x = t.x + 34, z = t.z - 30;
      if (i % 2 === 0 && roadDistance(x, z) > 15) parkedVehiclePlacements.push({ model: vehicleModels[i % vehicleModels.length], x, z, yaw: 0.4 + i * 0.3, scale: 1 });
      const tx = t.x - 34, tz = t.z + 34;
      if ((i === 1 || i === 3) && roadDistance(tx, tz) > 15) parkedVehiclePlacements.push({ model: 'tractor', x: tx, z: tz, yaw: -0.8, scale: 1 });
    }
    for (const pad of paddocks) {
      for (let i = 0; i < 3; i++) {
        const x = pad.x + (propRng() - 0.5) * pad.w * 1.15;
        const z = pad.z + (propRng() - 0.5) * pad.d * 1.15;
        if (roadDistance(x, z) > 12) animalPlacements.push({ model: 'animal-horse', x, z, yaw: propRng() * Math.PI * 2, scale: 0.95 + propRng() * 0.12 });
      }
    }
    // A couple of farm dogs stay near the outskirts of town.
    for (let i = 0; i < TOWNS.length; i += 2) {
      const t = TOWNS[i];
      animalPlacements.push({ model: 'animal-dog', x: t.x - 27, z: t.z + 26, yaw: propRng() * Math.PI * 2, scale: 0.9 });
    }

    // A small cultivated patch and fallen timber add farm-world variety without
    // turning the wider Outback into continuous farmland.
    const farmPatchPlacements = [];
    const logPlacements = [];
    for (let row = 0; row < 4; row++) {
      for (let column = 0; column < 5; column++) {
        farmPatchPlacements.push({
          model: 'crops-wheatstageb',
          x: paddocks[1].x - 11 + column * 5.2,
          z: paddocks[1].z - 7 + row * 4.5,
          yaw: 0.04 * (row % 2),
          scale: 0.88 + propRng() * 0.18,
        });
      }
    }
    for (let i = 0; i < 18; i++) {
      const x = (propRng() - 0.5) * 900, z = (propRng() - 0.5) * 900;
      if (townBlend(x, z) > 0.98 && roadDistance(x, z) > ROAD_HALF_WIDTH + ROAD_SHOULDER + 8) {
        logPlacements.push({ model: 'log-large', x, z, yaw: propRng() * Math.PI * 2, scale: 0.8 + propRng() * 0.45 });
      }
    }

    // Town details: a few utility/storage objects, not a dense urban clutter set.
    for (let i = 0; i < TOWNS.length; i++) {
      const t = TOWNS[i];
      townDetailPlacements.push({ model: 'dumpster', x: t.x + 28, z: t.z + 22, yaw: propRng() * Math.PI * 2, scale: 0.85 });
      if (i % 2 === 0) townDetailPlacements.push({ model: 'construction-barrier', x: t.x - 26, z: t.z - 18, yaw: propRng() * Math.PI * 2, scale: 0.9 });
    }

    addInstancedLibrarySet({
      group,
      specs: [
        { id: 'electricity-pole-single', file: 'packs/city-kit-roads/electricity-pole-single.glb', targetHeight: 8.4, castShadow: true },
      ],
      placements: roadsidePlacements, heightAt, low, category: 'power-poles',
    });
    addInstancedLibrarySet({
      group,
      specs: [
        { id: 'road-sign-warning', file: 'packs/city-kit-roads/road-sign-warning.glb', targetHeight: 2.4, castShadow: true },
        { id: 'road-sign-stop', file: 'packs/city-kit-roads/road-sign-stop.glb', targetHeight: 2.35, castShadow: true },
        { id: 'road-sign-street', file: 'packs/city-kit-roads/road-sign-street.glb', targetHeight: 2.5, castShadow: true },
      ],
      placements: signPlacements, heightAt, low, category: 'road-signs',
    });
    addInstancedLibrarySet({
      group,
      specs: [
        { id: 'building-type-a', file: 'packs/city-kit-suburban/building-type-a.glb', targetHeight: 6.8, castShadow: true },
        { id: 'building-type-c', file: 'packs/city-kit-suburban/building-type-c.glb', targetHeight: 6.4, castShadow: true },
        { id: 'building-type-h', file: 'packs/city-kit-suburban/building-type-h.glb', targetHeight: 6.2, castShadow: true },
        { id: 'building-type-k', file: 'packs/city-kit-suburban/building-type-k.glb', targetHeight: 6.5, castShadow: true },
      ],
      placements: buildingPlacements, heightAt, low, category: 'town-buildings',
      onLoaded: () => {
        for (const placement of buildingPlacements) colliders.addBox(placement.x, placement.z, 7.5, 6.5);
      },
    });
    addInstancedLibrarySet({
      group,
      specs: [
        { id: 'fence-simple', file: 'packs/nature-kit/fence-simple.glb', targetHeight: 1.25, castShadow: true },
        { id: 'fence-planks', file: 'packs/nature-kit/fence-planks.glb', targetHeight: 1.35, castShadow: true },
        { id: 'fence-gate', file: 'packs/nature-kit/fence-gate.glb', targetHeight: 1.35, castShadow: true },
      ],
      placements: fencePlacements, heightAt, low, category: 'farm-fences',
    });
    addInstancedLibrarySet({
      group,
      specs: [
        { id: 'crops-wheatstageb', file: 'packs/nature-kit/crops-wheatstageb.glb', targetHeight: 1.35, castShadow: false, receiveShadow: false },
      ],
      placements: farmPatchPlacements, heightAt, low, category: 'farm-crops',
    });
    addInstancedLibrarySet({
      group,
      specs: [
        { id: 'log-large', file: 'packs/nature-kit/log-large.glb', targetHeight: 0.72, castShadow: true },
      ],
      placements: logPlacements, heightAt, low, category: 'fallen-logs',
    });
    addInstancedLibrarySet({
      group,
      specs: [
        { id: 'suv', file: 'packs/car-kit/suv.glb', targetHeight: 1.95, castShadow: true },
        { id: 'truck-flat', file: 'packs/car-kit/truck-flat.glb', targetHeight: 2.35, castShadow: true },
        { id: 'tractor', file: 'packs/car-kit/tractor.glb', targetHeight: 2.15, castShadow: true },
        { id: 'van', file: 'packs/car-kit/van.glb', targetHeight: 2.15, castShadow: true },
      ],
      placements: parkedVehiclePlacements, heightAt, low, category: 'parked-vehicles',
    });
    addInstancedLibrarySet({
      group,
      specs: [
        { id: 'animal-horse', file: 'packs/prototype-kit/animal-horse.glb', targetHeight: 1.55, castShadow: true },
        { id: 'animal-dog', file: 'packs/prototype-kit/animal-dog.glb', targetHeight: 0.78, castShadow: true },
      ],
      placements: animalPlacements, heightAt, low, category: 'farm-animals',
    });
    addInstancedLibrarySet({
      group,
      specs: [
        { id: 'dumpster', file: 'packs/city-kit-roads/dumpster.glb', targetHeight: 1.65, castShadow: false },
        { id: 'construction-barrier', file: 'packs/city-kit-roads/construction-barrier.glb', targetHeight: 1.0, castShadow: false },
      ],
      placements: townDetailPlacements, heightAt, low, category: 'town-details',
    });

    // each town: a shed and a water tank (original landmarks retained)
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
