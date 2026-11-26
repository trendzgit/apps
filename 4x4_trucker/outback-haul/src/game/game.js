import { Group, SpotLight } from 'three';
import { LOW_QUALITY } from '../config.js';
import { $ } from '../util/dom.js';
import { disposeTree } from '../util/dispose.js';
import { createStage } from '../engine/stage.js';
import { Atmosphere } from '../engine/atmosphere.js';
import { PhysicsWorld } from '../engine/physics.js';
import { VehiclePhysics } from '../engine/vehiclePhysics.js';
import { ColliderGrid } from '../engine/colliders.js';
import { EngineAudio } from '../engine/audio.js';
import { DustParticles } from '../engine/particles.js';
import { VEHICLES } from '../vehicles/vehicleDefs.js';
import { createVehicleVisual, tryLoadGlb } from '../vehicles/vehicleModels.js';
import { createCockpit } from '../vehicles/cockpit.js';
import { MAPS, getMap } from '../maps/index.js';
import { loadSave, persist, mapProgress } from './save.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Minimap } from './minimap.js';
import { CameraRig } from './cameraRig.js';
import { JobSystem } from './jobs.js';
import { MapSelect } from './mapSelect.js';
import { TrafficSystem } from '../traffic/trafficSystem.js';

/** Wires every system together and runs the main loop. */
export function createGame() {
  const params = new URLSearchParams(location.search);
  const stage = createStage();
  const atmosphere = new Atmosphere(stage);
  const physics = new PhysicsWorld();
  const vehiclePhysics = new VehiclePhysics(physics);
  const colliders = new ColliderGrid();
  const audio = new EngineAudio();
  const dust = new DustParticles(stage.scene);
  const hud = new Hud();
  const input = new Input();
  const minimap = new Minimap();
  const cameraRig = new CameraRig(stage);
  const save = loadSave(VEHICLES.length);
  const jobs = new JobSystem({ scene: stage.scene, hud, save });
  const mapSelect = new MapSelect({ save, onPick: (m) => loadMap(m) });

  /** The player's live state, written by VehiclePhysics each frame. */
  const state = { x: 0, z: 0, h: 0, v: 0, y: 0, ss: 0, hit: 0, land: 0, air: false };
  let map = null, mapGroup = null, mapRuntime = null, vehicleIndex = 0, visual = null, loading = false;
  let traffic = null;
  const playerInfo = { x: 0, z: 0, h: 0, v: 0, length: 4.4, width: 1.8 }; // what the traffic AI needs to know about you

  // ---- vehicles ---------------------------------------------------------------------------
  function selectVehicle(index) {
    vehicleIndex = index % VEHICLES.length;
    const def = VEHICLES[vehicleIndex];
    if (visual) {
      stage.scene.remove(visual.group);
      cameraRig.setCockpit(visual.cockpit, null);
      disposeTree(visual.group);
      if (visual.cockpit) disposeTree(visual.cockpit);
    }
    visual = createVehicleVisual(def);
    stage.scene.add(visual.group);

    const lamp = new SpotLight(0xfff1d0, 0, 80, 0.5, 0.6, 1);
    lamp.position.set(0, 0.9, 1.8);
    lamp.target.position.set(0, 0, 14);
    visual.group.add(lamp, lamp.target);
    visual.lamp = lamp;

    tryLoadGlb(def, visual);
    visual.cockpit = createCockpit(def, $('mm'), cameraRig.mirrorTexture);
    cameraRig.setCockpit(null, visual.cockpit);
    hud.setVehicle(def.name);
    vehiclePhysics.spawn(def, state.x, map.heightAt(state.x, state.z) + 1.4, state.z, state.h);
  }

  // ---- maps -------------------------------------------------------------------------------
  function unloadMap() {
    if (!mapGroup) return;
    stage.scene.remove(mapGroup);
    disposeTree(mapGroup);
    colliders.clear();
    mapGroup = mapRuntime = null;
    traffic = null;
    jobs.cancel(true);
  }

  function loadMap(next) {
    loading = true;
    $('loadingText').textContent = 'Loading ' + next.name + '…';
    $('loading').style.display = 'flex';
    // let the loading screen paint before the (synchronous) world build blocks the thread
    requestAnimationFrame(() => requestAnimationFrame(() => {
      unloadMap();
      map = next;
      physics.setTerrain(map.heightAt, map.size, map.physicsDivisions);
      mapGroup = new Group();
      stage.scene.add(mapGroup);
      mapRuntime = map.build({ group: mapGroup, colliders, low: LOW_QUALITY }) || {};
      atmosphere.configure(map.atmosphere);
      minimap.setMap(map);
      jobs.setMap(map);
      dust.clear();

      const prog = mapProgress(save, map.id);
      hud.setMapName(map.name);
      hud.setHomeLabel(map.spawn.name);
      hud.setStats(prog.level, save.cash);
      hud.hideJob();
      hud.hideLevelComplete();
      save.lastMap = map.id;
      persist(save);

      Object.assign(state, { x: map.spawn.x, z: map.spawn.z, h: map.spawn.h, v: 0, ss: 0 });
      if (!save.owned[vehicleIndex]) vehicleIndex = save.owned.findIndex(Boolean);
      selectVehicle(vehicleIndex);
      // ?traffic=N overrides the car count (0 = none); low quality uses fewer cars by default
      const wanted = params.has('traffic') ? Math.max(0, parseInt(params.get('traffic'), 10) || 0) : null;
      const count = wanted ?? Math.round((map.traffic?.count ?? 0) * (LOW_QUALITY ? 0.6 : 1));
      if (map.traffic && count > 0) {
        traffic = new TrafficSystem({ config: { ...map.traffic, count }, group: mapGroup, colliders, onHonk: (d) => audio.honk(d) });
        Object.assign(playerInfo, { x: state.x, z: state.z, h: state.h, v: 0 });
        traffic.populate(playerInfo);
      }
      hud.toast(map.name + ': free roam. Tap 📦 for an optional delivery job');
      $('loading').style.display = 'none';
      loading = false;
    }));
  }

  // ---- actions ----------------------------------------------------------------------------
  const goHome = () => {
    if (!map) return;
    const s = map.spawn;
    Object.assign(state, { x: s.x, z: s.z, h: s.h, v: 0 });
    vehiclePhysics.teleport(s.x, map.heightAt(s.x, s.z) + 1.4, s.z, s.h);
  };

  input.bindActions({
    switchVehicle() {
      if (!map) return;
      let i = vehicleIndex;
      do i = (i + 1) % VEHICLES.length; while (!save.owned[i]);
      selectVehicle(i);
      hud.toast(VEHICLES[vehicleIndex].name);
    },
    buyVehicle() {
      if (!map) return;
      const i = save.owned.indexOf(0);
      if (i < 0) return hud.toast('All vehicles owned');
      const def = VEHICLES[i];
      if (save.cash < def.cost) return hud.toast(def.name + ': ' + def.cost + ' cr to unlock (you have ' + save.cash + ')');
      save.cash -= def.cost;
      save.owned[i] = 1;
      selectVehicle(i);
      persist(save);
      hud.setStats(mapProgress(save, map.id).level, save.cash);
      hud.toast(def.name + ' unlocked');
    },
    toggleJob() { if (map) jobs.toggle(state); },
    goHome,
    cycleCamera() { hud.toast(cameraRig.cycle()); },
    toggleMute() { $('mu').textContent = audio.toggleMute() ? '🔇' : '🔊'; },
    openMaps() {
      if (loading) return;
      if (mapSelect.visible) { if (mapSelect.canClose) mapSelect.hide(); } else mapSelect.show(map && map.id);
    },
  });

  $('nx').onclick = () => { hud.hideLevelComplete(); jobs.start(state); };
  $('fr').onclick = () => hud.hideLevelComplete();

  // ---- frame ------------------------------------------------------------------------------
  function update(dt) {
    const def = VEHICLES[vehicleIndex];
    const surface = map.surfaces[map.surfaceAt(state.x, state.z)];
    const throttle = input.held.g;

    vehiclePhysics.step(def, visual, state, input.drive, surface, dt, colliders, map, traffic);
    if (traffic) {
      Object.assign(playerInfo, { x: state.x, z: state.z, h: state.h, v: state.v, length: def.length, width: def.width });
      traffic.update(dt, playerInfo);
    }
    if (state.hit > 2 || state.land > 3) {
      const force = Math.max(state.hit, state.land);
      audio.thud(force);
      cameraRig.bump(force);
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(Math.min(80, force * 6));
    }
    audio.update(def, state, throttle, surface);
    cameraRig.update(dt, { def, visual, state, surface, heightAt: map.heightAt, throttle });

    atmosphere.update(dt, state);
    visual.lamp.intensity = atmosphere.night * 1.6;
    traffic?.setNight(atmosphere.night);
    mapRuntime?.update?.(dt, { night: atmosphere.night });

    hud.setClock(atmosphere.clockText);
    hud.setSpeed(Math.round(Math.abs(state.v) * 3.6));
    minimap.draw(state, jobs.job);
    dust.update(
      dt,
      state.x - Math.sin(state.h) * def.length / 2,
      state.z - Math.cos(state.h) * def.length / 2,
      state.y,
      surface.dust,
      state.air ? 0 : state.v,
    );
    jobs.update(dt, state, map.heightAt);
  }

  let last = performance.now();
  (function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!map || loading) return;
    if (dt > 0 && !mapSelect.visible) update(dt);
    cameraRig.render(state);
  })(last);

  // ---- boot -------------------------------------------------------------------------------
  const direct = params.get('map');
  if (direct && MAPS.some((m) => m.id === direct)) loadMap(getMap(direct));
  else mapSelect.show(null);

  if (params.has('debug')) window.__game = { update, colliders, get traffic() { return traffic; }, state, save, get map() { return map; }, input, vehiclePhysics, cameraRig, stage, atmosphere, jobs, loadMap, MAPS };
}
