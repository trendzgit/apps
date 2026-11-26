const params = new URLSearchParams(location.search);

/** 'high' | 'low'. Override with ?q=low or ?q=high. Low = no shadows/AA/mirror/bump. */
export const QUALITY = params.get('q') || (navigator.hardwareConcurrency <= 2 ? 'low' : 'high');
export const LOW_QUALITY = QUALITY === 'low';

/** localStorage keys. The legacy key is migrated automatically (see game/save.js). */
export const SAVE_KEY = 'outbackhaul2';
export const LEGACY_SAVE_KEY = 'outbackhaul1';
