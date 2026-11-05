import fs from 'fs';
import os from 'os';
import path from 'path';
import { deflateSync } from 'zlib';
import PNGNode from '../lib/png-js.cjs';
import PNGBrowser from '../lib/png-js.browser.cjs';

function makePng(compressed, { width = 1, height = 1 } = {}) {
  const chunk = (type, data) => {
    // The decoder does not validate CRCs.
    const buffer = Buffer.alloc(data.length + 12);
    buffer.writeUInt32BE(data.length, 0);
    buffer.write(type, 4, 'ascii');
    data.copy(buffer, 8);
    return buffer;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2; // RGB, without alpha.

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const compressedPixels = deflateSync(Buffer.from([0, 12, 34, 56]));
const valid = makePng(compressedPixels);
const oversized = makePng(compressedPixels, {
  width: 0x7fffffff,
  height: 0x7fffffff,
});
const corrupt = makePng(Buffer.from([0, 0, 0, 0]));
const invalidFilter = makePng(deflateSync(Buffer.from([5, 12, 34, 56])));
const failures = [
  ['corrupt', corrupt, /./],
  ['invalid-filter', invalidFilter, /Invalid filter algorithm: 5/],
];
let directory;
const filePath = (name) => path.join(directory, `${name}.png`);

beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'png-js-decode-'));
  for (const [name, buffer] of [
    ['valid', valid],
    ['oversized', oversized],
    ['signature', Buffer.from('not a PNG')],
    ['truncated', valid.subarray(0, valid.length - 1)],
    ...failures,
  ]) {
    fs.writeFileSync(filePath(name), buffer);
  }
});

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('PNG.decode', () => {
  test('resolves to RGBA pixels', async () => {
    const result = PNGNode.decode(filePath('valid'));
    expect(result).toBeInstanceOf(Promise);
    const pixels = await result;
    expect(pixels).toBeInstanceOf(Uint8Array);
    expect(Array.from(pixels)).toEqual([12, 34, 56, 255]);
  });

  test('rejects with the filesystem error for a missing file', async () => {
    const missing = filePath('missing');
    await expect(PNGNode.decode(missing)).rejects.toMatchObject({
      code: 'ENOENT',
      path: missing,
    });
  });

  test('rejects allocation errors', async () => {
    await expect(PNGNode.decode(filePath('oversized'))).rejects.toMatchObject({
      name: 'RangeError',
    });
  });

  test.each([
    ['signature', /Invalid PNG signature/],
    ['truncated', /Incomplete or corrupt PNG file/],
    ...failures.map(([name, , message]) => [name, message]),
  ])('rejects errors for %s data', async (name, message) => {
    await expect(PNGNode.decode(filePath(name))).rejects.toThrow(message);
  });

  test('rejects when called in the packaged browser build', async () => {
    await expect(PNGBrowser.decode('image.png')).rejects.toThrow(
      'PNG.decode not available in browser build',
    );
  });
});

describe.each([
  ['node', PNGNode],
  ['packaged browser', PNGBrowser],
])('%s instance decoding', (_name, Ctor) => {
  describe.each(['decode', 'decodePixels'])('%s', (method) => {
    test('resolves to unchanged pixels', async () => {
      const png = new Ctor(valid);
      const result = png[method]();
      expect(result).toBeInstanceOf(Promise);
      const pixels = await result;
      expect(pixels).toBeInstanceOf(Uint8Array);
      expect(Array.from(pixels)).toEqual(
        method === 'decode' ? [12, 34, 56, 255] : [12, 34, 56],
      );
    });

    test.each(failures)(
      'rejects errors for %s data',
      async (_name, data, message) => {
        const png = new Ctor(data);
        await expect(png[method]()).rejects.toThrow(message);
      },
    );

    test('rejects allocation errors', async () => {
      const png = new Ctor(oversized);
      await expect(png[method]()).rejects.toMatchObject({ name: 'RangeError' });
    });

    test('supports repeated and concurrent decoding', async () => {
      const png = new Ctor(valid);
      const expected = method === 'decode' ? [12, 34, 56, 255] : [12, 34, 56];
      const results = await Promise.all([png[method](), png[method]()]);
      results.push(await png[method]());
      for (const pixels of results)
        expect(Array.from(pixels)).toEqual(expected);
    });

    test('propagates errors thrown by Promise consumers', async () => {
      const error = new Error('consumer failed');
      await expect(
        new Ctor(valid)[method]().then(() => {
          throw error;
        }),
      ).rejects.toBe(error);
    });
  });

  test('rejects conversion errors', async () => {
    const png = new Ctor(valid);
    const error = new Error('conversion failed');
    png.copyToImageData = () => {
      throw error;
    };
    await expect(png.decode()).rejects.toBe(error);
  });

  test('rejects setup errors', async () => {
    const png = new Ctor(valid);
    png.imgData = null;
    await expect(png.decodePixels()).rejects.toThrow();
  });
});
