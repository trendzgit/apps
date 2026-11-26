import { Sprite, SpriteMaterial, CanvasTexture } from 'three';

const POOL = 40;

/** Pooled dust/smoke puffs kicked up behind the vehicle. */
export class DustParticles {
  constructor(scene) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const texture = new CanvasTexture(c);

    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const s = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      s.userData = { life: 0, vy: 0, size: 0 };
      scene.add(s);
      this.pool.push(s);
    }
    this.next = 0;
    this.cooldown = 0;
  }

  /** @param color hex number or null (no dust on this surface) */
  update(dt, x, z, y, color, speed) {
    this.cooldown -= dt;
    if (color != null && this.cooldown <= 0 && Math.abs(speed) > 3) {
      this.cooldown = 0.05;
      const p = this.pool[this.next++ % POOL];
      p.position.set(x + (Math.random() - 0.5) * 2, y + 0.3, z + (Math.random() - 0.5) * 2);
      Object.assign(p.userData, { life: 1, vy: 0.8 + Math.random(), size: 1.5 });
      p.visible = true;
      p.material.color.set(color);
    }
    for (const p of this.pool) {
      const u = p.userData;
      if (u.life <= 0) continue;
      u.life -= dt * 0.7;
      p.position.y += u.vy * dt;
      u.size += dt * 3;
      p.scale.set(u.size, u.size, 1);
      p.material.opacity = Math.max(0, u.life) * 0.4;
      if (u.life <= 0) p.visible = false;
    }
  }

  clear() {
    for (const p of this.pool) { p.userData.life = 0; p.visible = false; }
  }
}
