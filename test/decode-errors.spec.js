import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import PNGNode from '../lib/png-js.cjs';
import PNGBrowser from '../lib/png-js.browser.cjs';

const validPath = 'test/images/rgb-8bit.png';
const valid = () => new PNGNode(fs.readFileSync(validPath));

const withCorruptStream = Ctor => {
  const png = new Ctor(fs.readFileSync(validPath));
  png.imgData = new Uint8Array(Buffer.from('not a zlib stream'));
  return png;
};

// Inflates fine, but every scanline starts with an unknown filter type.
const withInvalidFilter = () => {
  const png = valid();
  const size =
    png.height * (1 + Math.ceil((png.width * png.pixelBitlength) / 8));
  png.imgData = zlib.deflateSync(Buffer.alloc(size, 255));
  return png;
};

const decodeError = decode =>
  new Promise((resolve, reject) => {
    decode(() => reject(new Error('fn must not be called')), resolve);
  });

// Resolves with the next uncaught exception, standing in for the test runner's
// own listeners, which would fail the run.
const nextUncaught = () =>
  new Promise(resolve => {
    const listeners = process.listeners('uncaughtException');
    process.removeAllListeners('uncaughtException');
    process.once('uncaughtException', error => {
      listeners.forEach(listener => process.on('uncaughtException', listener));
      resolve(error);
    });
  });

describe('decoding errors', () => {
  test('decodePixels reports a corrupt zlib stream', async () => {
    const png = withCorruptStream(PNGNode);
    const error = await decodeError((fn, onError) =>
      png.decodePixels(fn, onError)
    );
    expect(error.message).toBe('incorrect header check');
  });

  test('decodePixels reports an invalid filter type', async () => {
    const png = withInvalidFilter();
    const error = await decodeError((fn, onError) =>
      png.decodePixels(fn, onError)
    );
    expect(error.message).toBe('Invalid filter algorithm: 255');
  });

  test('decode reports a corrupt zlib stream', async () => {
    const png = withCorruptStream(PNGNode);
    const error = await decodeError((fn, onError) => png.decode(fn, onError));
    expect(error.message).toBe('incorrect header check');
  });

  test('the browser build reports a corrupt zlib stream', async () => {
    const png = withCorruptStream(PNGBrowser);
    const error = await decodeError((fn, onError) =>
      png.decodePixels(fn, onError)
    );
    expect(error).toBeInstanceOf(Error);
  });

  test('PNG.decode reports a missing file', async () => {
    const error = await decodeError((fn, onError) =>
      PNGNode.decode('test/images/does-not-exist.png', fn, onError)
    );
    expect(error.code).toBe('ENOENT');
  });

  test('PNG.decode reports a file that is not a PNG', async () => {
    const error = await decodeError((fn, onError) =>
      PNGNode.decode('package.json', fn, onError)
    );
    expect(error.message).toBe('Invalid PNG signature');
  });

  test('PNG.decode reports corrupt image data', async () => {
    const buffer = fs.readFileSync(validPath);
    // the two bytes after the IDAT length and type are the zlib header
    const idat = buffer.indexOf('IDAT');
    buffer.fill(0xff, idat + 4, idat + 6);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'png-js-'));
    const file = path.join(dir, 'corrupt.png');
    fs.writeFileSync(file, buffer);

    const error = await decodeError((fn, onError) =>
      PNGNode.decode(file, fn, onError)
    );
    fs.rmSync(dir, { recursive: true });
    expect(error.message).toBe('incorrect header check');
  });

  test('without an error callback the error is still thrown', async () => {
    const uncaught = nextUncaught();
    withCorruptStream(PNGNode).decodePixels(() => {});
    expect((await uncaught).message).toBe('incorrect header check');
  });

  test('an error thrown by the callback is not reported as a decoding error', async () => {
    const uncaught = nextUncaught();
    let reported = false;
    valid().decodePixels(
      () => {
        throw new Error('from the callback');
      },
      () => {
        reported = true;
      }
    );
    expect((await uncaught).message).toBe('from the callback');
    expect(reported).toBe(false);
  });

  test('a valid image does not call the error callback', async () => {
    let reported = false;
    const pixels = await new Promise(resolve =>
      valid().decodePixels(resolve, () => {
        reported = true;
      })
    );
    expect(pixels.length).toBeGreaterThan(0);
    expect(reported).toBe(false);
  });
});
