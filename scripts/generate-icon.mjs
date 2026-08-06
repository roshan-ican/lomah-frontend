// Generates build/icon.ico — the Windows app, installer and taskbar icon.
//
// The repo has no brand asset, so the mark is drawn here in code rather than
// committed as an opaque binary: it stays reproducible, reviewable in a diff,
// and trivial to retune. Run `npm run icon` after changing anything below.
//
// To use a real logo instead, drop a 256x256-or-larger .ico at build/icon.ico
// and delete this script plus the `icon` npm script — electron-builder only
// cares about the file.
//
// No image dependencies: PNG (zlib is built into Node) and ICO are both written
// by hand below. Windows Vista and later accept PNG-compressed ICO entries,
// which is what keeps this short — no BMP/AND-mask encoding needed.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "build", "icon.ico");

// Windows renders the icon everywhere from 16px (tray, title bar) to 256px
// (Explorer's extra-large view). Each size is drawn independently rather than
// downscaled, so the ring weights stay legible at the small end.
const SIZES = [16, 32, 48, 64, 128, 256];

const BG = [11, 18, 32]; // slate-950, reads as near-black on light and dark taskbars
const RING = [226, 232, 240]; // slate-200
const DOT = [239, 68, 68]; // red-500 — the "hit" marker

// ── Drawing ───────────────────────────────────────────────────────────────────

/** Signed distance to a rounded rectangle centred on the origin. Negative inside. */
function roundedRectDistance(x, y, halfW, halfH, radius) {
  const qx = Math.abs(x) - halfW + radius;
  const qy = Math.abs(y) - halfH + radius;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
}

/** A bullseye on a rounded-square field, as raw RGBA.
 *
 *  Antialiasing is done by supersampling: every output pixel is the average of
 *  SS x SS point samples. Small icons get a denser grid because a single pixel
 *  there covers a much larger share of the mark, so stair-stepping shows. */
function drawIcon(size) {
  const ss = size <= 48 ? 8 : 4;
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;

  // Proportional geometry, so every size is the same mark at a different scale.
  const outerR = size * 0.36;
  const midR = size * 0.24;
  const dotR = size * 0.11;
  const stroke = Math.max(size * 0.055, 1.15); // floor keeps 16px rings visible
  const corner = size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px_ = x + (sx + 0.5) / ss;
          const py_ = y + (sy + 0.5) / ss;
          const dx = px_ - c;
          const dy = py_ - c;

          // Outside the rounded square: fully transparent.
          if (roundedRectDistance(dx, dy, c, c, corner) > 0) continue;

          let col = BG;
          const dist = Math.hypot(dx, dy);
          const onOuter = Math.abs(dist - outerR) <= stroke / 2;
          const onMid = Math.abs(dist - midR) <= stroke / 2;
          if (onOuter || onMid) col = RING;
          else if (dist <= dotR) col = DOT;

          r += col[0];
          g += col[1];
          b += col[2];
          a += 255;
        }
      }

      const n = ss * ss;
      const i = (y * size + x) * 4;
      // Un-premultiply: colour is averaged over covered samples only, while
      // alpha is averaged over all of them. Averaging colour over all samples
      // instead would bleed black into every edge.
      const cov = a / 255;
      px[i] = cov ? Math.round(r / cov) : 0;
      px[i + 1] = cov ? Math.round(g / cov) : 0;
      px[i + 2] = cov ? Math.round(b / cov) : 0;
      px[i + 3] = Math.round(a / n);
    }
  }
  return px;
}

// ── PNG encoding ──────────────────────────────────────────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
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

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // truecolour with alpha
  // bytes 10-12 stay 0: deflate, adaptive filtering, no interlace

  // Each scanline is prefixed with its filter type; 0 (None) is fine here —
  // the image is tiny and zlib still compresses the flat regions well.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── ICO container ─────────────────────────────────────────────────────────────

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);

  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;

  images.forEach(({ size, png }, i) => {
    const e = i * 16;
    dir[e] = size === 256 ? 0 : size; // 0 is how ICO encodes 256
    dir[e + 1] = size === 256 ? 0 : size;
    dir[e + 2] = 0; // palette size (not paletted)
    dir[e + 3] = 0; // reserved
    dir.writeUInt16LE(1, e + 4); // colour planes
    dir.writeUInt16LE(32, e + 6); // bits per pixel
    dir.writeUInt32LE(png.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });

  return Buffer.concat([header, dir, ...images.map((i) => i.png)]);
}

const images = SIZES.map((size) => ({ size, png: encodePng(drawIcon(size), size) }));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buildIco(images));

console.log(`[generate-icon] Wrote ${OUT}`);
for (const { size, png } of images) {
  console.log(`[generate-icon]   ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
