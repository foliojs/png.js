// Synthesizes large PNG fixtures into bench/fixtures/ so multi-megabyte
// files never need to be checked in. Uses a seeded PRNG so every run
// produces identical files and before/after benchmarks measure the same data.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fixturesDir, mb } from './common.js';

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function ihdr(width, height, bitDepth, colorType, interlace = 0) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = bitDepth;
  data[9] = colorType;
  data[12] = interlace;
  return data;
}

const ADAM7_PASSES = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

// Serializes raw pixels into Adam7 pass order, every row filter None.
function serializeAdam7(raw, width, height, pixelBytes) {
  const parts = [];
  for (const [x0, y0, dx, dy] of ADAM7_PASSES) {
    const passWidth = Math.ceil((width - x0) / dx);
    const passHeight = Math.ceil((height - y0) / dy);
    if (passWidth <= 0 || passHeight <= 0) continue;
    const pass = Buffer.alloc(passHeight * (1 + passWidth * pixelBytes));
    let pos = 0;
    for (let passY = 0; passY < passHeight; passY++) {
      pass[pos++] = 0;
      const y = y0 + passY * dy;
      for (let passX = 0; passX < passWidth; passX++) {
        const x = x0 + passX * dx;
        const src = (y * width + x) * pixelBytes;
        raw.copy(pass, pos, src, src + pixelBytes);
        pos += pixelBytes;
      }
    }
    parts.push(pass);
  }
  return Buffer.concat(parts);
}

// xorshift32 — deterministic noise
function makeRandom(seed) {
  let s = seed;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) & 0xff;
  };
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}

// Forward-filters raw scanlines with the given per-row filter type so the
// decoder's corresponding unfilter path is exercised.
function filterRows(raw, width, height, pixelBytes, filterForRow) {
  const stride = width * pixelBytes;
  const out = Buffer.alloc(height * (stride + 1));
  const zero = Buffer.alloc(stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const row = raw.subarray(y * stride, (y + 1) * stride);
    const prev = y === 0 ? zero : raw.subarray((y - 1) * stride, y * stride);
    const type = filterForRow(y);
    out[pos++] = type;
    for (let i = 0; i < stride; i++) {
      const left = i < pixelBytes ? 0 : row[i - pixelBytes];
      const up = prev[i];
      const upLeft = i < pixelBytes ? 0 : prev[i - pixelBytes];
      let v;
      switch (type) {
        case 0:
          v = row[i];
          break;
        case 1:
          v = row[i] - left;
          break;
        case 2:
          v = row[i] - up;
          break;
        case 3:
          v = row[i] - ((left + up) >> 1);
          break;
        case 4:
          v = row[i] - paeth(left, up, upLeft);
          break;
      }
      out[pos++] = v & 0xff;
    }
  }
  return out;
}

function writePng(name, width, height, colorType, pixelBytes, raw, filterForRow) {
  const filtered = filterRows(raw, width, height, pixelBytes, filterForRow);
  const file = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr(width, height, 8, colorType)),
    chunk('IDAT', zlib.deflateSync(filtered)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  const dest = path.join(fixturesDir, name);
  fs.writeFileSync(dest, file);
  console.log(
    `${name}: ${width}x${height}, raw ${mb(raw.length)}, file ${mb(file.length)}`
  );
}

fs.mkdirSync(fixturesDir, { recursive: true });

const SIZE = 2048;

// Worst case for IDAT accumulation and unfilter throughput: incompressible
// noise, so the compressed stream stays large.
{
  const rand = makeRandom(0xc0ffee);
  const raw = Buffer.alloc(SIZE * SIZE * 4);
  for (let i = 0; i < raw.length; i++) raw[i] = rand();
  writePng('large-rgba-noise.png', SIZE, SIZE, 6, 4, raw, () => 0);
}

// Smooth gradient cycling filters 1-4 per row to hit every unfilter hot path.
{
  const raw = Buffer.alloc(SIZE * SIZE * 3);
  let pos = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      raw[pos++] = x & 0xff;
      raw[pos++] = y & 0xff;
      raw[pos++] = (x + y) & 0xff;
    }
  }
  writePng('large-rgb-gradient.png', SIZE, SIZE, 2, 3, raw, y => (y % 4) + 1);
}

// Adam7-interlaced noise: exercises the interlaced decode path (per-pass
// scratch memory and the pass-merge loops) at scale.
{
  const rand = makeRandom(0xdecade);
  const raw = Buffer.alloc(SIZE * SIZE * 4);
  for (let i = 0; i < raw.length; i++) raw[i] = rand();
  const filtered = serializeAdam7(raw, SIZE, SIZE, 4);
  const file = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr(SIZE, SIZE, 8, 6, 1)),
    chunk('IDAT', zlib.deflateSync(filtered)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(path.join(fixturesDir, 'large-rgba-interlaced.png'), file);
  console.log(
    `large-rgba-interlaced.png: ${SIZE}x${SIZE}, raw ${mb(raw.length)}, file ${mb(file.length)}`
  );
}
