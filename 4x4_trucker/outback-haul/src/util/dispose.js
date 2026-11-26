const TEXTURE_SLOTS = ['map', 'bumpMap', 'emissiveMap', 'normalMap', 'alphaMap', 'aoMap'];

/** Free GPU memory for everything under `root` (used when switching maps). */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const slot of TEXTURE_SLOTS) if (m[slot]) m[slot].dispose();
      m.dispose();
    }
  });
}
