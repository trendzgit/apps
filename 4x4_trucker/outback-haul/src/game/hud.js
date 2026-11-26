import { $ } from '../util/dom.js';

/** All DOM access for the in-game HUD lives here. */
export class Hud {
  constructor() {
    this.el = {
      speed: $('sp'), vehicle: $('vn'), clock: $('clk'), level: $('lv'), cash: $('cash'), mapName: $('mapname'),
      msg: $('msg'), jobBox: $('jb'), arrow: $('ar'), jobText: $('jt'),
      dialog: $('lvl'), dialogTitle: $('lt'), dialogBody: $('lb'), next: $('nx'), free: $('fr'),
      home: $('home'), mode: $('modeTag'), interact: $('interact'),
    };
    this._toast = 0;
  }

  setSpeed(v) { this.el.speed.textContent = v; }
  setClock(t) { this.el.clock.textContent = t; }
  setVehicle(name) { this.el.vehicle.textContent = name; }
  setMapName(name) { this.el.mapName.textContent = name; }
  setStats(level, cash) { this.el.level.textContent = level; this.el.cash.textContent = cash; }
  setHomeLabel(name) { this.el.home.setAttribute('aria-label', 'Back to ' + name); }
  setMode(mode) { this.el.mode.textContent = mode === 'foot' ? 'ON FOOT' : 'DRIVING'; }
  setInteract(label, visible) {
    this.el.interact.textContent = label;
    this.el.interact.classList.toggle('visible', !!visible);
  }

  toast(text) {
    const m = this.el.msg;
    m.textContent = text;
    m.style.opacity = 1;
    clearTimeout(this._toast);
    this._toast = setTimeout(() => (m.style.opacity = 0), 2600);
  }

  showJob(text, arrowDeg) {
    this.el.jobBox.style.display = 'block';
    this.el.jobText.textContent = text;
    this.el.arrow.style.transform = 'rotate(' + arrowDeg + 'deg)';
  }
  hideJob() { this.el.jobBox.style.display = 'none'; }

  showLevelComplete(title, html, nextLabel) {
    this.el.dialogTitle.textContent = title;
    this.el.dialogBody.innerHTML = html;
    this.el.next.textContent = nextLabel;
    this.el.dialog.style.display = 'block';
  }
  hideLevelComplete() { this.el.dialog.style.display = 'none'; }
}
