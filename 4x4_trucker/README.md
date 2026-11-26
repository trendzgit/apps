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
