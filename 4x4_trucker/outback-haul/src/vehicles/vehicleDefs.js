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
    name: 'Seltos-style SUV', model: 'seltos-style-suv', modelUrl: 'https://api.flockbay.com/bootstrap/library/models/v1/3c20b1a2dda34b6e5073e6b2b679466a2c7923f02e8b89e37fff607904108b2d/suv.glb', detailed: true, cost: 0,
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
    name: 'Road Truck', model: 'road-truck', modelUrl: 'https://api.flockbay.com/bootstrap/library/models/v1/f62f5ac4078681291debe9cc237af591b3dc6f1b7ad7a69a71e03010d1393dfd/truck.glb', cost: 700,
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


/**
 * Temporary vehicle definitions created when the player takes a street car.
 * The procedural body is the instant fallback; Kenney CC0 GLBs replace it when available.
 */
export function createStreetVehicleDef(car) {
  const common = {
    color: car.color,
    power: 15,
    topSpeed: 40,
    steering: 0.58,
    wheelFactor: 0.31,
    eye: [1.45, -0.08],
    cost: 0,
  };
  const definitions = [
    {
      name: 'Stolen Sedan', model: 'street-sedan',
      modelUrl: 'https://api.flockbay.com/bootstrap/library/models/v1/4d7d978c0849c4a2fb8c8756d9439113df28affc7c353640b09d461be86d51be/sedan.glb',
      length: 4.5, width: 1.8, wheelRadius: 0.31,
      cabin: { length: 0.5, z: -0.06, height: 0.72 }, load: null,
    },
    {
      name: 'Stolen Hatchback', model: 'street-hatchback',
      modelUrl: 'https://api.flockbay.com/bootstrap/library/models/v1/c66cb91dc8b5bf8b1c1512b03d534c939b2f32bb61a3f6f65dde8cfd13b962a8/hatchback-sports.glb',
      length: 3.8, width: 1.7, wheelRadius: 0.30,
      cabin: { length: 0.58, z: -0.1, height: 0.72 }, load: null,
    },
    {
      name: 'Stolen Van', model: 'street-van',
      modelUrl: 'https://api.flockbay.com/bootstrap/library/models/v1/8e79e9ff7f9c9ac7ff6904b232f7c6b3b0792952651ea72b3285f685a9cc5022/delivery.glb',
      length: 5.2, width: 2.0, wheelRadius: 0.34,
      cabin: { length: 0.32, z: 0.16, height: 0.92 }, load: { length: 0.42, z: -0.26, height: 0.95, color: car.color },
    },
    {
      name: 'Stolen Truck', model: 'street-truck',
      modelUrl: 'https://api.flockbay.com/bootstrap/library/models/v1/f62f5ac4078681291debe9cc237af591b3dc6f1b7ad7a69a71e03010d1393dfd/truck.glb',
      length: 7.0, width: 2.3, wheelRadius: 0.45, power: 18, topSpeed: 29,
      cabin: { length: 0.28, z: 0.34, height: 1.15 }, load: { length: 0.55, z: -0.17, height: 1.4, color: 0x777b7d },
    },
  ];
  const def = definitions[car.type] || definitions[0];
  return { ...common, ...def, color: car.color };
}
