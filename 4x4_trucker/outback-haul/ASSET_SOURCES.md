# Third-party asset sources and licences

## Kenney Car Kit (CC0 1.0)

The game can load selected Kenney Car Kit vehicle bodies as GLB models at runtime. Kenney's official Car Kit page lists 45 assets and a Creative Commons CC0 licence; the pack page also advertises glTF format. CC0 allows reuse, modification and commercial use without requiring attribution.

- Official asset page: https://kenney.nl/assets/car-kit
- Official pack download / format and licence details: https://kenney-assets.itch.io/car-kit

The current game config points to these public GLB mirrors for convenience:

| In-game use | Model | Source page |
|---|---|---|
| Starting SUV | SUV | https://flockbay.com/assets/suv/ |
| Street sedan | Sedan | https://flockbay.com/assets/sedan/ |
| Street hatchback | Hatchback Sports | https://flockbay.com/assets/hatchback-sports/ |
| Street van | Delivery | https://flockbay.com/assets/delivery/ |
| Street truck | Truck | https://flockbay.com/assets/truck/ |

These GLB files are fetched from `api.flockbay.com` at runtime. An internet connection is required for the detailed replacement models. The original procedural vehicle meshes are retained as a fallback if a remote model fails to load. For long-term production reliability, download the official Kenney pack, keep its included CC0/readme files, and host the selected `.glb` plus texture files inside this repository (for example `4x4_trucker/outback-haul/models/`); then update each `modelUrl` in `src/vehicles/vehicleDefs.js` to a relative path.

Optional credit: `Vehicle models by Kenney (Kenney.nl), CC0 1.0.` Attribution is not required by CC0 but is appreciated.

## Outback nature scenery (selected Quaternius models, CC0 1.0)

Outback v5 can load a curated subset of the Quaternius Stylized Nature MegaKit through the public `assets/quaternius-nature/` folder in The Wild Between repository. The model files themselves are CC0 1.0, as stated in that repository's `assets/quaternius-nature/LICENSE.txt`; the Wild Between game's MIT code is not copied into Outback Haul.

- Runtime model host: https://cdn.jsdelivr.net/gh/anandin/the-wild-between@main/assets/quaternius-nature/
- Source repository: https://github.com/anandin/the-wild-between
- Asset license notice: https://raw.githubusercontent.com/anandin/the-wild-between/main/assets/quaternius-nature/LICENSE.txt
- Selected models: `TwistedTree_2`, `TwistedTree_4`, `TwistedTree_5`, `CommonTree_3`, `CommonTree_4`, `CommonTree_5`, `DeadTree_2`, `Bush_Common`, `Bush_Common_Flowers`, `Grass_Common_Tall`, `Grass_Wispy_Short`, `Rock_Medium_1`, and `Rock_Medium_2`.
- Source pack: Quaternius Stylized Nature MegaKit, standard/free model set. The repo's license note says the standard pack contains 68 of the 116 models; all are CC0 1.0.

The selected models include textured bark and alpha-cut foliage and are loaded as instanced meshes by `src/maps/builders/natureAssets.js`. This avoids a new engine dependency and is compatible with the project's Three.js r128 GLTFLoader because these source files are ordinary glTF assets, not the meshopt/KTX2-compressed tevy models.

**Runtime note:** these nature model files are fetched from jsDelivr on first use, so the browser needs an internet connection. If the remote files cannot be reached, Outback retains its procedural scenery rather than failing to load. For a fully offline/self-hosted deployment, copy the selected glTF files and their referenced buffers/textures from the source repository into a local asset directory and change `NATURE_ASSET_BASE` to that local directory.


## Outback world objects (selected Kenney models, CC0 1.0)

Outback v6 adds a curated set of environment props from Kenney's CC0 model packs. The models are mirrored in the `Hidencod/tge-assets` repository as self-contained GLB files with embedded material/texture data. The repository catalog lists 1,883 models across 19 packs; Outback uses only the models listed below, not the entire catalog.

- Original asset author / publisher: https://kenney.nl/assets (individual packs are linked below).
- Model mirror and catalog: https://github.com/Hidencod/tge-assets
- Catalog: https://raw.githubusercontent.com/Hidencod/tge-assets/main/catalog.json
- Runtime host: `https://cdn.jsdelivr.net/gh/Hidencod/tge-assets@main/`
- Upstream licence: CC0 1.0 (the Kenney model packs).

Selected models used by Outback v6:

| In-game category | GLB model files |
|---|---|
| Outback trees | `nature-kit/tree-thin.glb`, `tree-tall.glb` (narrowly scaled for an open mallee/eucalypt silhouette) |
| Rural fencing | `nature-kit/fence-simple.glb`, `fence-planks.glb`, `fence-gate.glb` |
| Crops and fallen timber | `nature-kit/crops-wheatstageb.glb`, `log-large.glb` |
| Utility poles and road signs | `city-kit-roads/electricity-pole-single.glb`, `road-sign-warning.glb`, `road-sign-stop.glb`, `road-sign-street.glb` |
| Town buildings | `city-kit-suburban/building-type-a.glb`, `building-type-c.glb`, `building-type-h.glb`, `building-type-k.glb` |
| Parked farm / town vehicles | `car-kit/suv.glb`, `truck-flat.glb`, `tractor.glb`, `van.glb` |
| Farm animals | `prototype-kit/animal-horse.glb`, `animal-dog.glb` |
| Town utility details | `city-kit-roads/dumpster.glb`, `construction-barrier.glb` |

The new asset loader is in `src/maps/builders/libraryAssets.js`. It loads selected GLBs as instanced meshes, with per-category failure handling. The tree category retains the procedural tree meshes as a fallback; other decorative categories are optional and simply remain absent if a request fails. No third-party game code has been copied. The object placement code is new Outback integration code.

**Runtime note:** these models are fetched from jsDelivr when Outback loads, so an internet connection is required. This package does not bundle the model binaries. For a fully offline or CDN-independent deployment, download the selected GLBs from the mirror, retain the upstream CC0 notices, place them under a local models directory, and change `KENNEY_LIBRARY_BASE` in `src/maps/builders/libraryAssets.js` to a local URL.

### Placement scope and gameplay safety

The selected buildings, signs, poles, fences, parked vehicles, crops, logs and animals are scenery objects only. The parked vehicles do not enter the traffic simulation. The existing player SUV, road meshes, road paths, handling, vehicle physics, traffic and pedestrian systems are not replaced by these assets. Town buildings receive simple static box colliders; the other added props are decorative.


## Outback v6.1 tree-shape correction

The Outback biome no longer uses Kenney's broad `tree-default`, `tree-detailed`, or `tree-oak` models. It uses only `tree-thin` and `tree-tall`, with narrower horizontal scale and slightly reduced target heights. The procedural fallback was also reshaped to use a taller trunk, lighter branch structure, and small elongated leaf clusters rather than seven large round crown lobes. Other maps and the rest of the v6 world props are unchanged.
