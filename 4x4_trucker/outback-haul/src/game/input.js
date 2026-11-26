import { $ } from '../util/dom.js';

const KEYS = { ArrowLeft: 'l', a: 'l', ArrowRight: 'r', d: 'r', ArrowUp: 'g', w: 'g', ArrowDown: 'b', s: 'b' };

/** Keyboard + on-screen pads. `held` = {l, r, g (gas), b (brake)}. */
export class Input {
  constructor() {
    this.held = { l: 0, r: 0, g: 0, b: 0 };

    document.querySelectorAll('[data-k]').forEach((btn) => {
      const k = btn.dataset.k;
      btn.onpointerdown = (e) => {
        this.held[k] = 1;
        btn.classList.add('on');
        btn.setPointerCapture(e.pointerId);
        e.preventDefault();
      };
      btn.onpointerup = btn.onpointercancel = () => {
        this.held[k] = 0;
        btn.classList.remove('on');
      };
      btn.oncontextmenu = (e) => e.preventDefault();
    });

    addEventListener('keydown', (e) => { if (KEYS[e.key]) this.held[KEYS[e.key]] = 1; });
    addEventListener('keyup', (e) => { if (KEYS[e.key]) this.held[KEYS[e.key]] = 0; });
  }

  /** Throttle / brake / steer in the shape the vehicle model wants. */
  get drive() {
    const h = this.held;
    return { th: h.g, br: h.b, st: h.l - h.r };
  }

  /** Bind HUD buttons and hotkeys. */
  bindActions(actions) {
    const bind = (id, key, fn) => {
      if (id) $(id).onclick = fn;
      if (key) addEventListener('keydown', (e) => { if (e.key === key) fn(); });
    };
    bind('sw', null, actions.switchVehicle);
    bind('shop', null, actions.buyVehicle);
    bind('job', null, actions.toggleJob);
    bind('home', 'r', actions.goHome);
    bind('cm', 'c', actions.cycleCamera);
    bind('mu', 'm', actions.toggleMute);
    bind('maps-btn', 'Escape', actions.openMaps);
  }
}
