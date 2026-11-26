import {
  Group, Mesh, BoxGeometry, PlaneGeometry, CylinderGeometry, TorusGeometry, SphereGeometry,
  MeshBasicMaterial, CanvasTexture, DoubleSide,
} from 'three';
import { phong } from '../util/materials.js';

const DEG = Math.PI / 180;

/**
 * First-person interior: dashboard, pillars, seats, steering wheel, a working gauge cluster
 * (speed + rpm drawn to a canvas), a nav screen showing the minimap and (optionally) a rear-view mirror.
 *
 * @param def            vehicle definition
 * @param minimapCanvas  the HUD minimap canvas (shown on the nav screen)
 * @param mirrorTexture  render-target texture for the rear-view mirror, or null (low quality)
 * @returns Group with userData.update(state, throttle, dt) and userData.wheelRoot
 */
export function createCockpit(def, minimapCanvas, mirrorTexture) {
  const group = new Group();
  const [eyeY, eyeZ] = def.eye;
  const isQuad = !!def.quad;
  const seatX = isQuad ? 0 : -0.36; // driver's lateral offset
  const dark = phong(0x24262a, 25), slate = phong(0x363a40, 25), light = phong(0x8d8b85, 5);
  const seat = phong(0x23252a, 5), black = phong(0x0d0d0f, 70), paint = phong(def.color, 80);
  const baseY = eyeY - 0.32; // top of the dash
  const halfW = def.width / 2 - 0.12;

  const box = (w, h, d, mat, x, y, z, rotX = 0) => {
    const m = new Mesh(new BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.x = rotX;
    group.add(m);
    return m;
  };

  // gauge cluster canvas (speed dial + rpm dial)
  const gaugeCanvas = document.createElement('canvas');
  gaugeCanvas.width = 256;
  gaugeCanvas.height = 128;
  const g = gaugeCanvas.getContext('2d');
  const gaugeTex = new CanvasTexture(gaugeCanvas);
  const navTex = minimapCanvas ? new CanvasTexture(minimapCanvas) : null;

  // a flat screen angled toward the driver's eye
  const screen = (x, y, z, w, h, tex, extraYaw = 0) => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: tex }));
    m.position.set(x, y, z);
    m.rotation.set(Math.atan2(eyeY - y, z - eyeZ), Math.PI + extraYaw, 0);
    group.add(m);
    return m;
  };

  let wheelSpin; // the part of the steering wheel/handlebar that rotates
  if (isQuad) {
    wheelSpin = new Group();
    wheelSpin.position.set(0, eyeY - 0.2, eyeZ + 0.42);
    group.add(wheelSpin);
    wheelSpin.add(new Mesh(new CylinderGeometry(0.014, 0.014, 0.74, 8).rotateZ(Math.PI / 2), dark));
    for (const s of [-1, 1]) {
      const grip = new Mesh(new CylinderGeometry(0.02, 0.02, 0.11, 8).rotateZ(Math.PI / 2), black);
      grip.position.x = s * 0.36;
      wheelSpin.add(grip);
    }
    screen(0, eyeY - 0.12, eyeZ + 0.5, 0.22, 0.11, gaugeTex);
  } else {
    const topY = eyeY + 0.4; // top of windscreen
    const topZ = eyeZ + 1.25;
    const baseZ = eyeZ + 0.9; // bottom of windscreen
    const midZ = (topZ + baseZ) / 2;
    const slope = Math.atan2(topY - baseY, topZ - baseZ);
    const glassLen = Math.hypot(topY - baseY, topZ - baseZ);

    box(2 * halfW - 0.05, 0.2, 0.65, dark, 0, baseY - 0.1, eyeZ + 0.925); // dash top
    box(2 * halfW - 0.3, 0.012, 0.03, paint, 0, baseY + 0.005, eyeZ + 0.72); // body-colour trim strip
    box(0.46, 0.3, 0.2, dark, seatX, baseY + 0.05, eyeZ + 0.72); // instrument binnacle
    box(0.46, 0.025, 0.14, dark, seatX, baseY + 0.17, eyeZ + 0.56); // binnacle hood
    screen(seatX, baseY + 0.05, eyeZ + 0.585, 0.34, 0.17, gaugeTex);
    box(0.32, 0.18, 0.05, dark, 0, baseY + 0.1, eyeZ + 0.86); // centre screen housing
    screen(0, baseY + 0.1, eyeZ + 0.832, 0.28, 0.14, navTex, 0.3);
    box(0.3, 0.1, 0.03, dark, 0, topY - 0.13, baseZ + 0.01); // mirror housing
    if (mirrorTexture) {
      const mirror = screen(0, topY - 0.13, baseZ - 0.02, 0.27, 0.08, mirrorTexture);
      mirror.scale.x = -1;
      mirror.material.side = DoubleSide;
      mirror.material.toneMapped = false;
    }
    for (const s of [-1, 1]) {
      box(0.05, 0.05, glassLen, dark, s * (halfW - 0.02), (baseY + topY) / 2, midZ, slope); // A pillar
      box(0.07, 0.5, 0.09, dark, s * halfW, baseY + 0.27, eyeZ - 0.3); // B pillar
      box(0.06, 0.62, 1.7, slate, s * halfW, baseY - 0.3, eyeZ + 0.05); // door panel
      box(0.1, 0.04, 1.7, dark, s * halfW, baseY + 0.01, eyeZ + 0.05); // armrest
      box(0.06, 0.08, 2.1, light, s * halfW, topY - 0.04, eyeZ - 0.5); // roof rail
      box(0.14, 0.1, 0.22, dark, s * (halfW + 0.2), baseY + 0.06, eyeZ + 0.75); // wing mirror
    }
    box(2 * halfW, 0.06, 0.08, dark, 0, topY, baseZ); // windscreen header
    box(def.width - 0.25, 0.08, def.length / 2 - 0.1 - topZ, paint, 0, baseY - 0.06, (topZ + def.length / 2 - 0.1) / 2); // bonnet
    box(2 * halfW - 0.05, 0.45, 0.05, dark, 0, baseY - 0.38, topZ); // cowl
    box(2 * halfW, 0.03, 2.4, dark, 0, baseY - 0.6, eyeZ); // floor
    box(0.26, 0.25, 0.9, slate, 0, baseY - 0.45, eyeZ + 0.1); // centre tunnel
    box(0.5, 0.12, 0.5, seat, -seatX, baseY - 0.42, eyeZ - 0.15); // passenger seat
    box(0.5, 0.62, 0.12, seat, -seatX, baseY - 0.1, eyeZ - 0.42);
    box(0.26, 0.16, 0.1, seat, -seatX, baseY + 0.3, eyeZ - 0.42);

    // barely-there windscreen tint + dark band at the top edge
    const pane = new Mesh(
      new PlaneGeometry(2 * halfW - 0.14, glassLen),
      new MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.06, depthWrite: false, side: DoubleSide }),
    );
    pane.position.set(0, (baseY + topY) / 2, midZ);
    pane.rotation.set(-(Math.PI / 2 - slope), Math.PI, 0);
    group.add(pane);
    const band = new Mesh(
      new PlaneGeometry(2 * halfW - 0.14, 0.1),
      new MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide }),
    );
    band.position.y = glassLen / 2 - 0.05;
    pane.add(band);

    // steering wheel
    const column = new Group();
    column.position.set(seatX, eyeY - 0.38, eyeZ + 0.28);
    column.rotation.x = -0.45;
    group.add(column);
    wheelSpin = new Group();
    column.add(wheelSpin);
    wheelSpin.add(new Mesh(new TorusGeometry(0.16, 0.017, 10, 32), black));
    wheelSpin.add(new Mesh(new CylinderGeometry(0.045, 0.045, 0.05, 16).rotateX(Math.PI / 2), slate));
    for (const [w, h, y] of [[0.31, 0.03, 0], [0.03, 0.14, -0.075]]) {
      const spoke = new Mesh(new BoxGeometry(w, h, 0.02), black);
      spoke.position.y = y;
      wheelSpin.add(spoke);
    }
    for (const s of [-1, 1]) {
      const hand = new Mesh(new SphereGeometry(0.04, 10, 8), phong(0xc99a7a, 15));
      hand.scale.set(1.1, 0.8, 1);
      hand.position.set(s * 0.155, 0.02, -0.03);
      wheelSpin.add(hand);
    }
    group.userData.wheelRoot = column;
  }

  // --- gauges -------------------------------------------------------------------------------
  const maxKmh = Math.ceil((def.topSpeed * 3.6 * 1.15) / 20) * 20;
  const dial = (cx, fraction, max, step, label) => {
    g.save();
    g.translate(cx, 66);
    g.strokeStyle = '#8ea0ad';
    g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, 52, 0, 7); g.stroke();
    g.fillStyle = '#d9e4ec';
    g.font = '9px sans-serif';
    g.textAlign = 'center';
    for (let v = 0; v <= max; v += step) {
      const a = (-225 + (270 * v) / max) * DEG;
      const cos = Math.cos(a), sin = Math.sin(a);
      g.beginPath(); g.moveTo(cos * 44, sin * 44); g.lineTo(cos * 50, sin * 50); g.stroke();
      g.fillText(v, cos * 34, sin * 34 + 3);
    }
    const needle = (-225 + 270 * Math.min(fraction, 1)) * DEG;
    g.strokeStyle = g.fillStyle = '#ff5a2a';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(needle) * 46, Math.sin(needle) * 46); g.stroke();
    g.beginPath(); g.arc(0, 0, 4, 0, 7); g.fill();
    g.fillStyle = '#9fb4c2';
    g.fillText(label, 0, 32);
    g.restore();
  };

  let sinceDraw = 1, shownKmh = 0, shownRpm = 0.12;
  group.userData.update = (state, throttle, dt) => {
    if (isQuad) wheelSpin.rotation.y = state.ss;
    else wheelSpin.rotation.z = -state.ss * 3.2;
    sinceDraw += dt;
    if (sinceDraw < 0.033) return; // redraw the gauges at ~30 fps
    sinceDraw = 0;

    const kmh = Math.abs(state.v) * 3.6;
    const speedFrac = Math.min(1, Math.abs(state.v) / def.topSpeed);
    const gear = Math.min(4, (speedFrac * 5) | 0);
    let rpm = 0.12 + 0.88 * (speedFrac * 5 - gear);
    if (throttle && speedFrac < 0.05) rpm = 0.5;
    if (state.air) rpm = throttle ? 0.85 : 0.2;

    g.fillStyle = '#050608';
    g.fillRect(0, 0, 256, 128);
    shownKmh += (kmh - shownKmh) * 0.3;
    shownRpm += (rpm - shownRpm) * 0.3;
    dial(62, shownKmh / maxKmh, maxKmh, 20, 'km/h');
    dial(194, shownRpm * 0.9, 8, 1, 'x1000 rpm');
    g.fillStyle = '#e8f0f5';
    g.textAlign = 'center';
    g.font = 'bold 30px sans-serif';
    g.fillText(Math.round(shownKmh), 128, 78);
    g.font = 'bold 16px sans-serif';
    g.fillStyle = '#ffcf5a';
    g.fillText(state.v < -0.5 ? 'R' : Math.abs(state.v) < 0.5 ? 'N' : 'D' + (gear + 1), 128, 42);
    gaugeTex.needsUpdate = true;
    if (navTex) navTex.needsUpdate = true;
  };

  return group;
}
