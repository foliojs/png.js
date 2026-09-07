import zlib from 'zlib';
import PNGNode from '../lib/png-js.cjs';

// Sub-byte bit depths (1/2/4-bit) pack multiple pixels per byte, so
// scanlines are byte-padded and filtering treats them as one byte per
// pixel (PNG spec 4.5.2 / 9.2). These tests pin the spec-correct
// behavior: byte-aligned output rows, integer neighbor offsets, and no
// crash on scanlines that are not a whole multiple of pixels.

function makePng({ width, height, bitDepth, rows }) {
  const signature = Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a
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
  ihdr[8] = bitDepth;
  ihdr[9] = 0; // grayscale

  // Each row: [filterType, ...packedBytes]
  const raw = Buffer.concat(rows.map(row => Buffer.from(row)));

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function decode(buffer) {
  return new Promise(resolve => new PNGNode(buffer).decodePixels(resolve));
}

describe('sub-byte bit depths', () => {
  test('1-bit rows pad to whole bytes (7px wide, filter None)', async () => {
    // One packed byte per row; bit 0 of the byte is padding.
    const rows = [[0, 0b10101010], [0, 0b01010100], [0, 0b11110000]];
    const pixels = await decode(
      makePng({ width: 7, height: 3, bitDepth: 1, rows })
    );
    expect(Array.from(pixels)).toEqual([0b10101010, 0b01010100, 0b11110000]);
  });

  test('non-aligned width does not crash on filter None', async () => {
    // 1x2 4-bit: half a byte of pixels per row, one padded byte stored.
    // The old decoder threw an uncatchable RangeError here.
    const rows = [[0, 0x70], [0, 0x30]];
    const pixels = await decode(
      makePng({ width: 1, height: 2, bitDepth: 4, rows })
    );
    expect(Array.from(pixels)).toEqual([0x70, 0x30]);
  });

  test('Sub filter uses a one-byte pixel offset', async () => {
    // 6px 4-bit = 3 packed bytes/row. Raw row [0x12, 0x34, 0x56]
    // Sub-filtered with bpp=1: [0x12, 0x34-0x12, 0x56-0x34].
    const rows = [[1, 0x12, 0x22, 0x22]];
    const pixels = await decode(
      makePng({ width: 6, height: 1, bitDepth: 4, rows })
    );
    expect(Array.from(pixels)).toEqual([0x12, 0x34, 0x56]);
  });

  test('Up filter reads the previous padded row', async () => {
    // 3px 4-bit = ceil(1.5) = 2 bytes/row.
    const rows = [
      [0, 0x10, 0x20],
      [2, 0x05, 0x05] // row1 = row0 + delta
    ];
    const pixels = await decode(
      makePng({ width: 3, height: 2, bitDepth: 4, rows })
    );
    expect(Array.from(pixels)).toEqual([0x10, 0x20, 0x15, 0x25]);
  });

  test('Average and Paeth filters decode without fractional offsets', async () => {
    // 3px 4-bit, rows: None, Average, Paeth.
    // row0 raw: [0x40, 0x60]
    // row1 raw: [0x42, 0x63] -> avg-filtered:
    //   b0: 0x42 - floor((0 + 0x40)/2)    = 0x42 - 0x20 = 0x22
    //   b1: 0x63 - floor((0x42 + 0x60)/2) = 0x63 - 0x51 = 0x12
    // row2 raw: [0x44, 0x66] -> paeth-filtered (predictor = nearest of
    //   left/up/upleft):
    //   b0: left=0, up=0x42, upleft=0     -> p=0x42, pred=up   -> 0x02
    //   b1: left=0x44, up=0x63, upleft=0x42 -> p=0x65, pred=up -> 0x03
    const rows = [[0, 0x40, 0x60], [3, 0x22, 0x12], [4, 0x02, 0x03]];
    const pixels = await decode(
      makePng({ width: 3, height: 3, bitDepth: 4, rows })
    );
    expect(Array.from(pixels)).toEqual([0x40, 0x60, 0x42, 0x63, 0x44, 0x66]);
  });
});
