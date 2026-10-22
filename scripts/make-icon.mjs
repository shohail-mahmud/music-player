/**
 * Generates `src-tauri/icons/source.png` — a 512×512 RGBA PNG of the Vesper
 * mark, drawn from vector geometry (rounded plate + V strokes + dot) rather
 * than shipped as a binary blob in the repository.
 *
 *   node scripts/make-icon.mjs
 *
 * The GitHub Actions workflow runs this and then `npx tauri icon` to expand the
 * full icon set (32/128/256/512 PNG + .ico + .icns) required by the Windows
 * bundler.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 512;

/* --------------------------- PNG encoding --------------------------- */

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 8) ^ 0xedb88320 : crc >>> 8;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------- vector geometry -------------------------- */

function roundedPlate(x, y, radius) {
  const half = SIZE / 2;
  const dx = Math.abs(x - half) - (half - radius);
  const dy = Math.abs(y - half) - (half - radius);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - radius;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = Math.min(1, Math.max(0, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function inside(x, y) {
  // rounded plate
  if (roundedPlate(x, y, 116) > 0) return null;
  const plateTint = 1 - (y / SIZE) * 0.16; // subtle vertical gradient
  let r = 90 * plateTint + 20;
  let g = 82 * plateTint + 18;
  let b = 214 * plateTint + 18;

  // V strokes
  const stroke = 36;
  const left = distanceToSegment(x, y, 152, 168, 256, 356);
  const right = distanceToSegment(x, y, 256, 356, 360, 168);
  const dot = Math.hypot(x - 256, y - 402) - 24;

  if (Math.min(left, right, dot) <= 0) {
    r = 252;
    g = 251;
    b = 250;
    return [r, g, b, 255];
  }
  return [r, g, b, 255];
}

function render() {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  const samples = 3;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          const colour = inside(px, py);
          if (!colour) continue;
          r += colour[0];
          g += colour[1];
          b += colour[2];
          a += colour[3];
        }
      }
      const count = samples * samples;
      const offset = (y * SIZE + x) * 4;
      rgba[offset] = Math.round(r / count);
      rgba[offset + 1] = Math.round(g / count);
      rgba[offset + 2] = Math.round(b / count);
      rgba[offset + 3] = Math.round(a / count);
    }
  }
  return rgba;
}

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src-tauri/icons");
mkdirSync(outDir, { recursive: true });
const target = resolve(outDir, "source.png");
writeFileSync(target, encodePng(SIZE, SIZE, render()));
console.log(`✓ wrote ${target} (${SIZE}×${SIZE})`);
