import {
  Group, Mesh, BoxGeometry, SphereGeometry, CylinderGeometry,
  MeshStandardMaterial, MathUtils,
} from 'three';
import { resolveColliders } from '../engine/colliders.js';

const RADIUS = 0.34;
const WALK_SPEED = 2.35;
const RUN_SPEED = 4.6;
const BACK_SPEED = 1.55;

/**
 * Lightweight, asset-free third-person character. The articulated low-poly rig is deliberately
 * procedural so walking is playable before a skinned GLB character pack is added.
 */
export class CharacterController {
  constructor(scene) {
    this.state = { x: 0, z: 0, h: 0, v: 0, y: 0, hit: 0 };
    this.velocity = { x: 0, z: 0 };
    this.phase = 0;
    this.action = null;
    this.root = new Group();
    this.root.visible = false;
    scene.add(this.root);
    this.rig = this._buildRig();
    this.root.add(this.rig.group);
  }

  _buildRig() {
    const group = new Group();
    const skin = new MeshStandardMaterial({ color: 0xc98f68, roughness: 0.92 });
    const shirt = new MeshStandardMaterial({ color: 0x315b73, roughness: 0.88 });
    const trousers = new MeshStandardMaterial({ color: 0x303944, roughness: 0.95 });
    const shoes = new MeshStandardMaterial({ color: 0x262321, roughness: 1 });
    const hair = new MeshStandardMaterial({ color: 0x29231f, roughness: 1 });

    const makeMesh = (geometry, material, parent, x, y, z) => {
      const mesh = new Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const makeLimb = (parent, x, y, length, radius, material) => {
      const pivot = new Group();
      pivot.position.set(x, y, 0);
      makeMesh(new CylinderGeometry(radius * 0.82, radius, length, 8), material, pivot, 0, -length / 2, 0);
      parent.add(pivot);
      return pivot;
    };

    makeMesh(new BoxGeometry(0.42, 0.28, 0.25), trousers, group, 0, 0.82, 0); // pelvis
    const torso = makeMesh(new BoxGeometry(0.48, 0.58, 0.27), shirt, group, 0, 1.19, 0);
    torso.geometry.translate(0, 0, 0);
    makeMesh(new SphereGeometry(0.16, 12, 10), skin, group, 0, 1.59, 0.015);
    makeMesh(new SphereGeometry(0.165, 12, 8), hair, group, 0, 1.67, -0.025);

    const arms = [], forearms = [], legs = [], shins = [];
    for (const side of [-1, 1]) {
      makeMesh(new SphereGeometry(0.105, 8, 7), shirt, group, side * 0.255, 1.42, 0);
      const arm = makeLimb(group, side * 0.285, 1.39, 0.39, 0.075, shirt);
      const forearm = makeLimb(arm, 0, -0.38, 0.34, 0.058, skin);
      makeMesh(new SphereGeometry(0.06, 8, 6), skin, forearm, 0, -0.34, 0.01);
      arms.push(arm); forearms.push(forearm);

      const leg = makeLimb(group, side * 0.125, 0.78, 0.44, 0.105, trousers);
      const shin = makeLimb(leg, 0, -0.42, 0.42, 0.075, trousers);
      makeMesh(new BoxGeometry(0.16, 0.1, 0.27), shoes, shin, 0, -0.4, 0.07);
      legs.push(leg); shins.push(shin);
    }
    return { group, torso, arms, forearms, legs, shins };
  }

  teleport(x, z, heading, map) {
    Object.assign(this.state, { x, z, h: heading, v: 0, y: map.heightAt(x, z) });
    this.velocity.x = 0;
    this.velocity.z = 0;
    this.root.position.set(x, this.state.y, z);
    this.root.rotation.y = heading;
  }

  setVisible(visible) { this.root.visible = visible; }

  startAction(kind, options = {}) {
    this.action = {
      kind,
      time: 0,
      duration: options.duration ?? 0.72,
      x: this.state.x,
      z: this.state.z,
      moveX: options.moveX ?? 0,
      moveZ: options.moveZ ?? 0,
    };
    // Keep the pedestrian visible during both transitions. Previously the rig was
    // hidden in the car, so the enter animation was never rendered.
    this.root.visible = true;
  }

  /** Returns true once the enter/exit animation is complete. */
  updateAction(dt, map) {
    if (!this.action) return true;
    const a = this.action;
    a.time = Math.min(a.duration, a.time + dt);
    const p = a.time / a.duration;
    const eased = p * p * (3 - 2 * p);
    if (a.kind === 'exit') {
      this.state.x = a.x + a.moveX * eased;
      this.state.z = a.z + a.moveZ * eased;
      this.state.y = map.heightAt(this.state.x, this.state.z);
      this.root.position.set(this.state.x, this.state.y, this.state.z);
      this.root.scale.setScalar(Math.max(0.05, Math.min(1, p * 5)));
    }
    this._animate(dt, a.kind === 'enter' ? 0.75 : 0.55, false, a.kind, p);
    if (p >= 1) {
      if (a.kind === 'enter') this.root.visible = false;
      this.root.scale.setScalar(1);
      this.action = null;
      return true;
    }
    return false;
  }

  /**
   * Move relative to the orbit camera. Static map colliders, ambient traffic and the parked
   * player's vehicle all block the character.
   */
  update(dt, movement, cameraYaw, map, colliders, traffic, vehicleObstacle, sprint = false) {
    const right = movement.x || 0;
    const forward = movement.y || 0;
    const inputLen = Math.hypot(right, forward);
    let targetX = 0, targetZ = 0;
    if (inputLen > 0.001) {
      const nx = right / Math.max(1, inputLen), nz = forward / Math.max(1, inputLen);
      const speed = forward < -0.1 && Math.abs(right) < 0.1 ? BACK_SPEED : (sprint ? RUN_SPEED : WALK_SPEED);
      targetX = (nx * Math.cos(cameraYaw) + nz * Math.sin(cameraYaw)) * speed;
      targetZ = (-nx * Math.sin(cameraYaw) + nz * Math.cos(cameraYaw)) * speed;
    }

    const response = inputLen > 0.001 ? 13 : 9;
    const blend = Math.min(1, response * dt);
    this.velocity.x += (targetX - this.velocity.x) * blend;
    this.velocity.z += (targetZ - this.velocity.z) * blend;

    const pos = { x: this.state.x + this.velocity.x * dt, z: this.state.z + this.velocity.z * dt };
    const vel = { x: this.velocity.x, z: this.velocity.z };
    const heading = Math.atan2(vel.x, vel.z);
    resolveColliders(colliders, pos, vel, RADIUS, heading, 0);
    if (traffic) traffic.resolve(pos, vel, RADIUS, heading, 0);
    if (vehicleObstacle) this._resolveVehicle(pos, vel, RADIUS, vehicleObstacle);

    const bound = map.bound - RADIUS;
    pos.x = MathUtils.clamp(pos.x, -bound, bound);
    pos.z = MathUtils.clamp(pos.z, -bound, bound);
    this.velocity.x = vel.x;
    this.velocity.z = vel.z;
    this.state.x = pos.x;
    this.state.z = pos.z;
    this.state.v = Math.hypot(vel.x, vel.z);
    if (this.state.v > 0.12) this.state.h = Math.atan2(vel.x, vel.z);
    this.state.y = map.heightAt(pos.x, pos.z);
    this.root.position.set(pos.x, this.state.y, pos.z);
    this.root.rotation.y = this.state.h;

    this._animate(dt, this.state.v, sprint && inputLen > 0.01, null, 0);
  }

  _resolveVehicle(pos, vel, radius, car) {
    const dx = pos.x - car.x, dz = pos.z - car.z;
    const c = Math.cos(car.h), s = Math.sin(car.h);
    let lx = c * dx - s * dz;
    let lz = s * dx + c * dz;
    const hw = car.width * 0.48, hl = car.length * 0.48;
    const cx = Math.max(-hw, Math.min(hw, lx));
    const cz = Math.max(-hl, Math.min(hl, lz));
    let nx = lx - cx, nz = lz - cz;
    const d2 = nx * nx + nz * nz;
    if (d2 >= radius * radius) return;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      nx /= d; nz /= d;
      lx = cx + nx * radius;
      lz = cz + nz * radius;
    } else {
      const px = hw - Math.abs(lx), pz = hl - Math.abs(lz);
      if (px < pz) { nx = lx >= 0 ? 1 : -1; nz = 0; lx = nx * (hw + radius); }
      else { nz = lz >= 0 ? 1 : -1; nx = 0; lz = nz * (hl + radius); }
    }
    pos.x = car.x + c * lx + s * lz;
    pos.z = car.z - s * lx + c * lz;
    const wx = c * nx + s * nz, wz = -s * nx + c * nz;
    const vn = vel.x * wx + vel.z * wz;
    if (vn < 0) { vel.x -= vn * wx; vel.z -= vn * wz; }
  }

  _animate(dt, speed, sprint, action, progress) {
    const walking = speed > 0.18;
    this.phase += dt * (walking ? (sprint ? 13.5 : 9.5) : 1.2);
    const swing = walking ? Math.sin(this.phase) * Math.min(0.72, speed * 0.14) : Math.sin(this.phase) * 0.025;
    const crouch = action === 'enter' ? Math.sin(progress * Math.PI) * 0.42 : action === 'exit' ? (1 - progress) * 0.2 : 0;
    this.rig.torso.rotation.x = crouch * 0.55 + (walking ? Math.abs(swing) * 0.05 : 0);
    this.rig.group.position.y = walking ? Math.abs(Math.sin(this.phase * 2)) * 0.035 : 0;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      this.rig.legs[i].rotation.x = swing * side + crouch * 0.35;
      this.rig.shins[i].rotation.x = Math.max(0, -swing * side) * 0.78;
      this.rig.arms[i].rotation.x = -swing * side * 0.72 - crouch * 0.45;
      this.rig.forearms[i].rotation.x = walking ? 0.12 + Math.max(0, swing * side) * 0.25 : 0.06;
    }
  }
}
