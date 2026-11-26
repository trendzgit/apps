# Outback Haul — local run and deployment

The updated game entry page is `index.html`. Its modules and stylesheet live in `outback-haul/`.
Keep the whole `4x4_trucker` folder together when copying or deploying it.

## Run locally (no npm required)

On Windows, double-click `start_game.bat`. It starts a small Python web server and opens:

`http://127.0.0.1:8000/index.html`

Alternatively, open PowerShell in this folder and run:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Then visit `http://127.0.0.1:8000/index.html`.

Do not double-click `index.html` to use `file://`; browsers commonly block JavaScript ES modules in that mode. No npm install or Vite build is needed for this CDN/import-map version. An internet connection is required to load Three.js and cannon-es from jsDelivr.

## Controls

- Stop the vehicle and press **E** to exit.
- On foot, use **WASD** or **arrow keys** to walk; hold **Shift** to sprint.
- Move back within interaction range of the parked vehicle and press **E** to enter.
- Drag the mouse on the scene to orbit the on-foot camera.

To deploy to Cloudflare Pages, publish the complete contents of this `4x4_trucker` directory, not just `index.html`.
