/**
 * MAP CONTRACT
 * ============
 * A map is a plain object. Add one file in src/maps/, register it in src/maps/index.js - that's it.
 *
 * @typedef {Object} Surface
 * @property {string} name
 * @property {number} grip      tyre grip multiplier (1 = packed dirt)
 * @property {number} drag      rolling resistance multiplier
 * @property {number} shake     camera shake at full speed
 * @property {number|null} dust hex colour of the dust puff, or null for none
 * @property {number} tireFreq  road-noise band-pass centre (Hz)
 * @property {number} tireGain  road-noise loudness multiplier
 *
 * @typedef {Object} Location   a pickup / drop-off point
 * @property {string} name
 * @property {number} x
 * @property {number} z
 *
 * @typedef {Object} MapDef
 * @property {string} id                 unique, used in the save file
 * @property {string} name
 * @property {string} tagline            one line on the map-select card
 * @property {number} size               world edge length (m), centred on 0,0
 * @property {number} bound              cars are stopped at |x|,|z| > bound
 * @property {number} physicsDivisions   heightfield resolution (use a small number for flat maps)
 * @property {{x:number,z:number,h:number,name:string}} spawn   start / "home" position
 * @property {Location[]} locations      job pickup/drop-off points (min 2)
 * @property {Partial<import('../game/jobs.js').DEFAULT_ECONOMY>} [economy]
 * @property {{kind:'grid',pitch:number,roadWidth:number,min:number,max:number,count?:number,laneOffset?:number}} [traffic]
 *     ambient traffic for grid road layouts (see src/traffic/); omit for no traffic
 * @property {Object} [atmosphere]       overrides for engine/atmosphere.js DEFAULT_ATMOSPHERE
 * @property {Surface[]} surfaces
 * @property {(x:number,z:number)=>number} heightAt     terrain height (m)
 * @property {(x:number,z:number)=>number} surfaceAt    index into `surfaces`
 * @property {(x:number,z:number)=>number[]} minimapColor  [r,g,b] 0..255 (also used for the select-screen preview)
 * @property {(ctx:{group:import('three').Group, colliders:import('../engine/colliders.js').ColliderGrid, low:boolean})=>{update?:(dt:number, env:{night:number})=>void}|void} build
 *     create scenery inside ctx.group (it is removed + disposed automatically on map change)
 *     and register collisions with ctx.colliders.addCircle / addBox
 */
export {};
