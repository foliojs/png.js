const fs = require('fs');
const PNGNode = require('../lib/png-js.cjs');

const files = fs.readdirSync('test/images');

async function getPixels(Ctor, fileName) {
  const image = new Ctor(fs.readFileSync(`test/images/${fileName}`));
  return new Promise(resolve => {
    Ctor === PNGNode
      ? image.decodePixels(pixels => resolve(Buffer.isBuffer(pixels) ? pixels : Buffer.from(pixels)))
      : resolve(image.decodePixels());
  });
}

describe('pixels', () => {
  describe('node', () => {
    test.each(files)('%s', async fileName => {
      const pixels = await getPixels(PNGNode, fileName);
      expect(pixels).toMatchSnapshot();
    });
  });

  describe('browser', () => {
    test.each(files)('%s', async fileName => {
      const pixels = await getPixels(PNG, fileName);
      expect(pixels).toMatchSnapshot();
    });
  });
});
