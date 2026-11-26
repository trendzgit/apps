import { Group, SpotLight } from 'three';
import { LOW_QUALITY } from '../config.js';
import { $ } from '../util/dom.js';
import { disposeTree } from '../util/dispose.js';
import { createStage } from '../engine/stage.js';
import { Atmosphere } from '../engine/atmosphere.js';
import { PhysicsWorld } from '../engine/physics.js';
import { VehiclePhysics } from '../engine/vehiclePhysics.js';
import { ColliderGrid, resolveColliders } from '../engine/colliders.js';
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
import { CharacterController } from './characterController.js';
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
  const character = new CharacterController(stage.scene);
  const save = loadSave(VEHICLES.length);
  const jobs = new JobSystem({ scene: stage.scene, hud, save });
  const mapSelect = new MapSelect({ save, onPick: (m) => loadMap(m) });

  /** The vehicle's live state, written by VehiclePhysics each frame. */
  const state = { x: 0, z: 0, h: 0, v: 0, y: 0, ss: 0, hit: 0, land: 0, air: false };
  let map = null, mapGroup = null, mapRuntime = null, vehicleIndex = 0, visual = null, loading = false;
  let traffic = null;
  let gameMode = 'vehicle'; // vehicle | foot | entering | exiting
  const playerInfo = { x: 0, z: 0, h: 0, v: 0, length: 4.4, width: 1.8 };

  const activePlayer = () => gameMode === 'vehicle' ? state : character.state;
  const vehicleObstacle = () => ({ x: state.x, z: state.z, h: state.h, length: VEHICLES[vehicleIndex].length, width: VEHICLES[vehicleIndex].width });

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

      gameMode = 'vehicle';
      character.setVisible(false);
      character.action = null;
      cameraRig.setOnFoot(false);
      hud.setMode('vehicle');
      hud.setInteract('🚶 Exit · E', false);

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
      const wanted = params.has('traffic') ? Math.max(0, parseInt(params.get('traffic'), 10) || 0) : null;
      const count = wanted ?? Math.round((map.traffic?.count ?? 0) * (LOW_QUALITY ? 0.6 : 1));
      if (map.traffic && count > 0) {
        traffic = new TrafficSystem({ config: { ...map.traffic, count }, group: mapGroup, colliders, onHonk: (d) => audio.honk(d) });
        Object.assign(playerInfo, { x: state.x, z: state.z, h: state.h, v: 0 });
        traffic.populate(playerInfo);
      }
      hud.toast('Free roam. Stop and press E to exit; press E beside your vehicle to enter.');
      $('loading').style.display = 'none';
      loading = false;
    }));
  }

  // ---- on-foot / vehicle interaction -------------------------------------------------------
  function findExitPoint(def) {
    const c = Math.cos(state.h), s = Math.sin(state.h);
    const options = [
      { x: -(def.width / 2 + 0.88), z: -0.18, side: -1, forward: 0 },
      { x: def.width / 2 + 0.88, z: -0.18, side: 1, forward: 0 },
      { x: 0, z: -(def.length / 2 + 1.05), side: 0, forward: -1 },
      { x: 0, z: def.length / 2 + 1.05, side: 0, forward: 1 },
    ];
    for (const o of options) {
      const x = state.x + c * o.x + s * o.z;
      const z = state.z - s * o.x + c * o.z;
      if (Math.abs(x) > map.bound - 1 || Math.abs(z) > map.bound - 1) continue;
      const test = { x, z }, vel = { x: 0, z: 0 };
      resolveColliders(colliders, test, vel, 0.38, state.h, 0);
      if (Math.hypot(test.x - x, test.z - z) > 0.1) continue;
      if (traffic) {
        const trafficTest = { x, z }, trafficVel = { x: 0, z: 0 };
        traffic.resolve(trafficTest, trafficVel, 0.38, state.h, 0);
        if (Math.hypot(trafficTest.x - x, trafficTest.z - z) > 0.1) continue;
      }
      const awayLocalX = o.side ? o.side * 0.55 : 0;
      const awayLocalZ = o.forward ? o.forward * 0.55 : 0;
      return {
        x, z,
        moveX: c * awayLocalX + s * awayLocalZ,
        moveZ: -s * awayLocalX + c * awayLocalZ,
      };
    }
    return null;
  }

  function interact() {
    if (!map || loading || mapSelect.visible || gameMode === 'entering' || gameMode === 'exiting') return;
    const def = VEHICLES[vehicleIndex];
    if (gameMode === 'vehicle') {
      if (Math.abs(state.v) > 0.7) {
        hud.toast('Bring the vehicle to a stop before exiting');
        return;
      }
      const exit = findExitPoint(def);
      if (!exit) {
        hud.toast('No clear space to exit. Move the vehicle first');
        return;
      }
      vehiclePhysics.park();
      audio.park();
      character.teleport(exit.x, exit.z, state.h, map);
      character.startAction('exit', { duration: 0.72, moveX: exit.moveX, moveZ: exit.moveZ });
      gameMode = 'exiting';
      cameraRig.setOnFoot(true, character.state, visual);
      hud.setMode('foot');
      hud.toast('On foot: WASD / arrows to move, Shift to sprint, E by the vehicle to enter');
      return;
    }

    const distance = Math.hypot(character.state.x - state.x, character.state.z - state.z);
    if (distance > 3.7) {
      hud.toast('Move closer to your vehicle to enter');
      return;
    }
    character.startAction('enter', { duration: 0.72 });
    gameMode = 'entering';
    hud.setInteract('Entering…', false);
    hud.toast('Entering vehicle…');
  }

  // ---- actions ----------------------------------------------------------------------------
  const goHome = () => {
    if (!map) return;
    if (gameMode !== 'vehicle') {
      hud.toast('Enter your vehicle before returning home');
      return;
    }
    const s = map.spawn;
    Object.assign(state, { x: s.x, z: s.z, h: s.h, v: 0 });
    vehiclePhysics.teleport(s.x, map.heightAt(s.x, s.z) + 1.4, s.z, s.h);
  };

  input.bindActions({
    switchVehicle() {
      if (!map) return;
      if (gameMode !== 'vehicle') return hud.toast('Enter your vehicle to switch vehicles');
      let i = vehicleIndex;
      do i = (i + 1) % VEHICLES.length; while (!save.owned[i]);
      selectVehicle(i);
      hud.toast(VEHICLES[vehicleIndex].name);
    },
    buyVehicle() {
      if (!map) return;
      if (gameMode !== 'vehicle') return hud.toast('Enter your vehicle before using the vehicle shop');
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
    toggleJob() { if (map) jobs.toggle(activePlayer()); },
    goHome,
    cycleCamera() {
      if (gameMode !== 'vehicle') return hud.toast('On-foot camera: drag to look around');
      hud.toast(cameraRig.cycle());
    },
    toggleMute() { $('mu').textContent = audio.toggleMute() ? '🔇' : '🔊'; },
    interact,
    openMaps() {
      if (loading) return;
      if (mapSelect.visible) { if (mapSelect.canClose) mapSelect.hide(); } else mapSelect.show(map && map.id);
    },
  });

  $('nx').onclick = () => { hud.hideLevelComplete(); jobs.start(activePlayer()); };
  $('fr').onclick = () => hud.hideLevelComplete();

  // ---- frame ------------------------------------------------------------------------------
  function update(dt) {
    const def = VEHICLES[vehicleIndex];
    let player = activePlayer();

    if (gameMode === 'vehicle') {
      const surface = map.surfaces[map.surfaceAt(state.x, state.z)];
      const throttle = input.held.g;
      vehiclePhysics.step(def, visual, state, input.drive, surface, dt, colliders, map, traffic);
      if (state.hit > 2 || state.land > 3) {
        const force = Math.max(state.hit, state.land);
        audio.thud(force);
        cameraRig.bump(force);
        if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(Math.min(80, force * 6));
      }
      audio.update(def, state, throttle, surface);
      cameraRig.update(dt, { def, visual, state, surface, heightAt: map.heightAt, throttle });
      dust.update(
        dt,
        state.x - Math.sin(state.h) * def.length / 2,
        state.z - Math.cos(state.h) * def.length / 2,
        state.y,
        surface.dust,
        state.air ? 0 : state.v,
      );
    } else {
      if (gameMode === 'foot') {
        character.update(dt, input.movement, cameraRig.movementYaw, map, colliders, traffic, vehicleObstacle(), !!input.held.run);
      } else {
        const finished = character.updateAction(dt, map);
        if (finished) {
          if (gameMode === 'entering') {
            gameMode = 'vehicle';
            cameraRig.setOnFoot(false);
            hud.setMode('vehicle');
            hud.toast('Back in the driver seat');
          } else if (gameMode === 'exiting') {
            gameMode = 'foot';
          }
        }
      }
      player = character.state;
      cameraRig.updateOnFoot(dt, player, map.heightAt);
    }

    player = activePlayer();
    if (traffic) {
      if (gameMode === 'vehicle') {
        Object.assign(playerInfo, { x: state.x, z: state.z, h: state.h, v: state.v, length: def.length, width: def.width });
      } else {
        Object.assign(playerInfo, { x: player.x, z: player.z, h: player.h, v: player.v, length: 0.8, width: 0.7 });
      }
      traffic.update(dt, playerInfo);
    }

    atmosphere.update(dt, player);
    visual.lamp.intensity = atmosphere.night * 1.6;
    traffic?.setNight(atmosphere.night);
    mapRuntime?.update?.(dt, { night: atmosphere.night });

    hud.setClock(atmosphere.clockText);
    hud.setSpeed(Math.round(Math.abs(player.v) * 3.6));
    minimap.draw(player, jobs.job);
    jobs.update(dt, player, map.heightAt);

    if (gameMode === 'vehicle') {
      hud.setInteract('🚶 Exit · E', Math.abs(state.v) <= 0.7);
    } else if (gameMode === 'foot') {
      const near = Math.hypot(character.state.x - state.x, character.state.z - state.z) <= 3.7;
      hud.setInteract('🚙 Enter · E', near);
    } else {
      hud.setInteract('…', false);
    }
  }

  let last = performance.now();
  (function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!map || loading) return;
    if (dt > 0 && !mapSelect.visible) update(dt);
    cameraRig.render(activePlayer());
  })(last);

  // ---- boot -------------------------------------------------------------------------------
  const direct = params.get('map');
  if (direct && MAPS.some((m) => m.id === direct)) loadMap(getMap(direct));
  else mapSelect.show(null);

  if (params.has('debug')) window.__game = {
    update, colliders, get traffic() { return traffic; }, state, character, get gameMode() { return gameMode; },
    save, get map() { return map; }, input, vehiclePhysics, cameraRig, stage, atmosphere, jobs, loadMap, MAPS,
  };
}
