import { Mesh, SphereGeometry, ShaderMaterial, BackSide, Color, Vector3 } from 'three';
import { clamp, lerp } from '../util/math.js';

const VERT = 'varying vec3 d;void main(){d=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const FRAG =
  'varying vec3 d;uniform vec3 sd,hz,zn;uniform float nt;void main(){float h=max(d.y,0.);vec3 c=mix(hz,zn,pow(h,.45));' +
  'float s=max(dot(normalize(d),sd),0.);c+=vec3(1.,.82,.5)*(pow(s,8.)*.25+pow(s,400.)*2.)*(1.-nt);' +
  'float st=step(.997,fract(sin(dot(floor(d*150.),vec3(12.9,78.2,37.7)))*43758.5))*nt*step(0.,d.y);c+=vec3(st);gl_FragColor=vec4(c,1.);}';

/** Default palette = the original outback look. Maps may override any key. */
export const DEFAULT_ATMOSPHERE = {
  fogDensity: 0.0035,
  nightHorizon: [0.03, 0.04, 0.09],
  dayHorizon: [0.886, 0.824, 0.706],
  duskHorizon: [0.95, 0.55, 0.3],
  nightZenith: [0.01, 0.02, 0.07],
  dayZenith: [0.18, 0.43, 0.78],
};

const DAY_SECONDS = 600;

/** Sky dome + sun/hemisphere light + fog, driven by a 10 minute day/night clock. */
export class Atmosphere {
  constructor(stage) {
    this.stage = stage;
    this.time = 0.3; // 0..1, 0.25 = sunrise, 0.5 = noon -> starts around 07:12
    this.palette = { ...DEFAULT_ATMOSPHERE };
    this.night = 0;
    this.clockText = '00:00';

    this.dome = new Mesh(
      new SphereGeometry(900, 24, 12),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          sd: { value: new Vector3(80, 55, 60).normalize() },
          hz: { value: new Color(0.886, 0.824, 0.706) },
          zn: { value: new Color(0.18, 0.43, 0.78) },
          nt: { value: 0 },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
      }),
    );
    this.dome.renderOrder = -1;
    this.dome.frustumCulled = false;
    stage.scene.add(this.dome);
  }

  /** Apply a map's atmosphere overrides. */
  configure(overrides = {}) {
    this.palette = { ...DEFAULT_ATMOSPHERE, ...overrides };
    this.stage.scene.fog.density = this.palette.fogDensity;
  }

  /** @param focus Vector3-like {x,y,z} the sun's shadow box follows */
  update(dt, focus) {
    const { scene, sun, hemi, camera } = this.stage;
    const P = this.palette;
    this.time = (this.time + dt / DAY_SECONDS) % 1;
    const a = (this.time - 0.25) * Math.PI * 2;
    const s = Math.sin(a);
    const day = clamp((s + 0.12) / 0.4);
    const dusk = clamp(1 - Math.abs(s) / 0.35) * 0.8;
    this.night = 1 - day;

    const horizon = [0, 1, 2].map((i) => lerp(lerp(P.nightHorizon[i], P.dayHorizon[i], day), P.duskHorizon[i], dusk));
    const zenith = [0, 1, 2].map((i) => lerp(P.nightZenith[i], P.dayZenith[i], day));
    const u = this.dome.material.uniforms;
    u.hz.value.setRGB(...horizon);
    u.zn.value.setRGB(...zenith);
    u.nt.value = this.night;
    u.sd.value.set(Math.cos(a) * 0.8, s, Math.cos(a) * 0.6).normalize();
    scene.fog.color.setRGB(...horizon);

    sun.intensity = 1.2 * day;
    sun.color.setRGB(1, lerp(0.55, 0.94, day), lerp(0.3, 0.82, day));
    hemi.intensity = 0.12 + 0.65 * day;
    sun.position.set(focus.x, focus.y, focus.z).addScaledVector(u.sd.value, 120);
    sun.target.position.set(focus.x, focus.y, focus.z);
    this.dome.position.copy(camera.position);

    const c = this.time * 24;
    this.clockText = String(c | 0).padStart(2, '0') + ':' + String(((c % 1) * 60) | 0).padStart(2, '0');
  }
}
