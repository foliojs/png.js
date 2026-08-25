import fs from 'fs';
import PNGNode from '../lib/png-js.cjs';

// The legacy standalone bundle (global PNG) is not hardened; these tests
// cover the packaged decoder only.

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

describe('malformed input', () => {
  test('broken.png fixture', () => {
    const buffer = fs.readFileSync('images/broken.png');
    expect(() => new PNGNode(buffer)).toThrow('Incomplete or corrupt PNG file');
  });

  test('empty buffer', () => {
    expect(() => new PNGNode(Buffer.alloc(0))).toThrow('Invalid PNG signature');
  });

  test('signature only', () => {
    const buffer = validBuffer().subarray(0, 8);
    expect(() => new PNGNode(buffer)).toThrow('Incomplete or corrupt PNG file');
  });

  test('bad signature', () => {
    const buffer = validBuffer();
    buffer[0] = 0x00;
    expect(() => new PNGNode(buffer)).toThrow('Invalid PNG signature');
  });

  test('truncated mid-IDAT', () => {
    const buffer = validBuffer();
    const idat = findChunk(buffer, 'IDAT');
    expect(() => new PNGNode(buffer.subarray(0, idat + 12))).toThrow(
      'Incomplete or corrupt PNG file'
    );
  });

  test('chunk length larger than file', () => {
    const buffer = validBuffer();
    buffer.writeUInt32BE(0xffffffff, findChunk(buffer, 'IDAT'));
    expect(() => new PNGNode(buffer)).toThrow('Incomplete or corrupt PNG file');
  });

  test('zero dimensions', () => {
    const buffer = validBuffer();
    const ihdr = findChunk(buffer, 'IHDR');
    buffer.writeUInt32BE(0, ihdr + 8); // width field inside IHDR payload
    expect(() => new PNGNode(buffer)).toThrow('Invalid PNG dimensions');
  });

  test('valid file still parses', () => {
    const png = new PNGNode(validBuffer());
    expect(png.width).toBeGreaterThan(0);
    expect(png.height).toBeGreaterThan(0);
  });
});
