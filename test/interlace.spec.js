import zlib from 'zlib';
import PNGNode from '../lib/png-js.cjs';
import PNGBrowser from '../lib/png-js.browser.js';

// Adam7 images less than five pixels wide have passes with no columns.
// An empty pass has no filter-type bytes (PNG spec 9.1), so the decoder
// must skip it instead of reading the next pass's data as a filter type.

function makeInterlacedPng({ width, height, rows }) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  // CRC values are zeros: the decoder validates lengths, not checksums.
  const chunk = (type, payload) => {
    const out = Buffer.alloc(12 + payload.length);
    out.writeUInt32BE(payload.length, 0);
    out.write(type, 4, 'ascii');
    payload.copy(out, 8);
    return out;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  ihdr[12] = 1; // Adam7

  // Each row: [filterType, ...bytes], passes in order.
  const raw = Buffer.concat(rows.map((row) => Buffer.from(row)));

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 1x8 grayscale: passes 2, 4 and 6 are empty. Pass 1 holds row 0, pass 3
// row 4, pass 5 rows 2 and 6, pass 7 rows 1, 3, 5 and 7.
const narrow = () =>
  makeInterlacedPng({
    width: 1,
    height: 8,
    rows: [
      [0, 10],
      [0, 14],
      [0, 12],
      [0, 16],
      [0, 11],
      [0, 13],
      [0, 15],
      [0, 17],
    ],
  });

const pixels = [10, 11, 12, 13, 14, 15, 16, 17];

describe.each([
  ['node', PNGNode],
  ['browser module', PNGBrowser],
  ['standalone browser', PNG],
])('%s interlaced image with empty passes', (_, Ctor) => {
  test('decodePixels', async () => {
    const data = await new Ctor(narrow()).decodePixels();
    expect(Array.from(data)).toEqual(pixels);
  });

  test('decode', async () => {
    const data = await new Ctor(narrow()).decode();
    expect(Array.from(data)).toEqual(pixels.flatMap((v) => [v, v, v, 255]));
  });
});

describe.each([
  ['node', PNGNode],
  ['browser module', PNGBrowser],
])('%s decodePixelsSync with empty passes', (_, Ctor) => {
  test('decodePixelsSync', () => {
    const data = new Ctor(narrow()).decodePixelsSync();
    expect(Array.from(data)).toEqual(pixels);
  });
});
