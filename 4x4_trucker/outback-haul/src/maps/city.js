import {
  Mesh, MeshLambertMaterial, MeshBasicMaterial, InstancedMesh, CylinderGeometry, IcosahedronGeometry, BoxGeometry,
  PlaneGeometry, BufferGeometry, BufferAttribute, CanvasTexture, RepeatWrapping, AdditiveBlending, Object3D,
} from 'three';
import { makeRng, lerp } from '../util/math.js';

/**
 * MAP 2 - Metro City. A 10x10 block grid, fully procedural (no asset files):
 * roads with lane markings, crosswalks, buildings merged into one mesh, street lamps that glow
 * at night, parks, and six landmark plazas as job locations.
 *
 * The layout comes from pure functions (getLayout) so the minimap / map-select preview can use it
 * without building any 3D objects.
 */

const SIZE = 1000;
const PITCH = 84;        // road centre to road centre
const ROAD = 12;         // road width
const HALF = ROAD / 2;
const MIN_B = -5, MAX_B = 4; // block indices per axis (10 blocks)
const CORE = 5 * PITCH + HALF; // 426: edge of the built-up area

const blockCentre = (i) => (i + 0.5) * PITCH;
const roadDist = (c) => Math.abs(c - Math.round(c / PITCH) * PITCH);
const onRoad = (c) => roadDist(c) < HALF;
const blockIndex = (c) => Math.floor(c / PITCH);

const PLAZAS = [
  { name: 'Central Station', kind: 'station', bx: 0, bz: 0 },
  { name: 'Harbor Docks', kind: 'docks', bx: 3, bz: -4 },
  { name: 'Market Square', kind: 'market', bx: -4, bz: 2 },
  { name: 'Tech Park', kind: 'tech', bx: 2, bz: 3 },
  { name: 'Old Town Depot', kind: 'depot', bx: -3, bz: -3 },
  { name: 'Riverside Mall', kind: 'mall', bx: -1, bz: -5 },
];
const LOCATIONS = PLAZAS.map((p) => ({ name: p.name, x: blockCentre(p.bx), z: blockCentre(p.bz) }));

const WALL_TINTS = [0xffffff, 0xe8d9c4, 0xc9d3dc, 0xd9b8a0, 0xb9c4b0, 0xd0d0d0, 0xc4a98c, 0x9fb0c4];
const CONTAINER_COLORS = [0xc0392b, 0x2980b9, 0xd68910, 0x27ae60, 0x7f8c8d, 0x8e44ad];
const STALL_COLORS = [0xe74c3c, 0xf1c40f, 0x3498db, 0x2ecc71, 0xe67e22];

// ---------------------------------------------------------------------------------------------
// layout (pure, cached)
// ---------------------------------------------------------------------------------------------

/** Landmark buildings for a plaza block. Offsets are relative to the block centre; the centre stays open (pickup point). */
function plazaParts(kind, cx, cz, rng) {
  const P = (dx, dz, w, d, h, tint, windows = false) => ({ x: cx + dx, z: cz + dz, w, d, h, tint, windows });
  const pick = (list) => list[(rng() * list.length) | 0];
  switch (kind) {
    case 'station': return [P(0, 26, 60, 14, 12, 0xd8c9a8), P(0, 26, 8, 8, 35, 0xc9b78e, true)];
    case 'docks': {
      const parts = [];
      for (const dz of [22, 27.5, 33]) {
        for (const dx of [-26, -14, -2, 10, 22]) parts.push(P(dx, dz, 11, 2.6, rng() < 0.35 ? 5.2 : 2.6, pick(CONTAINER_COLORS)));
      }
      return parts;
    }
    case 'market':
      return [[-26, -12], [-26, 0], [-26, 12], [26, -12], [26, 0], [26, 12], [-12, -27], [0, -27], [12, -27], [-12, 27], [0, 27], [12, 27]]
        .map(([dx, dz]) => P(dx, dz, 4, 4, 3.2, pick(STALL_COLORS)));
    case 'tech': return [P(24, 24, 18, 18, 63, 0x8fb8d0, true), P(-24, 24, 22, 12, 7, 0xcfd6da, true)];
    case 'depot': return [P(0, 26, 52, 22, 10.5, 0x9a4a3a), P(24, 8, 4, 4, 22, 0x6b4a3a)];
    case 'mall': return [P(0, -26, 56, 26, 14, 0xc9a98a), P(-26, -6, 5, 5, 24, 0xd9534f)];
    default: return [];
  }
}

let cachedLayout = null;

function getLayout() {
  if (cachedLayout) return cachedLayout;
  const rng = makeRng(4242);
  const blocks = [];
  const lamps = [];
  const trees = [];

  for (let bx = MIN_B; bx <= MAX_B; bx++) {
    blocks[bx - MIN_B] = [];
    for (let bz = MIN_B; bz <= MAX_B; bz++) {
      const cx = blockCentre(bx), cz = blockCentre(bz);
      const plaza = PLAZAS.find((p) => p.bx === bx && p.bz === bz);
      const kind = plaza ? 'plaza' : rng() < 0.1 ? 'park' : 'buildings';
      const block = { bx, bz, cx, cz, kind, parts: [] };

      if (plaza) {
        block.parts = plazaParts(plaza.kind, cx, cz, rng);
      } else if (kind === 'park') {
        block.parts.push({ x: cx, z: cz, w: 10, d: 10, h: 4.5, tint: 0xe6dccb, windows: false }); // pavilion
        const n = 14 + ((rng() * 8) | 0);
        for (let i = 0; i < n; i++) {
          const tx = cx + (rng() - 0.5) * 60, tz = cz + (rng() - 0.5) * 60;
          if (Math.hypot(tx - cx, tz - cz) > 9) trees.push({ x: tx, z: tz, s: 0.8 + rng() * 0.5 });
        }
      } else {
        const downtown = Math.max(0, 1 - Math.hypot(cx, cz) / 380);
        const heightFor = (cap) => {
          let h = 7 + rng() * 17;
          if (rng() < 0.25 + 0.6 * downtown) h += rng() * 70 * (0.25 + downtown);
          return Math.max(7, Math.round(Math.min(h, cap) / 3.5) * 3.5); // whole floors
        };
        const tint = () => WALL_TINTS[(rng() * WALL_TINTS.length) | 0];
        const size = () => [20, 24, 28][(rng() * 3) | 0];
        const add = (x, z, w, d, cap = 200) => block.parts.push({ x, z, w, d, h: heightFor(cap), tint: tint(), windows: true });
        const pattern = rng();
        if (pattern < 0.7) {
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(cx + sx * 16, cz + sz * 16, size(), size());
        } else if (pattern < 0.85) {
          for (const sz of [-1, 1]) add(cx, cz + sz * 16, 60, 28);
        } else {
          add(cx, cz, 60, 60, 24);
        }
      }
      blocks[bx - MIN_B][bz - MIN_B] = block;
    }
  }

  // street lamps: 3 per block side on both sides of every road; (toX,toZ) points toward the road
  for (let k = MIN_B; k <= MAX_B + 1; k++) {
    for (let j = MIN_B; j <= MAX_B; j++) {
      for (const off of [14, 42, 70]) {
        for (const side of [-1, 1]) {
          lamps.push({ x: k * PITCH + side * 7, z: j * PITCH + off, toX: -side, toZ: 0 }); // north-south road
          lamps.push({ x: j * PITCH + off, z: k * PITCH + side * 7, toX: 0, toZ: -side }); // east-west road
        }
      }
    }
  }

  // tree line around the edge of the map
  for (let t = -480; t <= 480; t += 20) {
    for (const edge of [-462, 462]) {
      trees.push({ x: t + (rng() - 0.5) * 6, z: edge + (rng() - 0.5) * 8, s: 1 + rng() * 0.6 });
      if (Math.abs(t) < 430) trees.push({ x: edge + (rng() - 0.5) * 8, z: t + (rng() - 0.5) * 6, s: 1 + rng() * 0.6 });
    }
  }

  cachedLayout = { blocks, lamps, trees };
  return cachedLayout;
}

const blockAt = (x, z) => {
  const bx = blockIndex(x), bz = blockIndex(z);
  if (bx < MIN_B || bx > MAX_B || bz < MIN_B || bz > MAX_B) return null;
  return getLayout().blocks[bx - MIN_B][bz - MIN_B];
};

/** 0 asphalt, 1 pavement/plaza, 2 grass */
function surfaceAt(x, z) {
  if (Math.abs(x) > CORE || Math.abs(z) > CORE) return 2;
  if (onRoad(x) || onRoad(z)) return 0;
  const b = blockAt(x, z);
  return !b || b.kind === 'park' ? 2 : 1;
}

function minimapColor(x, z) {
  if (Math.abs(x) > CORE || Math.abs(z) > CORE) return [92, 128, 78];
  if (onRoad(x) || onRoad(z)) return [78, 80, 88];
  const b = blockAt(x, z);
  if (!b) return [92, 128, 78];
  if (b.kind === 'park') return [96, 150, 88];
  for (const p of b.parts) {
    if (Math.abs(x - p.x) <= p.w / 2 && Math.abs(z - p.z) <= p.d / 2) {
      if (b.kind === 'plaza') return [210, 150, 80];
      const t = Math.min(1, p.h / 70);
      return [lerp(150, 232, t), lerp(146, 226, t), lerp(138, 214, t)];
    }
  }
  return b.kind === 'plaza' ? [196, 190, 176] : [128, 126, 120];
}

// ---------------------------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------------------------

const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const PLAIN_UV = [[0.02, 0.02], [0.03, 0.02], [0.03, 0.03], [0.02, 0.03]]; // blank wall patch of the facade texture

/** Accumulates quads into one non-indexed BufferGeometry, so a whole city is a handful of draw calls. */
class MeshBatch {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; }

  /** a,b,c,d: corners counter-clockwise as seen from outside; uv: 4 [u,v] pairs */
  quad(a, b, c, d, n, uv, color) {
    const pts = [a, b, c, d];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const p = pts[i];
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.uv.push(uv[i][0], uv[i][1]);
      this.col.push(color[0], color[1], color[2]);
    }
  }

  /** Horizontal rectangle facing up; uvFn(x,z) -> [u,v] */
  flat(x0, z0, x1, z1, y, uvFn, color = [1, 1, 1]) {
    this.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0],
      [uvFn(x0, z0), uvFn(x0, z1), uvFn(x1, z1), uvFn(x1, z0)], color);
  }

  box({ x, z, w, d, h, tint, windows }) {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const wall = rgb(tint), roof = wall.map((v) => v * 0.55);
    const face = (a, b, c, e, n, len) =>
      this.quad(a, b, c, e, n, windows ? [[0, 0], [len / 16, 0], [len / 16, h / 14], [0, h / 14]] : PLAIN_UV, wall);
    face([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], [0, 0, 1], w);
    face([x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], [0, 0, -1], w);
    face([x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], [1, 0, 0], d);
    face([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], [-1, 0, 0], d);
    this.quad([x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0], [0, 1, 0], PLAIN_UV, roof);
  }

  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    return g;
  }
}

// ---------------------------------------------------------------------------------------------
// canvas textures
// ---------------------------------------------------------------------------------------------

function canvasTexture(size, draw, { repeat = true, anisotropy = 4 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

function speckle(g, size, rng, count, light, dark) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = rng() < 0.5 ? light : dark;
    g.fillRect(rng() * size, rng() * size, 1 + rng() * 1.5, 1 + rng() * 1.5);
  }
}

function makeTextures(rng) {
  const fill = (g, size, color) => { g.fillStyle = color; g.fillRect(0, 0, size, size); };

  // road tile: 12 m across (u) x 12 m along (v): edge lines + dashed centre line
  const road = canvasTexture(256, (g, s) => {
    fill(g, s, '#3a3c41');
    speckle(g, s, rng, 2500, 'rgba(255,255,255,.07)', 'rgba(0,0,0,.14)');
    g.fillStyle = '#e8e8e0';
    g.fillRect(10, 0, 3, s);
    g.fillRect(s - 13, 0, 3, s);
    g.fillStyle = '#e2c24a';
    g.fillRect(s / 2 - 2, 0, 4, 64);
    g.fillRect(s / 2 - 2, 128, 4, 64);
  });
  const plain = canvasTexture(128, (g, s) => {
    fill(g, s, '#3a3c41');
    speckle(g, s, rng, 1400, 'rgba(255,255,255,.07)', 'rgba(0,0,0,.14)');
  });
  const concrete = canvasTexture(128, (g, s) => {
    fill(g, s, '#c9c7c0');
    speckle(g, s, rng, 900, 'rgba(255,255,255,.18)', 'rgba(0,0,0,.08)');
    g.strokeStyle = 'rgba(90,88,82,.55)';
    g.lineWidth = 1.5;
    for (const [x, y] of [[0, 0], [s / 2, 0], [0, s / 2], [s / 2, s / 2]]) g.strokeRect(x, y, s / 2, s / 2);
  });
  const grass = canvasTexture(128, (g, s) => {
    fill(g, s, '#58803e');
    speckle(g, s, rng, 1800, 'rgba(190,230,120,.22)', 'rgba(20,50,10,.22)');
  });
  const glow = canvasTexture(64, (g) => {
    const grad = g.createRadialGradient(32, 32, 1, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,214,140,.9)');
    grad.addColorStop(1, 'rgba(255,214,140,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }, { repeat: false });

  // facade tile: 4 windows x 4 floors (16 m x 14 m); a second tile marks which windows are lit at night
  const cell = 64;
  const facade = canvasTexture(256, (g, s) => {
    fill(g, s, '#dcd8d0');
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const x = c * cell, y = r * cell;
        const grad = g.createLinearGradient(0, y + 14, 0, y + 48);
        grad.addColorStop(0, '#4a6580');
        grad.addColorStop(1, '#222f3b');
        g.fillStyle = grad;
        g.fillRect(x + 14, y + 14, 36, 34);
        g.strokeStyle = '#b3afa6';
        g.lineWidth = 2;
        g.strokeRect(x + 14, y + 14, 36, 34);
        g.fillStyle = '#c4c0b6';
        g.fillRect(x + 11, y + 48, 42, 4);
        if (rng() < 0.25) { g.fillStyle = 'rgba(230,220,200,.35)'; g.fillRect(x + 15, y + 15, 34, 14); } // curtains
      }
    }
  });
  const lit = canvasTexture(256, (g, s) => {
    fill(g, s, '#000');
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (rng() > 0.4) continue;
        g.fillStyle = rng() < 0.7 ? '#ffd596' : '#bfe0ff';
        g.fillRect(c * cell + 15, r * cell + 15, 34, 32);
      }
    }
  });
  return { road, plain, concrete, grass, glow, facade, lit };
}

// ---------------------------------------------------------------------------------------------
// the map
// ---------------------------------------------------------------------------------------------

export default {
  id: 'city',
  name: 'Metro City',
  tagline: 'Tarmac grid, towers and a night skyline.',
  size: SIZE,
  bound: 480,
  physicsDivisions: 8, // perfectly flat
  spawn: { x: 0, z: -30, h: 0, name: 'the Crossing' },
  locations: LOCATIONS,
  economy: { minDistance: 160, distancePerLevel: 40, maxDistance: 520, payPerMetre: 0.55, speedBase: 9, speedPerLevel: 0.8, timeSlack: 30 },
  atmosphere: {
    fogDensity: 0.0024,
    dayHorizon: [0.72, 0.8, 0.9],
    dayZenith: [0.16, 0.4, 0.78],
    duskHorizon: [0.95, 0.58, 0.42],
  },
  surfaces: [
    { name: 'Asphalt', grip: 1.15, drag: 1, shake: 0.004, dust: null, tireFreq: 1500, tireGain: 0.7 },
    { name: 'Pavement', grip: 1.05, drag: 1.1, shake: 0.006, dust: null, tireFreq: 1700, tireGain: 0.7 },
    { name: 'Grass', grip: 0.85, drag: 1.7, shake: 0.02, dust: 0x8a9a5a, tireFreq: 400, tireGain: 0.8 },
  ],
  /** ambient traffic: a lane graph over the road grid (see src/traffic/) */
  traffic: { kind: 'grid', pitch: PITCH, roadWidth: ROAD, min: -5, max: 5, count: 42, laneOffset: 3 },
  pedestrians: { count: 55, bubble: 180, fine: 50 },
  heightAt: () => 0,
  surfaceAt,
  minimapColor,

  build({ group, colliders }) {
    const L = getLayout();
    const rng = makeRng(99);
    const T = makeTextures(rng);

    // ---- flat ground: roads, junctions, crossings, sidewalks, parks, margin ---------------------
    const roads = new MeshBatch(), junctions = new MeshBatch(), walk = new MeshBatch(), turf = new MeshBatch(), zebra = new MeshBatch();
    const uvRoadNS = (x0) => (x, z) => [(x - x0) / ROAD, z / ROAD];
    const uvRoadEW = (z0) => (x, z) => [(z - z0) / ROAD, x / ROAD];
    const uvWorld = (s) => (x, z) => [x / s, z / s];
    const stripe = (x0, z0, x1, z1) => zebra.flat(x0, z0, x1, z1, 0.012, () => [0.5, 0.5]);

    for (let k = MIN_B; k <= MAX_B + 1; k++) {
      const c = k * PITCH;
      for (let j = MIN_B; j <= MAX_B; j++) {
        const a = j * PITCH + HALF, b = (j + 1) * PITCH - HALF;
        roads.flat(c - HALF, a, c + HALF, b, 0, uvRoadNS(c - HALF)); // north-south segment
        roads.flat(a, c - HALF, b, c + HALF, 0, uvRoadEW(c - HALF)); // east-west segment
      }
      for (let m = MIN_B; m <= MAX_B + 1; m++) {
        const cx = k * PITCH, cz = m * PITCH;
        junctions.flat(cx - HALF, cz - HALF, cx + HALF, cz + HALF, 0, uvWorld(6));
        for (let s = -5; s <= 5; s++) { // zebra crossing on every arm that continues past this junction
          if (m < MAX_B + 1) stripe(cx + s - 0.25, cz + HALF, cx + s + 0.25, cz + HALF + 3);
          if (m > MIN_B) stripe(cx + s - 0.25, cz - HALF - 3, cx + s + 0.25, cz - HALF);
          if (k < MAX_B + 1) stripe(cx + HALF, cz + s - 0.25, cx + HALF + 3, cz + s + 0.25);
          if (k > MIN_B) stripe(cx - HALF - 3, cz + s - 0.25, cx - HALF, cz + s + 0.25);
        }
      }
    }
    for (const col of L.blocks) {
      for (const b of col) {
        const x0 = b.cx - PITCH / 2 + HALF, x1 = b.cx + PITCH / 2 - HALF;
        const z0 = b.cz - PITCH / 2 + HALF, z1 = b.cz + PITCH / 2 - HALF;
        if (b.kind === 'park') turf.flat(x0, z0, x1, z1, 0, uvWorld(10));
        else walk.flat(x0, z0, x1, z1, 0, uvWorld(8), b.kind === 'plaza' ? [1.12, 1.08, 0.98] : [1, 1, 1]);
      }
    }
    for (const [x0, z0, x1, z1] of [[-500, CORE, 500, 500], [-500, -500, 500, -CORE], [-500, -CORE, -CORE, CORE], [CORE, -CORE, 500, CORE]]) {
      turf.flat(x0, z0, x1, z1, 0, uvWorld(10));
    }

    const addGround = (batch, material) => {
      const m = new Mesh(batch.geometry(), material);
      m.receiveShadow = true;
      group.add(m);
    };
    addGround(roads, new MeshLambertMaterial({ map: T.road }));
    addGround(junctions, new MeshLambertMaterial({ map: T.plain }));
    addGround(walk, new MeshLambertMaterial({ map: T.concrete, vertexColors: true }));
    addGround(turf, new MeshLambertMaterial({ map: T.grass }));
    addGround(zebra, new MeshLambertMaterial({ color: 0xe8e8e0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));

    // ---- buildings & landmarks: one merged mesh -----------------------------------------------
    const towers = new MeshBatch();
    for (const col of L.blocks) {
      for (const b of col) {
        for (const p of b.parts) {
          towers.box(p);
          colliders.addBox(p.x, p.z, p.w / 2, p.d / 2);
        }
      }
    }
    const buildingMat = new MeshLambertMaterial({ map: T.facade, vertexColors: true, emissive: 0xffffff, emissiveMap: T.lit, emissiveIntensity: 0 });
    const buildings = new Mesh(towers.geometry(), buildingMat);
    buildings.castShadow = buildings.receiveShadow = true;
    group.add(buildings);

    // ---- trees ---------------------------------------------------------------------------------
    const trunks = new InstancedMesh(new CylinderGeometry(0.18, 0.25, 3.2, 6), new MeshLambertMaterial({ color: 0x6b4f3a }), L.trees.length);
    const crowns = new InstancedMesh(new IcosahedronGeometry(2.2, 1), new MeshLambertMaterial({ color: 0x4f8a4a }), L.trees.length);
    const dummy = new Object3D();
    L.trees.forEach((t, i) => {
      dummy.rotation.set(0, i, 0);
      dummy.scale.setScalar(t.s);
      dummy.position.set(t.x, 1.6 * t.s, t.z); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, 4.4 * t.s, t.z); dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
      colliders.addCircle(t.x, t.z, 0.4 * t.s);
    });
    trunks.castShadow = crowns.castShadow = true;
    trunks.frustumCulled = crowns.frustumCulled = false;
    group.add(trunks, crowns);

    // ---- street lamps: poles, bulbs, and a soft ground glow that only shows at night ------------
    const poles = new InstancedMesh(new CylinderGeometry(0.09, 0.13, 7, 6), new MeshLambertMaterial({ color: 0x4b5057 }), L.lamps.length);
    const bulbMat = new MeshBasicMaterial({ color: 0x555555 });
    const bulbs = new InstancedMesh(new BoxGeometry(0.7, 0.16, 0.7), bulbMat, L.lamps.length);
    const glowMat = new MeshBasicMaterial({ map: T.glow, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, fog: false });
    const glows = new InstancedMesh(new PlaneGeometry(11, 11).rotateX(-Math.PI / 2), glowMat, L.lamps.length);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    L.lamps.forEach((l, i) => {
      dummy.position.set(l.x, 3.5, l.z); dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(l.x + l.toX * 0.9, 7.05, l.z + l.toZ * 0.9); dummy.updateMatrix(); bulbs.setMatrixAt(i, dummy.matrix);
      dummy.position.set(l.x + l.toX * 4, 0.06, l.z + l.toZ * 4); dummy.updateMatrix(); glows.setMatrixAt(i, dummy.matrix);
      colliders.addCircle(l.x, l.z, 0.22);
    });
    poles.castShadow = true;
    for (const m of [poles, bulbs, glows]) m.frustumCulled = false;
    group.add(poles, bulbs, glows);

    return {
      /** windows and street lamps come on at night */
      update(dt, { night }) {
        buildingMat.emissiveIntensity = night * 1.15;
        glowMat.opacity = night * 0.55;
        bulbMat.color.setRGB(lerp(0.33, 1, night), lerp(0.33, 0.88, night), lerp(0.33, 0.55, night));
      },
    };
  },
};
