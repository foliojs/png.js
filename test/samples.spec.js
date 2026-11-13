import fs from 'fs';
import PNGNode from '../lib/png-js.cjs';
import PNGBrowser from '../lib/png-js.browser.js';

describe.each([
  ['node', PNGNode],
  ['browser module', PNGBrowser],
  ['standalone browser', PNG],
])('%s 16-bit sample conversion', (_, Ctor) => {
  test.each([
    ['grayscale-16bit.png', [88, 88, 88, 255], [176, 176, 176, 255]],
    ['grayscale-alpha-16bit.png', [0, 0, 0, 132], [0, 0, 0, 247]],
    ['rgb-16bit.png', [189, 189, 0, 255], [123, 123, 8, 255]],
    ['rgb-alpha-16bit.png', [255, 255, 0, 132], [0, 0, 255, 247]],
    ['interlaced-rgb-16bit.png', [189, 189, 0, 255], [123, 123, 8, 255]],
  ])('%s', async (fileName, first, second) => {
    const image = new Ctor(fs.readFileSync(`test/images/${fileName}`));
    const rgba = await image.decode();
    for (const [x, y, expected] of [
      [8, 8, first],
      [16, 16, second],
    ]) {
      const offset = (y * image.width + x) * 4;
      expect(Array.from(rgba.slice(offset, offset + 4))).toEqual(expected);
    }
  });
});
