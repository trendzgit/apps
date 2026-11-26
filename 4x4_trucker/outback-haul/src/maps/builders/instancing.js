import { Object3D } from 'three';

const dummy = new Object3D();

/**
 * Set instance `index` of `mesh` at ground position (x,z).
 * y = ground + yOffset*scale; vertical squash = yScale; random yaw from rng.
 */
export function placeInstance(mesh, index, { x, z, y, scale, yOffset = 0, yScale = 1, yaw }) {
  dummy.position.set(x, y + yOffset * scale, z);
  dummy.scale.set(scale, scale * yScale, scale);
  dummy.rotation.y = yaw;
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}
