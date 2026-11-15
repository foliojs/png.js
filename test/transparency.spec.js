import fs from 'fs';
import PNGNode from '../lib/png-js.cjs';
import PNGBrowser from '../lib/png-js.browser.js';

describe.each([
  ['node', PNGNode],
  ['browser module', PNGBrowser],
  ['standalone browser', PNG],
])('%s tRNS color key', (_, Ctor) => {
  test.each([
    ['transparent-black-grayscale-4bit.png', { grayscale: 15 }],
    ['transparent-white-grayscale-16bit.png', { grayscale: 65535 }],
    ['transparent-white-rgb-16bit.png', { rgb: [65535, 65535, 65535] }],
  ])('%s', (fileName, expected) => {
    const image = new Ctor(fs.readFileSync(`test/images/${fileName}`));
    expect(image.transparency).toEqual(expected);
  });
});
