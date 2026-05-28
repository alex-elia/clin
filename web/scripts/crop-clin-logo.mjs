/**
 * Tight-crop Clin logo PNG (removes white/near-white padding).
 * Usage: node scripts/crop-clin-logo.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

const sources = [
  path.join(webRoot, "public", "brand", "Clin_Logo_Small.png"),
];

const WHITE_THRESHOLD = 248;

function isBackground(r, g, b, a) {
  if (a < 12) return true;
  return r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD;
}

async function findBounds(inputPath) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = channels >= 4 ? data[i + 3] : 255;
      if (!isBackground(r, g, b, a)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error("No non-background pixels found");
  }

  const pad = 4;
  return {
    left: Math.max(0, minX - pad),
    top: Math.max(0, minY - pad),
    width: Math.min(width, maxX - minX + 1 + pad * 2),
    height: Math.min(height, maxY - minY + 1 + pad * 2),
  };
}

async function cropFile(inputPath) {
  const bounds = await findBounds(inputPath);
  const out = await sharp(inputPath)
    .extract(bounds)
    .png({ compressionLevel: 9 })
    .toBuffer();

  const meta = await sharp(out).metadata();
  fs.writeFileSync(inputPath, out);
  console.info(
    `[clin] Cropped ${path.basename(inputPath)} → ${meta.width}×${meta.height}px`,
  );
  return out;
}

for (const src of sources) {
  if (!fs.existsSync(src)) {
    console.warn(`[clin] Skip missing ${src}`);
    continue;
  }
  await cropFile(src);
}

const extDest = path.join(webRoot, "..", "extension", "icons", "Clin_Logo_Small.png");
if (fs.existsSync(sources[0])) {
  fs.mkdirSync(path.dirname(extDest), { recursive: true });
  fs.copyFileSync(sources[0], extDest);
  console.info(`[clin] Copied to ${extDest}`);
}
