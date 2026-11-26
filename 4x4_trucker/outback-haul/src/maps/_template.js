/**
 * NEW MAP TEMPLATE
 * ----------------
 * 1. Copy this file to src/maps/mymap.js and change the id/name.
 * 2. Import it in src/maps/index.js and add it to the MAPS array.
 * 3. Run `npm run dev` and open http://localhost:5173/?map=mymap&debug
 *
 * This template is a flat grey plain with four pickup points - enough to drive around and test jobs.
 * See outback.js (terrain + scatter), farmland.js (fields + roads) and city.js (grid + merged meshes).
 * The full contract is documented in mapTypes.js.
 */
import { Mesh, PlaneGeometry, MeshLambertMaterial, BoxGeometry } from 'three';

export default {
  id: 'template',            // unique; used as the key in the save file
  name: 'Template Plain',
  tagline: 'A flat starting point for your own map.',
  size: 1000,                // square world, centred on 0,0
  bound: 480,                // invisible wall
  physicsDivisions: 8,       // 8 = flat; use ~200 for real terrain
  spawn: { x: 0, z: 0, h: 0, name: 'the Start' },
  locations: [
    { name: 'North Post', x: 0, z: 300 },
    { name: 'East Post', x: 300, z: 0 },
    { name: 'South Post', x: 0, z: -300 },
    { name: 'West Post', x: -300, z: 0 },
  ],
  economy: {},               // override any key of DEFAULT_ECONOMY (game/jobs.js)
  atmosphere: {},            // override sky/fog palette (engine/atmosphere.js)
  surfaces: [
    { name: 'Ground', grip: 1, drag: 1, shake: 0.01, dust: 0xb8a888, tireFreq: 900, tireGain: 1 },
  ],
  heightAt: () => 0,
  surfaceAt: () => 0,
  minimapColor: () => [120, 140, 110],

  build({ group, colliders }) {
    const ground = new Mesh(new PlaneGeometry(1000, 1000).rotateX(-Math.PI / 2), new MeshLambertMaterial({ color: 0x78906e }));
    ground.receiveShadow = true;
    group.add(ground);

    // an obstacle: a mesh + a matching collider
    const crate = new Mesh(new BoxGeometry(6, 4, 6), new MeshLambertMaterial({ color: 0xaa7744 }));
    crate.position.set(20, 2, 20);
    crate.castShadow = true;
    group.add(crate);
    colliders.addBox(20, 20, 3, 3);   // (x, z, halfWidthX, halfDepthZ)
    // colliders.addCircle(x, z, radius) for trees, poles, rocks

    // optional: return { update(dt, { night }) {} } to animate things (e.g. lights at night)
  },
};
