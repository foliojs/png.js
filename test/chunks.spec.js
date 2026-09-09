import fs from 'fs';
import PNGNode from '../lib/png-js.cjs';

// Chunk-level coverage the image fixtures can't provide: every checked-in
// PNG has a single IDAT chunk and no tEXt chunk, so these tests synthesize
// variants from a real fixture instead of adding binaries.

const validBuffer = () => fs.readFileSync('test/images/rgb-8bit.png');

// Offset of the length field of the first chunk with the given type.
function findChunk(buffer, type) {
  let pos = 8;
  while (pos + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(pos);
    const section = buffer.toString('ascii', pos + 4, pos + 8);
    if (section === type) return pos;
    pos += 12 + size;
  }
  throw new Error(`no ${type} chunk found`);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// The decoder skips CRCs, but real ones keep the fixtures valid PNGs.
function chunk(type, payload) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), payload])), 0);
  return Buffer.concat([head, payload, crc]);
}

function withTextChunk(payload) {
  const buffer = validBuffer();
  const idat = findChunk(buffer, 'IDAT');
  return Buffer.concat([
    buffer.subarray(0, idat),
    chunk('tEXt', payload),
    buffer.subarray(idat)
  ]);
}

// Replaces the fixture's single IDAT chunk with one chunk per span between
// consecutive split points (so [n] makes two chunks and [n, n] makes three,
// the middle one empty).
function splitIdat(splitPoints) {
  const buffer = validBuffer();
  const idat = findChunk(buffer, 'IDAT');
  const size = buffer.readUInt32BE(idat);
  const payload = buffer.subarray(idat + 8, idat + 8 + size);
  const bounds = [0, ...splitPoints, size];
  const chunks = [];
  for (let i = 1; i < bounds.length; i++) {
    chunks.push(chunk('IDAT', payload.subarray(bounds[i - 1], bounds[i])));
  }
  return Buffer.concat([
    buffer.subarray(0, idat),
    ...chunks,
    buffer.subarray(idat + 12 + size)
  ]);
}

const idatSize = (() => {
  const buffer = validBuffer();
  return buffer.readUInt32BE(findChunk(buffer, 'IDAT'));
})();

describe('multiple IDAT chunks', () => {
  test('node: split streams concatenate to the single-chunk result', () => {
    const original = new PNGNode(validBuffer());
    const split = new PNGNode(splitIdat([idatSize >> 1]));
    expect(Buffer.from(split.imgData)).toEqual(Buffer.from(original.imgData));
    expect(Buffer.from(split.decodePixelsSync())).toEqual(
      Buffer.from(original.decodePixelsSync())
    );
  });

  test('node: zero-length IDAT chunks are tolerated', () => {
    const original = new PNGNode(validBuffer());
    const split = new PNGNode(splitIdat([1, 1, idatSize >> 1]));
    expect(Buffer.from(split.imgData)).toEqual(Buffer.from(original.imgData));
    expect(Buffer.from(split.decodePixelsSync())).toEqual(
      Buffer.from(original.decodePixelsSync())
    );
  });

  test('browser: split streams concatenate to the single-chunk result', () => {
    const original = new PNG(validBuffer());
    const split = new PNG(splitIdat([idatSize >> 1]));
    expect(Buffer.from(split.imgData)).toEqual(Buffer.from(original.imgData));
    expect(Buffer.from(split.decodePixels())).toEqual(
      Buffer.from(original.decodePixels())
    );
  });
});

// The chunked latin1 decoder only exists in the packaged build, so these
// cover PNGNode only (matching malformed.spec.js).
describe('tEXt chunks', () => {
  test('parses a key/value pair', () => {
    const png = new PNGNode(withTextChunk(Buffer.from('Title\0Hello, png.js')));
    expect(png.text).toEqual({ Title: 'Hello, png.js' });
    // The inserted chunk must not disturb the surrounding parse.
    expect(png.width).toBeGreaterThan(0);
    expect(Buffer.from(png.decodePixelsSync())).toEqual(
      Buffer.from(new PNGNode(validBuffer()).decodePixelsSync())
    );
  });

  test('preserves the historical no-separator behavior', () => {
    // Without a NUL separator, indexOf returns -1 and the slices below
    // keep behaving as they always have: the key drops the payload's last
    // byte and the value repeats the whole payload.
    const png = new PNGNode(withTextChunk(Buffer.from('NoSeparator')));
    expect(png.text).toEqual({ NoSeparato: 'NoSeparator' });
  });

  test('decodes values longer than 0x8000 across chunks', () => {
    // Position-dependent bytes so an offset error at a 0x8000 boundary
    // changes the result.
    const length = 0x10005;
    const value = Buffer.alloc(length);
    let expected = '';
    for (let i = 0; i < length; i++) {
      value[i] = 32 + (i % 95);
      expected += String.fromCharCode(32 + (i % 95));
    }
    const png = new PNGNode(
      withTextChunk(Buffer.concat([Buffer.from('Comment\0'), value]))
    );
    expect(png.text.Comment).toHaveLength(length);
    expect(png.text.Comment).toBe(expected);
  });
});
