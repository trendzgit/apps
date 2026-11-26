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
