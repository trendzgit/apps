import { $ } from '../util/dom.js';

const IMG = 256; // resolution of the cached map image (px)
const VIEW = 256; // HUD canvas size

/** Render a map's top-down overview into `canvas` (also used for the map-select thumbnails). */
export function renderMapImage(map, canvas, px = IMG) {
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(px, px);
  const S = map.size;
  for (let row = 0; row < px; row++) {
    for (let col = 0; col < px; col++) {
      const x = S / 2 - ((col + 0.5) * S) / px;
      const z = S / 2 - ((row + 0.5) * S) / px;
      const c = map.minimapColor(x, z);
      const k = (row * px + col) * 4;
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Circular rotating minimap in the HUD; tap to enlarge. Also feeds the in-car nav screen. */
export class Minimap {
  constructor() {
    this.canvas = $('mm');
    this.ctx = this.canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.big = false;
    this.map = null;
    this.canvas.onclick = () => {
      this.big = !this.big;
      this.canvas.classList.toggle('big', this.big);
    };
  }

  setMap(map) {
    this.map = map;
    renderMapImage(map, this.base, IMG);
  }

  draw(state, job) {
    const map = this.map, S = map.size, ctx = this.ctx;
    const range = this.big ? 520 : 230; // metres from centre to edge of the circle
    const k = VIEW / 2 / range / (IMG / S); // image px -> canvas px
    const toImg = (v) => ((S / 2 - v) * IMG) / S;

    ctx.clearRect(0, 0, VIEW, VIEW);
    ctx.save();
    ctx.beginPath();
    ctx.arc(VIEW / 2, VIEW / 2, VIEW / 2 - 2, 0, 7);
    ctx.clip();
    ctx.translate(VIEW / 2, VIEW / 2);
    ctx.rotate(this.big ? 0 : state.h);
    ctx.scale(k, k);
    ctx.translate(-toImg(state.x), -toImg(state.z));
    ctx.drawImage(this.base, 0, 0);

    ctx.lineWidth = 1.5 / k;
    ctx.strokeStyle = '#2a1a0c';
    ctx.fillStyle = '#fff';
    for (const loc of map.locations) {
      ctx.beginPath();
      ctx.arc(toImg(loc.x), toImg(loc.z), 5 / k, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
    if (job) {
      const t = job.picked ? job.b : job.a;
      ctx.strokeStyle = '#ffc233';
      ctx.lineWidth = 3 / k;
      ctx.beginPath();
      ctx.arc(toImg(t.x), toImg(t.z), 9 / k, 0, 7);
      ctx.stroke();
    }
    ctx.restore();

    // player arrow
    ctx.save();
    ctx.translate(VIEW / 2, VIEW / 2);
    ctx.rotate(this.big ? -state.h : 0);
    ctx.fillStyle = '#ffcf5a';
    ctx.strokeStyle = '#2a1a0c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
