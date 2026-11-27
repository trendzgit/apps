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
import { VEHICLES, createStreetVehicleDef } from '../vehicles/vehicleDefs.js';
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
import { PedestrianSystem } from '../pedestrians/pedestrianSystem.js';

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
  let traffic = null, pedestrians = null;
  let activeVehicleDef = VEHICLES[0];
  const parkedVehicles = [];
  const streetDrivers = [];
  const doorAnimations = [];
  const pedestrianLooks = [
    { skin: 0xc98f68, shirt: 0x315b73, trousers: 0x303944, hair: 0x29231f, shoes: 0x262321, height: 1.0 },
    { skin: 0x8e5d42, shirt: 0x8b3d32, trousers: 0x263f35, hair: 0x171412, shoes: 0x292725, cap: 0xd2a13a, height: 0.96 },
    { skin: 0xe0b18b, shirt: 0x547a43, trousers: 0x414b5a, hair: 0x6b4930, shoes: 0x252525, bag: 0x9d6b34, height: 1.06 },
    { skin: 0x9a674d, shirt: 0x674e87, trousers: 0x262b35, hair: 0x24201e, shoes: 0x35312e, cap: 0x253c56, height: 1.02 },
    { skin: 0xd5a27d, shirt: 0xb67a2b, trousers: 0x454545, hair: 0x4a3023, shoes: 0x1f242b, bag: 0x435b68, height: 0.93 },
  ];
  let gameMode = 'vehicle'; // vehicle | foot | entering | exiting
  const playerInfo = { x: 0, z: 0, h: 0, v: 0, length: 4.4, width: 1.8 };

  const activePlayer = () => gameMode === 'vehicle' ? state : character.state;
  const vehicleObstacle = () => [
    { x: state.x, z: state.z, h: state.h, length: activeVehicleDef.length, width: activeVehicleDef.width },
    ...parkedVehicles.map((parked) => ({ x: parked.state.x, z: parked.state.z, h: parked.state.h, length: parked.def.length, width: parked.def.width })),
  ];

  function animateDoor(targetVisual, seat, open, duration = 0.26, delay = 0) {
    const door = targetVisual?.doorRig?.[seat];
    if (!door) return;
    // A new opening starts a fresh sequence. A delayed close is queued alongside it
    // and must not cancel the opening tween before it has had a chance to run.
    if (open || delay <= 0) {
      for (let i = doorAnimations.length - 1; i >= 0; i--) {
        if (doorAnimations[i].door === door) doorAnimations.splice(i, 1);
      }
    }
    doorAnimations.push({
      door,
      from: open ? door.rotation.y : (delay > 0 ? door.userData.openAngle : door.rotation.y),
      to: open ? door.userData.openAngle : 0,
      elapsed: 0,
      delay: Math.max(0, delay),
      duration: Math.max(0.08, duration),
    });
  }

  function updateDoorAnimations(dt) {
    for (let i = doorAnimations.length - 1; i >= 0; i--) {
      const track = doorAnimations[i];
      if (!track.door.parent) { doorAnimations.splice(i, 1); continue; }
      track.elapsed += dt;
      if (track.elapsed < track.delay) continue;
      const p = Math.min(1, (track.elapsed - track.delay) / track.duration);
      const eased = p * p * (3 - 2 * p);
      track.door.rotation.y = track.from + (track.to - track.from) * eased;
      if (p >= 1) doorAnimations.splice(i, 1);
    }
  }

  // ---- vehicles ---------------------------------------------------------------------------
  function selectVehicle(index) {
    vehicleIndex = index % VEHICLES.length;
    const def = VEHICLES[vehicleIndex];
    activeVehicleDef = def;
    if (visual) {
      doorAnimations.length = 0;
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

  function removeCockpit(target) {
    if (!target?.cockpit) return;
    cameraRig.setCockpit(target.cockpit, null);
    disposeTree(target.cockpit);
    target.cockpit = null;
  }

  /** Keep the previous player car parked in the world when a street car is taken. */
  function parkCurrentVisual() {
    if (!visual) return;
    removeCockpit(visual);
    parkedVehicles.push({
      visual,
      def: activeVehicleDef,
      state: { ...state },
    });
    visual = null;
  }

  function createDrivingVisual(def, { loadModel = true } = {}) {
    const nextVisual = createVehicleVisual(def);
    stage.scene.add(nextVisual.group);
    const lamp = new SpotLight(0xfff1d0, 0, 80, 0.5, 0.6, 1);
    lamp.position.set(0, 0.9, 1.8);
    lamp.target.position.set(0, 0, 14);
    nextVisual.group.add(lamp, lamp.target);
    nextVisual.lamp = lamp;
    if (loadModel && (def.model || def.modelUrl)) tryLoadGlb(def, nextVisual);
    nextVisual.cockpit = createCockpit(def, $('mm'), cameraRig.mirrorTexture);
    cameraRig.setCockpit(null, nextVisual.cockpit);
    return nextVisual;
  }

  function activateStreetVehicle(stolen) {
    parkCurrentVisual();
    const def = createStreetVehicleDef(stolen);
    activeVehicleDef = def;
    visual = createDrivingVisual(def);
    Object.assign(state, {
      x: stolen.x, z: stolen.z, h: stolen.h, v: 0, ss: 0,
      y: map.heightAt(stolen.x, stolen.z), hit: 0, land: 0, air: false,
    });
    // Keep the visual at the traffic car's world position throughout the enter animation;
    // VehiclePhysics takes over the pose on the first driving frame after the transition.
    visual.group.position.set(state.x, state.y, state.z);
    visual.group.rotation.set(0, state.h, 0);
    vehiclePhysics.spawn(def, state.x, state.y + 1.4, state.z, state.h);
    hud.setVehicle(def.name);
    return visual;
  }

  function activateParkedVehicle(index) {
    if (index < 0 || index >= parkedVehicles.length) return false;
    parkCurrentVisual();
    const parked = parkedVehicles.splice(index, 1)[0];
    visual = parked.visual;
    activeVehicleDef = parked.def;
    Object.assign(state, parked.state);
    visual.cockpit = createCockpit(activeVehicleDef, $('mm'), cameraRig.mirrorTexture);
    cameraRig.setCockpit(null, visual.cockpit);
    vehiclePhysics.spawn(activeVehicleDef, state.x, map.heightAt(state.x, state.z) + 1.4, state.z, state.h);
    hud.setVehicle(activeVehicleDef.name);
    return true;
  }

  function findNearestParkedVehicle(point, maxDistance = 5.6) {
    let bestIndex = -1, bestDistance = maxDistance;
    parkedVehicles.forEach((parked, index) => {
      const d = Math.hypot(point.x - parked.state.x, point.z - parked.state.z);
      if (d < bestDistance) { bestDistance = d; bestIndex = index; }
    });
    return bestIndex >= 0 ? { index: bestIndex, distance: bestDistance } : null;
  }

  function spawnStreetOccupants(stolen, targetVisual) {
    const seats = [
      { id: 'driver', side: -1, localX: -0.22, localZ: 0.34 },
      { id: 'passenger', side: 1, localX: 0.22, localZ: 0.34 },
      { id: 'rearDriver', side: -1, localX: -0.22, localZ: -0.56 },
      { id: 'rearPassenger', side: 1, localX: 0.22, localZ: -0.56 },
    ];
    const available = stolen.type >= 2 ? seats.slice(0, 2) : seats;
    const count = Math.max(1, Math.min(available.length, stolen.occupants || 1));
    const c = Math.cos(stolen.h), sn = Math.sin(stolen.h);

    for (let i = 0; i < count; i++) {
      const seat = available[i];
      const npc = new CharacterController(stage.scene, pedestrianLooks[(Math.random() * pedestrianLooks.length) | 0]);
      const x = stolen.x + c * seat.localX + sn * seat.localZ;
      const z = stolen.z - sn * seat.localX + c * seat.localZ;
      const outwardX = c * seat.side;
      const outwardZ = -sn * seat.side;
      npc.teleport(x, z, Math.atan2(outwardX, outwardZ), map);
      npc.startAction('exit', {
        duration: 0.72 + i * 0.08,
        moveX: outwardX * 1.18,
        moveZ: outwardZ * 1.18,
      });
      animateDoor(targetVisual, seat.id, true, 0.22, i * 0.08);
      animateDoor(targetVisual, seat.id, false, 0.24, 1.05 + i * 0.08);
      streetDrivers.push({
        npc, age: 0,
        escape: {
          x: outwardX * 0.72 + sn * 0.32,
          y: outwardZ * 0.72 + c * 0.32,
        },
      });
    }
  }

  function updateStreetDrivers(dt) {
    for (let i = streetDrivers.length - 1; i >= 0; i--) {
      const driver = streetDrivers[i];
      driver.age += dt;
      if (driver.npc.action) driver.npc.updateAction(dt, map);
      else if (driver.age < 5.4) {
        driver.npc.update(dt, driver.escape, 0, map, colliders, traffic, vehicleObstacle(), true);
      } else {
        stage.scene.remove(driver.npc.root);
        disposeTree(driver.npc.root);
        streetDrivers.splice(i, 1);
      }
    }
  }

  function clearParkedVehicles() {
    doorAnimations.length = 0;
    for (const parked of parkedVehicles) {
      stage.scene.remove(parked.visual.group);
      removeCockpit(parked.visual);
      disposeTree(parked.visual.group);
    }
    parkedVehicles.length = 0;
    for (const driver of streetDrivers) {
      stage.scene.remove(driver.npc.root);
      disposeTree(driver.npc.root);
    }
    streetDrivers.length = 0;
  }

  // ---- maps -------------------------------------------------------------------------------
  function unloadMap() {
    clearParkedVehicles();
    if (!mapGroup) return;
    stage.scene.remove(mapGroup);
    disposeTree(mapGroup);
    colliders.clear();
    mapGroup = mapRuntime = null;
    traffic = null;
    pedestrians = null;
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
        const pedCount = params.has('peds') ? Math.max(0, parseInt(params.get('peds'), 10) || 0) : (map.pedestrians?.count ?? 0);
        if (map.pedestrians && pedCount > 0) {
          pedestrians = new PedestrianSystem({
            config: { ...map.traffic, ...map.pedestrians, count: pedCount },
            traffic, group: mapGroup, colliders,
            onHit: () => {
              save.cash = Math.max(0, save.cash - (map.pedestrians.fine ?? 50));
              hud.setStats(mapProgress(save, map.id).level, save.cash);
              hud.toast('Pedestrian collision: fine applied');
              persist(save);
            },
          });
          pedestrians.populate(playerInfo);
          traffic.peds = pedestrians;
        }
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
        door: o.side < 0 ? 'driver' : (o.side > 0 ? 'passenger' : 'driver'),
      };
    }
    return null;
  }

  // Move the pedestrian to the driver's door during the enter animation instead of
  // making a vehicle takeover happen from several metres away.
  function startVehicleEntry(def = activeVehicleDef) {
    const c = Math.cos(state.h), s = Math.sin(state.h);
    const localX = -(def.width / 2 + 0.72);
    const localZ = -0.12;
    const doorX = state.x + c * localX + s * localZ;
    const doorZ = state.z - s * localX + c * localZ;
    const dx = doorX - character.state.x;
    const dz = doorZ - character.state.z;
    const distance = Math.hypot(dx, dz);
    const duration = Math.max(0.72, Math.min(1.25, distance / 5.8));
    if (distance > 0.08) {
      character.state.h = Math.atan2(dx, dz);
      character.root.rotation.y = character.state.h;
    }
    character.startAction('enter', { duration, moveX: dx, moveZ: dz });
    animateDoor(visual, 'driver', true, 0.22);
    animateDoor(visual, 'driver', false, 0.24, duration + 0.12);
  }

  function interact() {
    if (!map || loading || mapSelect.visible || gameMode === 'entering' || gameMode === 'exiting') return;
    const def = activeVehicleDef;
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
      animateDoor(visual, exit.door || 'driver', true, 0.22);
      animateDoor(visual, exit.door || 'driver', false, 0.24, 0.92);
      gameMode = 'exiting';
      cameraRig.setOnFoot(true, character.state, visual);
      hud.setMode('foot');
      hud.toast('Sprint is automatic. Hold Ctrl (or WALK on mobile) to slow down. Press E beside a street car to take it.');
      return;
    }

    const point = character.state;
    const street = traffic?.findNearestVehicle(point, 5.6);
    const parked = findNearestParkedVehicle(point, 5.6);
    const ownDistance = Math.hypot(point.x - state.x, point.z - state.z);

    // Take the closest eligible vehicle. Street traffic is removed from its lane, its occupants
    // exit through their assigned doors, and the vehicle becomes player-controlled.
    let choice = { kind: 'current', distance: ownDistance };
    if (parked && parked.distance < choice.distance) choice = { kind: 'parked', ...parked };
    if (street && street.distance < choice.distance) choice = { kind: 'street', ...street };

    if (choice.distance > 5.6) {
      hud.toast('Get closer to a vehicle. Press E to enter or take it.');
      return;
    }

    if (choice.kind === 'street') {
      const stolen = traffic?.takeVehicle(choice.car);
      if (!stolen) return hud.toast('That vehicle is no longer available');
      const takenVisual = activateStreetVehicle(stolen);
      spawnStreetOccupants(stolen, takenVisual);
      startVehicleEntry(activeVehicleDef);
      gameMode = 'entering';
      hud.setInteract('Taking vehicle…', false);
      hud.toast((stolen.occupants > 1 ? 'Occupants got out. ' : 'Driver got out. ') + 'Vehicle taken!');
      return;
    }

    if (choice.kind === 'parked') {
      if (!activateParkedVehicle(choice.index)) return;
      startVehicleEntry(activeVehicleDef);
      gameMode = 'entering';
      hud.setInteract('Entering…', false);
      hud.toast('Getting into your parked vehicle');
      return;
    }

    if (ownDistance > 4.2) {
      hud.toast('Move closer to your vehicle to enter');
      return;
    }
    startVehicleEntry(activeVehicleDef);
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
    const def = activeVehicleDef;
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
        character.update(dt, input.movement, cameraRig.movementYaw, map, colliders, traffic, vehicleObstacle(), !input.held.walk || !!input.held.run);
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

    updateStreetDrivers(dt);
    updateDoorAnimations(dt);
    player = activePlayer();
    if (traffic) {
      if (gameMode === 'vehicle') {
        Object.assign(playerInfo, { x: state.x, z: state.z, h: state.h, v: state.v, length: def.length, width: def.width });
      } else {
        Object.assign(playerInfo, { x: player.x, z: player.z, h: player.h, v: player.v, length: 0.8, width: 0.7 });
      }
      traffic.update(dt, playerInfo);
      if (pedestrians) {
        if (gameMode === 'vehicle') {
          const vel = { x: Math.sin(state.h) * state.v, z: Math.cos(state.h) * state.v };
          pedestrians.resolve(state, vel, activeVehicleDef.width * 0.5, state.h, activeVehicleDef.length);
        }
        pedestrians.update(dt, playerInfo);
      }
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
      const street = traffic?.findNearestVehicle(character.state, 5.6);
      const parked = findNearestParkedVehicle(character.state, 5.6);
      const ownDistance = Math.hypot(character.state.x - state.x, character.state.z - state.z);
      if (street && street.distance < Math.min(ownDistance, parked?.distance ?? Infinity)) {
        hud.setInteract('🚗 Take car · E', true);
      } else if (parked && parked.distance < ownDistance) {
        hud.setInteract('🚙 Enter parked · E', true);
      } else {
        hud.setInteract('🚙 Enter · E', ownDistance <= 4.2);
      }
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
    save, get map() { return map; }, input, vehiclePhysics, cameraRig, stage, atmosphere, jobs, loadMap, MAPS, parkedVehicles, streetDrivers, doorAnimations,
  };
}
