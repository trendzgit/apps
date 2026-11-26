Optional 3D vehicle models
==========================
Drop a .glb here named after a vehicle's `model` field (see src/vehicles/vehicleDefs.js):

  seltos-style-suv.glb   ute.glb   road-truck.glb   quad.glb

If the file exists it replaces the procedural body; if not, the built-in model is used.
Requirements: forward = +Z, wheels as separate nodes named wheel_fl, wheel_fr, wheel_rl, wheel_rr
(otherwise the procedural wheels are kept). The model is auto-scaled to the vehicle's `length`.

Free CC0 car models: kenney.nl (Car Kit), quaternius.com.
