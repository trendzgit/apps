import { $ } from '../util/dom.js';
import { MAPS } from '../maps/index.js';
import { renderMapImage } from './minimap.js';
import { mapProgress } from './save.js';

/** Full-screen map chooser with a live-rendered overview thumbnail per map. */
export class MapSelect {
  constructor({ save, onPick }) {
    this.save = save;
    this.onPick = onPick;
    this.root = $('maps');
    this.list = $('mapList');
    this.hint = $('mapsClose');
    this.canClose = false;
    this.currentId = null;
    this.thumbs = new Map();

    // clicking the dimmed background (not a card) closes it, when there is a game to return to
    this.root.addEventListener('click', (e) => { if (this.canClose && !e.target.closest('.card')) this.hide(); });
  }

  _thumb(map) {
    if (!this.thumbs.has(map.id)) this.thumbs.set(map.id, renderMapImage(map, document.createElement('canvas'), 160));
    return this.thumbs.get(map.id);
  }

  show(currentId) {
    this.currentId = currentId;
    this.canClose = !!currentId;
    this.hint.style.display = this.canClose ? 'block' : 'none';
    this.list.innerHTML = '';
    for (const map of MAPS) {
      const card = document.createElement('div');
      card.className = 'card' + (map.id === currentId ? ' current' : '');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      const p = mapProgress(this.save, map.id);
      const canvas = this._thumb(map);
      const preview = document.createElement('canvas');
      preview.width = preview.height = 160;
      preview.getContext('2d').drawImage(canvas, 0, 0);
      const title = document.createElement('h2'); title.textContent = map.name;
      const tag = document.createElement('div'); tag.className = 'tag'; tag.textContent = map.tagline;
      const meta = document.createElement('div'); meta.className = 'meta';
      meta.textContent = 'Level ' + p.level + (p.earned ? ' · ' + p.earned + ' cr earned here' : ' · not played yet');
      card.append(preview, title, tag, meta);
      const pick = () => { this.hide(); this.onPick(map); };
      card.onclick = pick;
      card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') pick(); };
      this.list.append(card);
    }
    this.root.style.display = 'flex';
  }

  hide() { this.root.style.display = 'none'; }
  get visible() { return this.root.style.display !== 'none'; }
}
