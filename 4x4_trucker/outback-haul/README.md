# Outback Haul

An open-world delivery driving game for the browser (Three.js + cannon-es), rebuilt from the original
single-file build into a readable, multi-map project.

* **3 maps** - Outback (the original), Metro City (procedural city), Green Valley (farmland)
* Deliver parcels, earn credits, level up **per map**, buy vehicles that work on **every** map
* **Ambient traffic** on the City map: cars drive the road grid, obey traffic lights, turn at junctions, brake for you and honk
* **On-foot exploration**: leave a stopped vehicle, sprint by default or hold Ctrl / WALK to slow down, with a high overhead follow camera and nearby vehicle interaction
* Day/night cycle, 4 camera views incl. a working cockpit with gauges and a rear-view mirror
* Touch controls + keyboard. No asset files required.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # dist/         (multi-file, supports public/models/*.glb)
npm run build:single   # dist-single/  (ONE index.html, like the original)
```

To publish the updated single-file game at the existing `4x4_trucker/index.html` route, run `npm run build:single` and copy `dist-single/index.html` to `../index.html` (PowerShell: `Copy-Item .\dist-single\index.html ..\index.html -Force`). The checked-in parent `index.html` is the previous generated bundle; keep it unchanged until you have built and tested the new one.

URL options: `?map=city` (skip the menu; ids: `outback`, `city`, `farmland`), `?q=low` (no shadows/AA/mirror),
`?traffic=N` (number of AI cars; `0` = none; low quality uses fewer by default), `?debug` (exposes `window.__game` for the console, e.g. `__game.update(1/60)` to fast-forward physics).

Controls: arrows / WASD drive; stop and press `E` to exit; on foot use WASD / arrows to sprint by default, hold `Ctrl` to walk, and drag to orbit the overhead camera; press `E` beside parked or traffic vehicles to enter/take them. `R` returns to start, `C` cycles vehicle cameras, `M` mutes, `Esc` opens the map menu. On touch screens, the directional pads work for walking and the ⚡ pad sprints.

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
    vehicleDefs.js        the 4 vehicles (Seltos-style SUV, Ute, Road Truck, Quad; stats + proportions)  <- add vehicles here
    vehicleModels.js      procedural models + optional .glb loader
    cockpit.js            interior, gauges, steering wheel
  game/
    game.js               wires everything, main loop, map loading
    characterController.js third-person pedestrian movement, collisions and procedural walk cycle
    jobs.js               delivery jobs + economy (per-map overrides)
    save.js               save format v2 + migration of the old save
    cameraRig.js  hud.js  input.js  minimap.js  mapSelect.js
  traffic/                ambient traffic (see below)
    gridNetwork.js        lane graph, curved junction paths, signal timing
    trafficSystem.js      the AI: car following, junction control, player interaction, collisions
    trafficCars.js        4 low-poly car types, instanced rendering (~8 draw calls for the whole fleet)
    signalsView.js        traffic-signal masts and lamps
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

## Traffic

Maps opt in with a `traffic` block (City does): `traffic: { kind: 'grid', pitch, roadWidth, min, max, count }`.

* **Lane graph:** right-hand traffic, one lane each way per road, quadratic-Bezier turns through junctions.
* **Driving model:** Intelligent Driver Model (IDM) car following. Cars slow for turns, queue behind each other and stop for red lights.
* **Junctions:** signals alternate (11 s green, 2.5 s yellow, 1.5 s all-red) and only one car is inside a junction at a time,
  so cross traffic can never collide. Cars won't enter a junction if the exit lane is full.
* **You:** cars see you as an obstacle in their lane and brake early (stopping ~2 m behind), wait if you block a junction and
  honk if you block the road. You collide with them as oriented boxes; a car you hit stops for ~2.5 s.
* **Performance:** the AI costs about 0.1 ms per frame. Cars live in a ~330 m "bubble" around you; ones that fall behind are
  re-spawned ahead, out of sight, so density stays high where you are.
* Tuning constants (speeds, gaps, light timing) are at the top of `trafficSystem.js` / `gridNetwork.js`.

Not covered yet: ambient pedestrian crowds, lane changes/overtaking, emergency vehicles, and traffic on non-grid maps (Outback / Green Valley).

## On-foot exploration

The player can leave a stopped vehicle with the physical `KeyE` shortcut (or the on-screen interaction button), sprint by default using WASD / arrow keys, and hold `Ctrl` (or touch WALK) to move at walking pace. The camera follows from high above and just behind the character; drag on the canvas to orbit it. On-foot movement resolves against map colliders, ambient traffic and parked vehicles. The shortcut listens to both `event.code` (`KeyE`) and the normalized key value (`e`/`E`).

The character is a procedural low-poly rig with a facial detail, clothing variations, optional caps/backpacks, and idle/walk/run limb animation. Player vehicle doors have hinged open/close animation. Street-car takeovers generate one to four seat occupants according to vehicle class; each occupant exits through a side door and flees. Ambient pedestrian crowds, authored skinned animation clips, jumping and combat remain future work.

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
* Collision uses a spatial hash with circle **and box** colliders (needed for city buildings; also faster), and the player is a
  three-circle capsule instead of one circle, so a long car no longer pokes its nose through walls.
* The Outback map uses the same seed and generation order, so terrain, trees and rocks are identical (verified side-by-side). Town sheds now use a box collider instead of a circle.
* Everything that was hard-coded to the single map (towns, surface grip tables, minimap scale, sky palette,
  job balance, home position) is now data on the map.

## Next steps (not built yet)

Ambient pedestrian crowds, authored skinned animation clips, jumping, police/wanted system, weather, vehicle damage, more job types (taxi, races), vehicle upgrades, and traffic for the rural maps.


## Gameplay roadmap status

| Feature | Status | Description |
|---|---|---|
| Walking on foot, enter/exit cars | Expanded playable implementation | Overhead follow camera, sprint-by-default movement, hinged vehicle doors, varied procedural pedestrians, and multi-occupant traffic-car takeovers with fleeing passengers. |


## On-foot controls and street vehicles

- Stop your current vehicle and press **E** to exit.
- On foot, **WASD / arrow keys sprint by default**. Hold **Ctrl** on desktop (or the on-screen **WALK** button on mobile) to move at walking pace.
- Move near a street vehicle and press **E** to take it. Its traffic instance is removed, one or more occupants exit through animated doors and flee, and the player receives a drivable vehicle with the matching traffic type and paint.
- Previously used player vehicles remain parked and can be entered again with **E**.
- Street takeovers currently support sedan, hatchback, van, and truck traffic classes.

Kenney Car Kit CC0 GLB vehicle body models are optional runtime enhancements; see [ASSET_SOURCES.md](./ASSET_SOURCES.md). Procedural meshes remain as a fallback if a remote model cannot load.
