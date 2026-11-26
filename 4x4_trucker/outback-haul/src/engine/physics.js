import * as CANNON from 'cannon-es';

const FIXED_STEP = 1 / 60;
const MAX_SUBSTEPS = 3;

/** Thin wrapper around the cannon-es world + the terrain heightfield for the current map. */
export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.ground = null;
    this.heightAt = () => 0;
  }

  /** Build a heightfield body from a map's height function (square, centred on the origin). */
  setTerrain(heightAt, size = 1000, divisions = 200) {
    this.clearTerrain();
    this.heightAt = heightAt;
    const step = size / divisions;
    const data = [];
    for (let i = 0; i <= divisions; i++) {
      const column = [];
      for (let j = 0; j <= divisions; j++) column.push(heightAt(-size / 2 + i * step, size / 2 - j * step));
      data.push(column);
    }
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Heightfield(data, { elementSize: step }) });
    body.position.set(-size / 2, 0, size / 2);
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(body);
    this.ground = body;
  }

  clearTerrain() {
    if (this.ground) this.world.removeBody(this.ground);
    this.ground = null;
  }

  step(dt) {
    this.world.step(FIXED_STEP, dt, MAX_SUBSTEPS);
  }
}

export { CANNON };
