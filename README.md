# Personal Apps

This repository contains small standalone applications. `4x4_trucker/` hosts **Outback Haul**, a Three.js + cannon-es open-world driving game.

## Deploy Outback Haul on Cloudflare Pages

Deploy the repository as static files. No build command is required for the Cloudflare-ready entry point. Keep the complete `4x4_trucker/` folder and its `outback-haul/` source folder together. The game loads Three.js and cannon-es from jsDelivr and optional Kenney GLB vehicle models from public asset endpoints, so visitors need an internet connection.

Game URL after deployment: `/4x4_trucker/`

## On-foot and street-vehicle controls

- Stop and press **E** to exit your current vehicle.
- On foot, **WASD / arrow keys sprint by default**. Hold **Ctrl** on desktop or hold the on-screen **WALK** button on mobile to walk.
- Approach a street vehicle and press **E** to take it. Its traffic instance is removed, an occupant exits and runs away, and the vehicle becomes player-controlled.
- Previously used vehicles remain parked and can be entered again with **E**.

## Vehicle assets

The game uses optional Kenney Car Kit vehicle models, licensed CC0 1.0, with procedural vehicle meshes as a fallback. Model sources and licence notes are in [`4x4_trucker/outback-haul/ASSET_SOURCES.md`](./4x4_trucker/outback-haul/ASSET_SOURCES.md).
