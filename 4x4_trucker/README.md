# Outback Haul — Cloudflare Pages deployment

The static game entry page is `index.html`. Its modules and stylesheet live in `outback-haul/`. Keep the complete `4x4_trucker` folder together when deploying; do not publish only the HTML file.

## Cloudflare Pages

- Framework preset: **None**
- Build command: **leave empty**
- Build output directory: the repository root (or `.` when this folder is the project root)
- Runtime: static HTML, CSS, and JavaScript modules; no npm build is required

The entry page uses an import map to load Three.js and cannon-es from jsDelivr. An internet connection is required. Selected Kenney vehicle body models are also loaded from public CC0 asset endpoints; if a remote model fails to load, the procedural vehicle body remains as a fallback.

## Controls

- Stop your current vehicle and press **E** to exit.
- On foot, movement defaults to **sprint**. Use **WASD** or **arrow keys**; hold **Ctrl** to walk more slowly.
- Press **E** beside your parked player vehicle to get back in.
- Press **E** beside a street vehicle to take it. The driver and any passengers exit through animated doors; the traffic vehicle is removed from traffic and becomes player-controlled.
- Previously used player vehicles remain parked in the world and can be re-entered.
- On foot, the camera follows from high above and just behind the character; drag on the scene to orbit it.
- Vehicle doors swing open and close during entry and exit. On a street-car takeover, the occupants leave through their seat doors and run away.

## Available player vehicles

The garage catalogue includes a Seltos-style SUV (starting vehicle), Ute (300 cr), Road Truck (700 cr), and Quad (1,000 cr). Ambient street traffic includes sedans, hatchbacks, vans, and trucks that can be taken over on foot. Earn credits through delivery jobs, buy garage vehicles with the 🛒 button, and use 🚙 to cycle through vehicles you own. Garage ownership is saved in the browser.

## Open-source vehicle assets

Selected body models use Kenney Car Kit GLB assets (CC0 1.0) served from Flockbay's direct asset URLs. See `outback-haul/ASSET_SOURCES.md` for specific models, source pages, and licence notes. Attribution is not required; optional credit is included there.


## Open-source Outback nature scenery

Outback v5 loads selected CC0 Quaternius nature models (trees, bushes, grasses and rocks) from the public `assets/quaternius-nature/` folder in The Wild Between repository. The game's existing procedural scenery is retained as a fallback if external assets fail to load. The asset loader creates InstancedMeshes using the existing Three.js r128 stack; there is no new npm dependency or build step for the static route. An internet connection is needed for the detailed nature models. Model names and separate asset licensing are documented in `outback-haul/ASSET_SOURCES.md`.

## Open-source Outback world objects (v6)

Scenic Outback v6 uses a curated group of 25 Kenney CC0 GLB model variants from the nature, city roads, suburban, car and prototype packs. Added scenery includes four tree models, rural fence panels and gates, power poles, three road-sign types, four small building styles, parked farm/town vehicles, horses, dogs, wheat crops, fallen logs and town utility details. The game requests only this selected subset from the public `Hidencod/tge-assets` jsDelivr mirror; it does not download or load the full 1,883-model catalog. See `outback-haul/ASSET_SOURCES.md` for model paths, asset origins and licence notes.

These are scenery objects, not replacements for the player SUV or traffic system. Existing road routes and geometry, driving physics, traffic, pedestrians and vehicle placement are retained. The assets are loaded asynchronously; if a category cannot be fetched, it is omitted (and the original procedural tree meshes remain available as a fallback). Internet access is required for the remote GLB models.


## Outback v6.1 tree silhouette correction

The Outback map removes Kenney's broad `tree-default`, `tree-detailed` and `tree-oak` models from the main tree mix. It now selects `tree-thin` and `tree-tall`, applies reduced horizontal scale and lower overall size, and reduces tree density for a more open Australian woodland. The fallback tree geometry was also changed from seven large spherical crown lobes to smaller elongated foliage clusters on lighter, branching trunks. Road geometry, player vehicle position and driving systems are unchanged.
