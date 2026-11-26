/**
 * Vehicle catalogue. Order matters: the save file stores ownership by index.
 *
 *  length/width/wheelRadius : metres          power: engine strength   topSpeed: m/s
 *  steering: max steer angle (rad)            wheelFactor: wheel z-offset as a fraction of length
 *  eye: [height, z] of the driver's eye in vehicle space (cockpit camera)
 *  cabin / load: box-vehicle proportions (fractions of length) for the procedural models
 *  model: file name (without .glb) looked up in public/models/ - optional upgrade
 *         wheels inside the GLB must be named wheel_fl / wheel_fr / wheel_rl / wheel_rr
 */
export const VEHICLES = [
  {
    name: 'Seltos-style SUV', model: 'seltos-style-suv', detailed: true, cost: 0,
    color: 0xb3131f, length: 4.4, width: 1.8, wheelRadius: 0.35, power: 14, topSpeed: 38, steering: 0.6,
    wheelFactor: 0.298, eye: [1.38, -0.1],
  },
  {
    name: 'Ute', model: 'ute', cost: 300,
    color: 0xdedacc, length: 4.8, width: 1.9, wheelRadius: 0.42, power: 15, topSpeed: 38, steering: 0.55,
    wheelFactor: 0.32, eye: [1.75, 0.1],
    cabin: { length: 0.36, z: 0.17, height: 0.9 }, load: { length: 0.4, z: -0.3, height: 0.5 },
  },
  {
    name: 'Road Truck', model: 'road-truck', cost: 700,
    color: 0xc2452d, length: 7.2, width: 2.5, wheelRadius: 0.7, power: 20, topSpeed: 28, steering: 0.4,
    wheelFactor: 0.32, eye: [2.5, 0.4],
    cabin: { length: 0.28, z: 0.34, height: 1.3 }, load: { length: 0.55, z: -0.17, height: 1.5, color: 0x777b7d },
  },
  {
    name: 'Quad', model: 'quad', cost: 1000, quad: true,
    color: 0xd9a521, length: 2.1, width: 1.1, wheelRadius: 0.33, power: 17, topSpeed: 34, steering: 0.8,
    wheelFactor: 0.35, eye: [1.2, -0.1],
    cabin: { length: 0.3, z: -0.1, height: 0.35, color: 0x222222 }, load: null,
  },
];
