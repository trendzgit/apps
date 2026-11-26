import { SAVE_KEY, LEGACY_SAVE_KEY } from '../config.js';

/**
 * Save format v2:
 *   cash, owned[]  -> shared across all maps (earn anywhere, spend anywhere)
 *   progress[mapId] = { level, earned }   -> each map has its own level
 * A v1 save ("outbackhaul1": {lv, cash, own}) is migrated into the outback map's progress.
 */
export function loadSave(vehicleCount) {
  const save = { version: 2, cash: 0, owned: [1], progress: {}, lastMap: null };
  try {
    const v2 = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (v2) Object.assign(save, v2);
    else {
      const v1 = JSON.parse(localStorage.getItem(LEGACY_SAVE_KEY));
      if (v1) {
        save.cash = v1.cash | 0;
        save.owned = v1.own || [1];
        save.progress.outback = { level: v1.lv || 1, earned: 0 };
      }
    }
  } catch { /* corrupt or unavailable storage: start fresh */ }
  while (save.owned.length < vehicleCount) save.owned.push(0);
  if (!save.owned.some(Boolean)) save.owned[0] = 1;
  return save;
}

export function persist(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore */ }
}

export function mapProgress(save, mapId) {
  return (save.progress[mapId] ||= { level: 1, earned: 0 });
}
