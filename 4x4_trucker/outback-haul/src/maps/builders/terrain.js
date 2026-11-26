import { PlaneGeometry, BufferAttribute, CanvasTexture, RepeatWrapping } from 'three';

/** Height-displaced, vertex-coloured square terrain mesh geometry. */
export function createTerrainGeometry({ size, segments, heightAt, colorAt }) {
  const geo = new PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const c = colorAt(x, z);
    colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Tileable grainy ground texture (also used as bump map). Consumes the RNG in a fixed order,
 * so a given seed always yields the same pixels.
 */
export function createGroundTexture(rng, repeat = 220) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const make = (n) => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
  const ctx = canvas.getContext('2d');

  const tile = make(16), tctx = tile.getContext('2d');
  const img = tctx.createImageData(16, 16);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = (200 + rng() * 55) | 0;
    img.data[i + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);

  const mid = make(48), mctx = mid.getContext('2d');
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) mctx.drawImage(tile, a * 16, b * 16);
  const big = make(384), bctx = big.getContext('2d');
  bctx.imageSmoothingEnabled = true;
  bctx.drawImage(mid, 0, 0, 384, 384);
  ctx.drawImage(big, 128, 128, 128, 128, 0, 0, 128, 128);

  const data = ctx.getImageData(0, 0, 128, 128);
  for (let i = 0; i < data.data.length; i += 4) {
    const u = rng() * 26 + (rng() > 0.985 ? -50 : 0);
    data.data[i] -= u; data.data[i + 1] -= u; data.data[i + 2] -= u;
  }
  ctx.putImageData(data, 0, 0);

  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}
