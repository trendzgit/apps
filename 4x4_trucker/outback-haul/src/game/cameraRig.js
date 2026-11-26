import { Group, Vector3, Quaternion, Euler, PerspectiveCamera, WebGLRenderTarget } from 'three';
import { LOW_QUALITY } from '../config.js';

const MODES = ['Chase camera', 'Bonnet camera', 'Cockpit camera: drag to look around', 'Dashboard camera'];

/**
 * Four cameras (chase / bonnet / cockpit / dash), drag-to-look, speed + impact shake,
 * and the rear-view mirror render target.
 */
export class CameraRig {
  constructor(stage) {
    this.stage = stage;
    this.mode = 0;
    this.shake = 0;
    this.look = { yaw: 0, pitch: 0 };
    this.drag = { on: false, id: 0, x: 0, y: 0 };
    this.smooth = { y: 0, pitch: 0 };

    // everything that belongs to the cockpit hangs off this anchor, which follows the car smoothly
    this.anchor = new Group();
    this.anchor.rotation.order = 'YXZ';
    stage.scene.add(this.anchor);

    this.mirrorTarget = LOW_QUALITY ? null : new WebGLRenderTarget(256, 96);
    this.mirrorCamera = new PerspectiveCamera(42, 256 / 96, 0.5, 700);
    this.mirrorToggle = 0;

    stage.camera.position.set(0, 6, -25);

    const dom = stage.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      this.drag.on = true;
      this.drag.id = e.pointerId;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    });
    addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d.on || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      if (this.mode > 0) {
        this.look.yaw = Math.max(-1.75, Math.min(1.75, this.look.yaw - dx * 0.007));
        this.look.pitch = Math.max(-0.6, Math.min(0.6, this.look.pitch + dy * 0.005));
      }
    });
    for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, (e) => { if (e.pointerId === this.drag.id) this.drag.on = false; });
  }

  get mirrorTexture() { return this.mirrorTarget ? this.mirrorTarget.texture : null; }

  cycle() {
    this.mode = (this.mode + 1) % 4;
    document.body.classList.toggle('cp', this.mode > 1);
    return MODES[this.mode];
  }

  bump(intensity) { this.shake = Math.min(0.6, intensity * 0.04); }

  /** Called when the player swaps vehicles. */
  setCockpit(prev, next) {
    if (prev) this.anchor.remove(prev);
    if (next) this.anchor.add(next);
  }

  update(dt, { def, visual, state, surface, heightAt, throttle }) {
    const { camera } = this.stage;
    const mode = this.mode;
    const heading = [Math.sin(state.h), Math.cos(state.h)];
    const lerpK = 1 - Math.exp(-5 * dt);
    const speedFrac = Math.min(1, Math.abs(state.v) / def.topSpeed);

    this.shake *= Math.exp(-6 * dt);
    if (!this.drag.on) {
      this.look.yaw *= Math.exp(-2.5 * dt);
      this.look.pitch *= Math.exp(-2.5 * dt);
    }

    if (mode) {
      const eye = def.eye;
      const driverX = def.quad ? 0 : -0.36;
      const group = visual.group;
      const jumped = Math.abs(group.position.y - this.smooth.y) > 4;
      this.smooth.y = jumped ? group.position.y : this.smooth.y + (group.position.y - this.smooth.y) * (1 - Math.exp(-dt * (state.air ? 2 : 9)));
      this.smooth.pitch += (group.rotation.x * 0.4 - this.smooth.pitch) * (1 - Math.exp(-3 * dt));
      this.anchor.position.set(group.position.x, this.smooth.y, group.position.z);
      this.anchor.rotation.set(this.smooth.pitch, state.h, 0);
      this.anchor.updateMatrixWorld();

      const local =
        mode === 3 ? [driverX * 0.4, eye[0] - 0.08, eye[1] + 0.3]
        : mode === 2 ? [driverX, eye[0], eye[1]]
        : [0, eye[0] - 0.05, eye[1] + def.length * 0.38];
      camera.position.copy(this.anchor.localToWorld(new Vector3(local[0], local[1], local[2])));
      const lookQ = new Quaternion().setFromEuler(
        new Euler(this.look.pitch, this.look.yaw + (mode > 1 ? state.ss * 0.3 * Math.min(1, Math.abs(state.v) / 12) : 0), 0, 'YXZ'),
      );
      camera.lookAt(
        camera.position.clone().addScaledVector(new Vector3(0, 0, 1).applyQuaternion(this.anchor.quaternion.clone().multiply(lookQ)), 20),
      );
    } else {
      const back = def.length + 6;
      camera.position.lerp(new Vector3(state.x - heading[0] * back, state.y + 3 + def.length * 0.18, state.z - heading[1] * back), lerpK);
      camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 1.5);
      camera.lookAt(state.x + heading[0] * 5, state.y + 1.4, state.z + heading[1] * 5);
    }

    const jitter = mode ? this.shake * 0.4 : this.shake + (state.air ? 0 : speedFrac * surface.shake);
    camera.position.x += (Math.random() - 0.5) * jitter;
    camera.position.y += (Math.random() - 0.5) * jitter;
    this.anchor.visible = mode > 1;

    // hide the exterior body when sitting inside it
    const inside = mode > 1 && !def.quad;
    if (visual.extOn !== !inside) {
      visual.extOn = !inside;
      visual.group.traverse((o) => { if (o.isMesh && !o.userData.hidden) o.visible = !inside; });
    }
    if (mode > 1 && visual.cockpit) {
      visual.cockpit.userData.update(state, throttle, dt);
      if (visual.cockpit.userData.wheelRoot) visual.cockpit.userData.wheelRoot.visible = mode === 2;
    }

    const wantFov = mode > 1 ? 70 : mode === 1 ? 62 : 60 + speedFrac * 12;
    const fov = Math.min(mode > 1 ? 100 : 85, Math.max(wantFov, 114.6 * Math.atan(0.916 / camera.aspect)));
    if (Math.abs(camera.fov - fov) > 0.1) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  /** Render the frame (and, every other frame in cockpit view, the rear mirror first). */
  render(state) {
    const { renderer, scene, camera } = this.stage;
    if (this.mode > 1 && this.mirrorTarget && (this.mirrorToggle ^= 1)) {
      const mc = this.mirrorCamera;
      mc.position.copy(camera.position);
      mc.lookAt(camera.position.x - Math.sin(state.h) * 60, camera.position.y - 1, camera.position.z - Math.cos(state.h) * 60);
      this.anchor.visible = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(this.mirrorTarget);
      renderer.render(scene, mc);
      renderer.setRenderTarget(null);
      renderer.shadowMap.autoUpdate = true;
      this.anchor.visible = true;
    }
    renderer.render(scene, camera);
  }
}
