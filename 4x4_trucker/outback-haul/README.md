# Outback Haul

An open-world delivery driving game for the browser (Three.js + cannon-es), rebuilt from the original
single-file build into a readable, multi-map project.

* **3 maps** - Outback (the original), Metro City (procedural city), Green Valley (farmland)
* Deliver parcels, earn credits, level up **per map**, buy vehicles that work on **every** map
* Day/night cycle, 4 camera views incl. a working cockpit with gauges and a rear-view mirror
* Touch controls + keyboard. No asset files required.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # dist/         (multi-file, supports public/models/*.glb)
npm run build:single   # dist-single/  (ONE index.html, like the original)
```

URL options: `?map=city` (skip the menu; ids: `outback`, `city`, `farmland`), `?q=low` (no shadows/AA/mirror),
`?debug` (exposes `window.__game` for the console, e.g. `__game.update(1/60)` to fast-forward physics).

Controls: arrows / WASD drive, `R` back to start, `C` camera, `M` mute, `Esc` map menu.

## Project layout

```
src/
  main.js                 entry
  config.js               quality flag, save keys
  engine/                 reusable, game-agnostic systems
    stage.js              renderer, scene, camera, lights
    atmosphere.js         sky dome, sun, fog, day/night clock
    physics.js            cannon-es world + terrain heightfield
    vehiclePhysics.js     driving model (engine, steering, grip, flips, collisions)
    colliders.js          spatial-hash of circle/box colliders
    audio.js  particles.js
  vehicles/
    vehicleDefs.js        the 4 vehicles (stats + proportions)  <- add vehicles here
    vehicleModels.js      procedural models + optional .glb loader
    cockpit.js            interior, gauges, steering wheel
  game/
    game.js               wires everything, main loop, map loading
    jobs.js               delivery jobs + economy (per-map overrides)
    save.js               save format v2 + migration of the old save
    cameraRig.js  hud.js  input.js  minimap.js  mapSelect.js
  maps/
    index.js              map registry  <- add maps here
    mapTypes.js           THE MAP CONTRACT (read this first)
    outback.js  city.js  farmland.js  _template.js
    builders/             shared helpers (terrain mesh, ground texture, instancing)
```

## Adding a map

Copy `src/maps/_template.js`, register it in `src/maps/index.js`, open `?map=<id>&debug`.
A map is just data + one `build()` function:

| field | what it does |
|---|---|
| `heightAt(x,z)`, `surfaceAt(x,z)` | terrain height and which `surfaces[]` entry (grip, drag, dust, tyre sound) is under a point |
| `locations` | job pickup/drop-off points |
| `economy` | per-map pay/time/distance tuning (defaults in `game/jobs.js`) |
| `atmosphere` | sky + fog palette |
| `minimapColor(x,z)` | top-down colour; also draws the menu thumbnail |
| `build({group, colliders, low})` | create scenery inside `group` (auto-disposed on map change) and register `colliders.addBox/addCircle` |

Because layout is derived from pure functions, thumbnails/minimaps never need the 3D scene.

## Adding / tuning vehicles

Edit `src/vehicles/vehicleDefs.js` (order matters: saves store ownership by index; append new ones at the end).
Pay and difficulty live in each map's `economy` block.

## Using free asset packs (Kenney, Quaternius, Poly Haven - all CC0)

* **Vehicles:** export `.glb`, put in `public/models/` (see the README there).
* **City dressing:** `city.js` builds everything procedurally. To swap in Kenney City Kit models, load them with
  `GLTFLoader` inside `build()`, place them, and register a `colliders.addBox` per building.
  Tell me which pack you use and I'll wire it up.
* **Realism:** a Poly Haven HDRI as `scene.environment` + real asphalt/grass textures are the cheapest big upgrade.

## Save data

`localStorage['outbackhaul2'] = { cash, owned[], progress: { <mapId>: { level, earned } }, lastMap }`.
Cash and owned vehicles are shared; levels are per map. An old `outbackhaul1` save is migrated automatically.

## Changes vs. the original build

* **Bug fixed:** switching/buying a vehicle threw an exception (`removeFromWorld()` was called without the world),
  so the new vehicle's physics never replaced the old one. Now it does.
* Collision uses a spatial hash with circle **and box** colliders (needed for city buildings; also faster).
* The Outback map uses the same seed and generation order, so terrain, trees and rocks are identical (verified side-by-side). Town sheds now use a box collider instead of a circle.
* Everything that was hard-coded to the single map (towns, surface grip tables, minimap scale, sky palette,
  job balance, home position) is now data on the map.

## Next steps (not built yet)

Ambient traffic, pedestrians, police/wanted system, weather, damage, more job types (taxi, races), vehicle upgrades.
