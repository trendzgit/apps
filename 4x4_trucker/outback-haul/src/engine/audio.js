/** Procedural engine + tyre noise + impact thud (Web Audio, no asset files). */
export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    const unlock = () => this.init();
    for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlock, { once: true });
  }

  _filter(type, freq) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    return f;
  }

  init() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    ctx.resume();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);

    // engine: saw + square an octave down through a low-pass
    this.saw = ctx.createOscillator(); this.saw.type = 'sawtooth';
    this.square = ctx.createOscillator(); this.square.type = 'square';
    this.engineFilter = this._filter('lowpass', 400);
    this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0;
    this.saw.connect(this.engineFilter); this.square.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.master);
    this.saw.start(); this.square.start();

    // tyre/road noise: looping white noise through a band-pass
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    this.roadFilter = this._filter('bandpass', 800);
    this.roadGain = ctx.createGain(); this.roadGain.gain.value = 0;
    src.connect(this.roadFilter); this.roadFilter.connect(this.roadGain); this.roadGain.connect(this.master);
    src.start();
  }

  /** Per-frame: pitch follows a 5-"gear" rev model, road noise follows speed and surface. */
  update(def, state, throttle, surface) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const speedFrac = Math.min(1, Math.abs(state.v) / def.topSpeed);
    const gear = Math.min(4, (speedFrac * 5) | 0);
    let rpm = 0.12 + 0.88 * (speedFrac * 5 - gear);
    if (throttle && speedFrac < 0.05) rpm = 0.5;
    if (state.air) rpm = throttle ? 0.85 : 0.2;
    const freq = (38 + rpm * 95) * (1.4 - def.length * 0.1);
    this.saw.frequency.setTargetAtTime(freq, t, 0.05);
    this.square.frequency.setTargetAtTime(freq * 0.5, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(250 + rpm * 900 + (throttle ? 500 : 0), t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.1 + (throttle ? 0.08 : 0) + 0.08 * rpm, t, 0.06);
    this.roadFilter.frequency.setTargetAtTime(surface.tireFreq * (0.6 + 0.8 * speedFrac), t, 0.1);
    this.roadGain.gain.setTargetAtTime(state.air ? 0 : (0.04 + 0.4 * speedFrac) * surface.tireGain, t, 0.08);
  }

  thud(intensity) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const filter = this._filter('lowpass', 180 + intensity * 25);
    src.buffer = this.noise;
    gain.gain.setValueAtTime(Math.min(1, intensity / 12), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t, Math.random(), 0.45);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.6;
    return this.muted;
  }
}
