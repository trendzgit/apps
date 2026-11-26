import { CANNON } from './physics.js';
import { resolveColliders } from './colliders.js';

// Sign conventions carried over from the original tuning.
const ENGINE_SIGN = -1;
const STEER_SIGN = 1;
const AXLE_SIGN = 1;

const _fwd = new CANNON.Vec3();
const _up = new CANNON.Vec3();
const _axisZ = new CANNON.Vec3(0, 0, 1);
const _axisY = new CANNON.Vec3(0, 1, 0);

/**
 * Raycast-vehicle physics for the player's car.
 * Owns the chassis body, the wheels and the per-frame driving model (engine, brakes, steering,
 * surface grip, collisions, flip recovery) and writes results into the shared `state` object.
 */
export class VehiclePhysics {
  constructor(physics) {
    this.physics = physics;
    this.vehicle = null;
    this.chassis = null;
    this.steer = 0;
    this.flippedTime = 0;
    this.wasAir = false;
    this.lastVy = 0;
  }

  spawn(def, x, y, z, heading) {
    const { world } = this.physics;
    // Fix: the original called removeFromWorld() without the world, which threw and left the
    // previous vehicle's physics in place after switching/buying a vehicle.
    if (this.vehicle) this.vehicle.removeFromWorld(world);

    this.chassis = new CANNON.Body({
      mass: Math.round(def.length * def.width * 160),
      shape: new CANNON.Box(new CANNON.Vec3(def.width * 0.45, 0.3, def.length * 0.45)),
      angularDamping: 0.45,
    });
    this.chassis.position.set(x, y, z);
    this.chassis.quaternion.setFromEuler(0, heading, 0);

    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassis,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    });
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        this.vehicle.addWheel({
          radius: def.wheelRadius,
          directionLocal: new CANNON.Vec3(0, -1, 0),
          axleLocal: new CANNON.Vec3(AXLE_SIGN, 0, 0),
          chassisConnectionPointLocal: new CANNON.Vec3((side * def.width) / 2, 0, end * def.length * def.wheelFactor),
          suspensionStiffness: 24,
          suspensionRestLength: 0.5,
          maxSuspensionTravel: 0.4,
          dampingRelaxation: 2.6,
          dampingCompression: 4.6,
          maxSuspensionForce: 1e5,
          frictionSlip: 2.2,
          rollInfluence: 0.02,
        });
      }
    }
    this.vehicle.addToWorld(world);
    this.steer = 0;
    this.flippedTime = 0;
  }

  teleport(x, y, z, heading) {
    const c = this.chassis;
    c.position.set(x, y, z);
    c.velocity.setZero();
    c.angularVelocity.setZero();
    c.quaternion.setFromEuler(0, heading, 0);
    this.flippedTime = 0;
  }

  /** Freeze the vehicle cleanly when the player gets out; physics resumes on re-entry. */
  park() {
    if (!this.chassis) return;
    this.chassis.velocity.setZero();
    this.chassis.angularVelocity.setZero();
    this.chassis.force.setZero();
    this.chassis.torque.setZero();
    this.steer = 0;
  }

  /**
   * @param def      vehicle definition
   * @param visual   {group, wheels[]} three.js objects to pose
   * @param state    shared player state (written: x,z,y,h,v,hit,land,air,ss)
   * @param input    {th, br, st}  throttle 0/1, brake 0/1, steer -1..1
   * @param surface  the surface under the car (grip, drag, ...)
   * @param colliders ColliderGrid of the current map
   * @param map      current map ({bound, heightAt})
   * @param traffic  optional TrafficSystem (moving obstacles)
   */
  step(def, visual, state, input, surface, dt, colliders, map, traffic = null) {
    const chassis = this.chassis, vehicle = this.vehicle;
    const q = chassis.quaternion;
    const mass = chassis.mass;
    const grip = surface.grip;
    const forwardSpeed = chassis.velocity.dot(q.vmult(_axisZ, _fwd));

    chassis.linearDamping = 0.02 + 0.06 * (surface.drag - 1);

    let engine = 0;
    let brake = mass * 0.04 * surface.drag; // light engine braking while coasting
    if (input.th) {
      engine = Math.max(0, 1 - forwardSpeed / def.topSpeed) * mass * def.power * 0.5 * (0.6 + 0.4 * grip);
      brake = 0;
    }
    if (input.br) {
      if (forwardSpeed > 1.5) brake = mass * 0.7;
      else { engine = -mass * def.power * 0.25 * Math.max(0, 1 + forwardSpeed / 12); brake = 0; }
    }
    this.steer += (input.st * def.steering * Math.max(0.3, 1 - Math.abs(forwardSpeed) / 45) - this.steer) * Math.min(1, 6 * dt);

    for (let i = 0; i < 4; i++) {
      vehicle.applyEngineForce((ENGINE_SIGN * engine) / 4, i);
      vehicle.setBrake(brake / 4, i);
      vehicle.wheelInfos[i].frictionSlip = 2.2 * grip;
      if (i & 1) vehicle.setSteeringValue(STEER_SIGN * this.steer, i);
    }

    this.physics.step(dt);

    const pos = chassis.position;
    const vel = chassis.velocity;

    // obstacles (static colliders + moving traffic) and world bounds
    const heading = Math.atan2(q.vmult(_axisZ, _fwd).x, _fwd.z);
    const radius = def.width / 2 + 0.4;
    state.hit = resolveColliders(colliders, pos, vel, radius, heading, def.length / 2);
    if (traffic) state.hit = Math.max(state.hit, traffic.resolve(pos, vel, radius, heading, def.length / 2));
    const b = map.bound;
    if (Math.abs(pos.x) > b) { pos.x = Math.sign(pos.x) * b; vel.x = 0; }
    if (Math.abs(pos.z) > b) { pos.z = Math.sign(pos.z) * b; vel.z = 0; }

    const fwd = q.vmult(_axisZ, _fwd);
    const up = q.vmult(_axisY, _up);

    // flipped for too long -> put it back on its wheels
    if (up.y < 0.2) {
      this.flippedTime += dt;
      if (this.flippedTime > 2.5) this.teleport(pos.x, map.heightAt(pos.x, pos.z) + 1.6, pos.z, Math.atan2(fwd.x, fwd.z));
    } else this.flippedTime = 0;

    state.x = pos.x;
    state.z = pos.z;
    state.h = Math.atan2(fwd.x, fwd.z);
    state.v = vel.dot(fwd);

    const air = !vehicle.wheelInfos.some((w) => w.isInContact);
    state.land = this.wasAir && !air ? Math.max(0, -this.lastVy) : 0;
    this.wasAir = air;
    this.lastVy = vel.y;
    state.air = air;
    state.ss = this.steer;

    // pose the visual vehicle
    let suspension = 0;
    for (const w of vehicle.wheelInfos) suspension += w.suspensionLength / 4;
    const drop = suspension + def.wheelRadius;
    visual.group.position.set(pos.x - up.x * drop, pos.y - up.y * drop, pos.z - up.z * drop);
    visual.group.quaternion.set(q.x, q.y, q.z, q.w);
    state.y = visual.group.position.y;

    for (let i = 0; i < 4; i++) {
      const wheel = visual.wheels[i];
      wheel.position.y = (wheel.userData.baseY ?? def.wheelRadius) + (suspension - vehicle.wheelInfos[i].suspensionLength) * (wheel.userData.unit || 1);
      wheel.rotation.order = 'YXZ';
      wheel.rotation.y = i & 1 ? this.steer * STEER_SIGN : 0;
      wheel.rotation.x += (state.v * dt) / def.wheelRadius;
    }
  }
}
