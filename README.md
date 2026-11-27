# Outback Haul - Scenic Outback v6.1 Tree Silhouette Update

This package builds on Outback Haul v6 and preserves its road network, SUV positioning and handling, physics, traffic, pedestrians, farm/town objects and Cloudflare static deployment layout.

The Outback tree selection has been corrected: broad Kenney `tree-default`, `tree-detailed` and `tree-oak` models have been removed from this biome. The map now selects only the narrower `tree-thin` and `tree-tall` CC0 models and scales them vertically with reduced horizontal width. The procedural fallback has also been revised to use slimmer trunks, finer branches and smaller elongated foliage clusters, with fewer trees and more open spacing.

Other world objects introduced in v6 remain unchanged. The selected tree and prop models load from the existing jsDelivr mirror and require internet access. If model loading fails, the reshaped procedural tree fallback remains available.

## Local test

From this package's `4x4_trucker` directory:

```bash
py -m http.server 8000
```

Open `http://localhost:8000/?map=outback`. Deploy the complete `4x4_trucker` folder as a static Cloudflare Pages project.

JavaScript syntax and relative-import checks are passed. Browser visual testing is not claimed. Asset names, origin and licenses are documented in `4x4_trucker/outback-haul/ASSET_SOURCES.md`.
