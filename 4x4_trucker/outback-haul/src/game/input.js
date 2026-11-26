import { $ } from '../util/dom.js';

// Accept both physical key codes and key values. `code` keeps the controls reliable
// when the keyboard layout or Caps Lock changes the value reported by `event.key`.
const KEYS = {
  ArrowLeft: 'l', KeyA: 'l', a: 'l', A: 'l',
  ArrowRight: 'r', KeyD: 'r', d: 'r', D: 'r',
  ArrowUp: 'g', KeyW: 'g', w: 'g', W: 'g',
  ArrowDown: 'b', KeyS: 'b', s: 'b', S: 'b',
};

/** Keyboard + on-screen pads. The same directions drive the vehicle or move the character. */
export class Input {
  constructor() {
    this.held = { l: 0, r: 0, g: 0, b: 0, run: 0, walk: 0 };
    this.actions = new Map();

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

    // One capture-phase handler owns keyboard input. This avoids shortcut listeners
    // being lost when the canvas or HUD has focus, and handles the physical KeyE key.
    this._keyDown = (e) => {
      const key = e.key || '';
      const code = e.code || '';
      const direction = KEYS[code] || KEYS[key] || KEYS[key.toLowerCase()];
      if (direction) {
        this.held[direction] = 1;
        if (e.ctrlKey) e.preventDefault(); // keep Ctrl+W walking from triggering the browser's close-tab shortcut
      }
      if (key === 'Shift' || code.startsWith('Shift')) this.held.run = 1;
      if (key === 'Control' || code.startsWith('Control')) { this.held.walk = 1; e.preventDefault(); }

      if (e.repeat) return;
      const action = this.actions.get(code) || this.actions.get(key.toLowerCase());
      if (action) {
        e.preventDefault();
        action();
      }
    };

    this._keyUp = (e) => {
      const key = e.key || '';
      const code = e.code || '';
      const direction = KEYS[code] || KEYS[key] || KEYS[key.toLowerCase()];
      if (direction) this.held[direction] = 0;
      if (key === 'Shift' || code.startsWith('Shift')) this.held.run = 0;
      if (key === 'Control' || code.startsWith('Control')) this.held.walk = 0;
    };

    window.addEventListener('keydown', this._keyDown, true);
    window.addEventListener('keyup', this._keyUp, true);
    window.addEventListener('blur', () => {
      for (const k of Object.keys(this.held)) this.held[k] = 0;
      document.querySelectorAll('[data-k].on').forEach((b) => b.classList.remove('on'));
    });
  }

  /** Throttle / brake / steer in the shape the vehicle model wants. */
  get drive() {
    const h = this.held;
    return { th: h.g, br: h.b, st: h.l - h.r };
  }

  /** Camera-relative on-foot movement: x = strafe, y = forward/back. */
  get movement() {
    const h = this.held;
    return { x: h.r - h.l, y: h.g - h.b };
  }

  /** Bind HUD buttons and physical keyboard shortcuts. */
  bindActions(actions) {
    const bind = (id, fn) => { if (id && $(id)) $(id).onclick = fn; };
    bind('sw', actions.switchVehicle);
    bind('shop', actions.buyVehicle);
    bind('job', actions.toggleJob);
    bind('home', actions.goHome);
    bind('cm', actions.cycleCamera);
    bind('mu', actions.toggleMute);
    bind('maps-btn', actions.openMaps);
    bind('interact', actions.interact);

    this.actions.clear();
    const add = (code, key, fn) => {
      if (!fn) return;
      if (code) this.actions.set(code, fn);
      if (key) this.actions.set(key.toLowerCase(), fn);
    };
    add('KeyR', 'r', actions.goHome);
    add('KeyC', 'c', actions.cycleCamera);
    add('KeyM', 'm', actions.toggleMute);
    add('Escape', 'escape', actions.openMaps);
    add('KeyE', 'e', actions.interact);
  }
}
