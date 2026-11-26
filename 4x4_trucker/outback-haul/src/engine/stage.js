import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, FogExp2,
  PCFSoftShadowMap, ACESFilmicToneMapping,
} from 'three';
import { LOW_QUALITY } from '../config.js';

/** Renderer, scene, camera and the two global lights. Created once. */
export function createStage() {
  const renderer = new WebGLRenderer({ alpha: true, antialias: !LOW_QUALITY });
  renderer.setPixelRatio(Math.min(devicePixelRatio, LOW_QUALITY ? 1.25 : 1.75));
  renderer.shadowMap.enabled = !LOW_QUALITY;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  document.body.prepend(renderer.domElement);

  const scene = new Scene();
  scene.fog = new FogExp2(0xe2d2b4, 0.0035);

  const camera = new PerspectiveCamera(60, 1, 0.1, 1400);

  const hemi = new HemisphereLight(0xcfe3ff, 0x8a5a3a, 0.75);
  scene.add(hemi);

  const sun = new DirectionalLight(0xfff0d0, 1.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 250 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, hemi, sun, resize };
}
