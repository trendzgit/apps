import outback from './outback.js';
import city from './city.js';
import farmland from './farmland.js';

/** Registered maps, in menu order. To add a map: create src/maps/<name>.js and list it here. */
export const MAPS = [outback, city, farmland];

export const getMap = (id) => MAPS.find((m) => m.id === id) || MAPS[0];
