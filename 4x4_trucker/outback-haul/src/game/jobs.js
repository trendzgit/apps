import { Mesh, CylinderGeometry, MeshBasicMaterial } from 'three';
import { mapProgress, persist } from './save.js';

/** Default economy. Each map can override any key via `map.economy`. */
export const DEFAULT_ECONOMY = {
  minDistance: 120,       // job length at level 1 ...
  distancePerLevel: 45,   // ... grows by this per level ...
  maxDistance: 520,       // ... up to this
  payPerMetre: 0.5,
  levelPayGrowth: 0.15,   // +15% pay per level above 1
  bonusBase: 100,         // on-time bonus = bonusBase + bonusPerLevel * level
  bonusPerLevel: 25,
  speedBase: 7,           // time limit assumes this average speed (m/s) ...
  speedPerLevel: 0.7,     // ... +0.7 per level
  timeSlack: 40,          // seconds of grace
  pickupRadius: 16,
};

/** Delivery jobs: pick up at A, deliver to B before the clock runs out. Pays cash and raises the map's level. */
export class JobSystem {
  constructor({ scene, hud, save }) {
    this.hud = hud;
    this.save = save;
    this.map = null;
    this.job = null;
    this.beacon = new Mesh(
      new CylinderGeometry(3, 3, 120, 16, 1, true),
      new MeshBasicMaterial({ color: 0xffc233, transparent: true, opacity: 0.28, depthWrite: false, fog: false }),
    );
    this.beacon.visible = false;
    scene.add(this.beacon);
  }

  setMap(map) {
    this.map = map;
    this.eco = { ...DEFAULT_ECONOMY, ...map.economy };
    this.cancel(true);
  }

  get level() { return mapProgress(this.save, this.map.id).level; }

  start(player) {
    const locs = this.map.locations, eco = this.eco;
    const far = locs.filter((l) => Math.hypot(l.x - player.x, l.z - player.z) > 100);
    const pool = far.length ? far : locs;
    const minDist = Math.min(eco.maxDistance, eco.minDistance + this.level * eco.distancePerLevel);
    let a, b, tries = 0;
    do {
      a = pool[(Math.random() * pool.length) | 0];
      b = locs[(Math.random() * locs.length) | 0];
      tries++;
    } while ((a === b || Math.hypot(a.x - b.x, a.z - b.z) < minDist) && tries < 60);
    if (a === b) b = locs[(locs.indexOf(a) + 1) % locs.length];
    this.job = { a, b, picked: 0, t: 0 };
    this.hud.toast('Level ' + this.level + ': pick up parcels at ' + a.name);
  }

  cancel(silent = false) {
    if (!this.job) return;
    this.job = null;
    this.beacon.visible = false;
    this.hud.hideJob();
    if (!silent) this.hud.toast('Job cancelled');
  }

  toggle(player) {
    if (this.job) this.cancel();
    else this.start(player);
  }

  update(dt, player, heightAt) {
    const job = this.job;
    if (!job) return;
    const target = job.picked ? job.b : job.a;
    const dx = target.x - player.x, dz = target.z - player.z;
    const dist = Math.hypot(dx, dz);
    this.beacon.visible = true;
    this.beacon.position.set(target.x, heightAt(target.x, target.z) + 60, target.z);
    if (job.picked) job.t -= dt;
    this.hud.showJob(
      (job.picked ? 'Deliver to ' : 'Pick up at ') + target.name + ' ' + Math.round(dist) + ' m' +
        (job.picked ? '  ' + Math.max(0, Math.ceil(job.t)) + 's' : ''),
      -(Math.atan2(dx, dz) - player.h) * 57.3,
    );
    if (dist < this.eco.pickupRadius) {
      if (job.picked) this.complete();
      else {
        job.picked = 1;
        job.t = Math.hypot(job.a.x - job.b.x, job.a.z - job.b.z) / (this.eco.speedBase + this.level * this.eco.speedPerLevel) + this.eco.timeSlack;
        this.hud.toast('Loaded. Deliver to ' + job.b.name);
      }
    }
  }

  complete() {
    const { job, eco } = this;
    const prog = mapProgress(this.save, this.map.id);
    const dist = Math.hypot(job.a.x - job.b.x, job.a.z - job.b.z);
    const onTime = job.t > 0;
    const pay = Math.round(dist * eco.payPerMetre * (1 + eco.levelPayGrowth * (prog.level - 1)));
    const bonus = onTime ? eco.bonusBase + eco.bonusPerLevel * prog.level : 0;
    const total = pay + bonus;

    this.save.cash += total;
    prog.earned += total;
    this.job = null;
    this.beacon.visible = false;
    this.hud.hideJob();
    const finished = prog.level;
    prog.level++;
    persist(this.save);
    this.hud.setStats(prog.level, this.save.cash);
    this.hud.showLevelComplete(
      'Level ' + finished + ' complete',
      'Delivery +' + pay + ' cr<br>' + (onTime ? 'On-time bonus +' + bonus + ' cr' : 'Late: no bonus') +
        '<br><b>+' + total + ' cr</b> · total ' + this.save.cash + ' cr',
      'Start level ' + prog.level,
    );
  }
}
