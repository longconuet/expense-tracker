#!/usr/bin/env node
/**
 * Sinh icon PWA không cần dependency ngoài:
 * - PNG encoder tối giản (RGBA 8-bit, deflate qua node:zlib)
 * - Thiết kế: donut trắng (biểu tượng biểu đồ vòng) trên nền teal #0D9488,
 *   nội dung nằm trong safe zone maskable (bán kính 0.30 < 0.40).
 *
 * Chạy: pnpm --filter @expense-tracker/web icons
 * (file icon được commit — build không cần chạy lại script)
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// PNG encoder tối giản
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** size: cạnh hình vuông; rgba: mảng pixel RGBA thứ tự hàng */
function encodePng(size, rgba) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * stride + 1 + x * 4;
      raw[dst] = rgba[src];
      raw[dst + 1] = rgba[src + 1];
      raw[dst + 2] = rgba[src + 2];
      raw[dst + 3] = rgba[src + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Vẽ icon: donut trắng trên nền teal
// ---------------------------------------------------------------------------

const BG = [13, 148, 136]; // #0D9488
const FG = [255, 255, 255];

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.3;
  const rInner = size * 0.175;
  const aa = Math.max(1, size / 256); // độ rộng anti-alias ~1px ở 256
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const covOuter = clamp01((rOuter - d + aa / 2) / aa);
      const covInner = clamp01((d - rInner + aa / 2) / aa);
      const t = Math.min(covOuter, covInner);
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(BG[0] + (FG[0] - BG[0]) * t);
      rgba[i + 1] = Math.round(BG[1] + (FG[1] - BG[1]) * t);
      rgba[i + 2] = Math.round(BG[2] + (FG[2] - BG[2]) * t);
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const targets = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/apple-touch-icon.png", 180],
  ["public/favicon.png", 64],
];

for (const [rel, size] of targets) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, encodePng(size, renderIcon(size)));
  console.log("OK", rel, `${size}x${size}`);
}
