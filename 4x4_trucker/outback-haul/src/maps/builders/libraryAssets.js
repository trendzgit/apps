import { Box3, Group, InstancedMesh, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Kenney's 1,883-model CC0 library, mirrored as self-contained GLB files.
// GLB keeps each model's materials/textures embedded and works with Three.js r128.
export const KENNEY_LIBRARY_BASE = 'https://cdn.jsdelivr.net/gh/Hidencod/tge-assets@main/';
const dummy = new Object3D();
const sizeVector = new Vector3();

function loadAsset(loader, file) {
  return new Promise((resolve, reject) => {
    loader.load(`${KENNEY_LIBRARY_BASE}${file}`, resolve, undefined, reject);
  });
}

/**
 * Loads selected CC0 Kenney GLB files and batches identical model pieces with
 * InstancedMesh. Each category fails independently, so an unavailable pack does
 * not prevent Outback from loading. placements use {model,x,z,yaw,scale,yOffset}.
 */
export async function addInstancedLibrarySet({
  group,
  specs,
  placements,
  heightAt,
  low,
  fallback = [],
  category = 'library-assets',
  onLoaded = null,
}) {
  if (!group || !specs?.length || !placements?.length) return false;

  const usedSpecs = specs.filter((spec) => placements.some((p) => p.model === spec.id));
  if (!usedSpecs.length) return false;

  const loader = new GLTFLoader();
  loader.setCrossOrigin('anonymous');
  let loaded;
  try {
    loaded = await Promise.all(usedSpecs.map((spec) => loadAsset(loader, spec.file)));
  } catch (error) {
    console.warn(`[Outback] ${category} could not load from Kenney library; existing scenery retained.`, error);
    return false;
  }

  // The map might have changed while remote models were being fetched.
  if (!group.parent) return false;

  const assetGroup = new Group();
  assetGroup.name = `outback-${category}`;
  const prepared = [];

  try {
    for (let modelIndex = 0; modelIndex < usedSpecs.length; modelIndex++) {
      const spec = usedSpecs[modelIndex];
      const gltf = loaded[modelIndex];
      const modelPlacements = placements.filter((placement) => placement.model === spec.id);
      const root = gltf.scene || gltf.scenes?.[0];
      if (!root) throw new Error(`${spec.file} contains no glTF scene`);
      root.updateMatrixWorld(true);

      const bounds = new Box3().setFromObject(root);
      const modelHeight = Math.max(0.001, bounds.getSize(sizeVector).y);
      const sizeScale = Number.isFinite(spec.targetHeight) ? spec.targetHeight / modelHeight : (spec.scale ?? 1);
      const groundOffset = Number.isFinite(bounds.min.y) ? bounds.min.y : 0;
      const sourceMeshes = [];
      root.traverse((node) => {
        if (node.isMesh && node.geometry && node.material) sourceMeshes.push(node);
      });
      if (!sourceMeshes.length) throw new Error(`${spec.file} contains no mesh geometry`);

      for (const source of sourceMeshes) {
        const geometry = source.geometry.clone();
        geometry.applyMatrix4(source.matrixWorld);
        geometry.translate(0, -groundOffset, 0);
        if (!geometry.attributes.normal) geometry.computeVertexNormals();
        geometry.computeBoundingSphere();

        const instances = new InstancedMesh(geometry, source.material, modelPlacements.length);
        instances.name = `${spec.id}-instances`;
        for (let i = 0; i < modelPlacements.length; i++) {
          const placement = modelPlacements[i];
          const scale = sizeScale * (placement.scale ?? 1);
          dummy.position.set(
            placement.x,
            heightAt(placement.x, placement.z) + (placement.yOffset ?? 0),
            placement.z,
          );
          dummy.rotation.set(0, placement.yaw ?? 0, 0);
          dummy.scale.set(
            scale * (spec.scaleX ?? 1),
            scale * (spec.scaleY ?? 1),
            scale * (spec.scaleZ ?? 1),
          );
          dummy.updateMatrix();
          instances.setMatrixAt(i, dummy.matrix);
        }
        instances.instanceMatrix.needsUpdate = true;
        instances.castShadow = !low && spec.castShadow !== false;
        instances.receiveShadow = !low && spec.receiveShadow !== false;
        instances.frustumCulled = false;
        assetGroup.add(instances);
        prepared.push(geometry);
      }
    }

    if (!assetGroup.children.length) throw new Error(`${category} produced no instanced meshes`);
    group.add(assetGroup);
    for (const mesh of fallback) mesh.visible = false;
    if (typeof onLoaded === 'function') onLoaded();
    console.info(`[Outback] Loaded ${category} from Kenney CC0 library (${assetGroup.children.length} instanced mesh parts).`);
    return true;
  } catch (error) {
    for (const geometry of prepared) geometry.dispose();
    console.warn(`[Outback] ${category} setup failed; existing scenery retained.`, error);
    return false;
  }
}
