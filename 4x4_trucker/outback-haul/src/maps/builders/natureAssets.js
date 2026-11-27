import { Box3, Group, InstancedMesh, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Selected Quaternius Stylized Nature MegaKit models, distributed as CC0 assets
// in The Wild Between repository. The original game/code is not imported here.
export const NATURE_ASSET_BASE =
  'https://cdn.jsdelivr.net/gh/anandin/the-wild-between@main/assets/quaternius-nature/';

const VERSION_TAG = 'outback-haul-v5-20261126';
const dummy = new Object3D();

function loadModel(loader, name) {
  return new Promise((resolve, reject) => {
    loader.load(`${name}.gltf?v=${VERSION_TAG}`, resolve, undefined, reject);
  });
}

/**
 * Loads a set of ordinary glTF (not meshopt/KTX2) models and creates one or more
 * InstancedMeshes per source model. That keeps the asset pack compatible with the
 * game's existing Three.js r128 GLTFLoader and avoids one draw call per tree.
 *
 * placements are pre-authored by the map and include {x,z,yaw,scale,model}.
 * Procedural meshes are hidden only after every model in the category succeeded.
 */
export async function addInstancedNatureSet({
  group,
  specs,
  placements,
  heightAt,
  low,
  fallbacks = [],
  category = 'nature',
}) {
  if (!placements.length || !specs.length) return false;

  const loader = new GLTFLoader();
  loader.setCrossOrigin('anonymous');
  loader.setPath(NATURE_ASSET_BASE);

  let loaded;
  try {
    loaded = await Promise.all(specs.map((spec) => loadModel(loader, spec.name)));
  } catch (error) {
    console.warn(`[Outback] ${category} assets could not be loaded; procedural fallback retained.`, error);
    return false;
  }

  // A map change may have disposed its group while the remote files were loading.
  if (!group.parent) return false;

  const assetGroup = new Group();
  assetGroup.name = `outback-${category}-assets`;
  const prepared = [];

  try {
    for (let modelIndex = 0; modelIndex < specs.length; modelIndex++) {
      const spec = specs[modelIndex];
      const gltf = loaded[modelIndex];
      const modelPlacements = placements.filter((placement) => placement.model === spec.name);
      if (!modelPlacements.length) continue;

      const root = gltf.scene || gltf.scenes?.[0];
      if (!root) throw new Error(`${spec.name} contains no glTF scene`);
      root.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(root);
      const groundOffset = Number.isFinite(bounds.min.y) ? bounds.min.y : 0;
      const sourceMeshes = [];
      root.traverse((node) => {
        if (node.isMesh && node.geometry && node.material) sourceMeshes.push(node);
      });
      if (!sourceMeshes.length) throw new Error(`${spec.name} contains no mesh geometry`);

      for (const source of sourceMeshes) {
        const geometry = source.geometry.clone();
        geometry.applyMatrix4(source.matrixWorld);
        geometry.translate(0, -groundOffset, 0);
        if (!geometry.attributes.normal) geometry.computeVertexNormals();
        geometry.computeBoundingSphere();

        const instances = new InstancedMesh(geometry, source.material, modelPlacements.length);
        instances.name = `${spec.name}-instances`;
        for (let i = 0; i < modelPlacements.length; i++) {
          const placement = modelPlacements[i];
          const scale = (placement.scale ?? 1) * (spec.scale ?? 1);
          dummy.position.set(placement.x, heightAt(placement.x, placement.z) + (placement.yOffset ?? 0), placement.z);
          dummy.rotation.set(0, placement.yaw ?? 0, 0);
          dummy.scale.set(scale * (spec.scaleX ?? 1), scale * (spec.scaleY ?? 1), scale * (spec.scaleZ ?? 1));
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

    if (!assetGroup.children.length) throw new Error(`${category} asset set produced no instanced meshes`);
    group.add(assetGroup);
    for (const fallback of fallbacks) fallback.visible = false;
    console.info(`[Outback] Loaded ${category} asset set (${assetGroup.children.length} instanced mesh parts).`);
    return true;
  } catch (error) {
    for (const geometry of prepared) geometry.dispose();
    console.warn(`[Outback] ${category} asset setup failed; procedural fallback retained.`, error);
    return false;
  }
}
