const fs = require('fs');
const { default: PNGNode } = require('../lib/png-js.cjs')

const files = fs.readdirSync('test/images');

function getImgData(Ctor, fileName) {
  const image = new Ctor(fs.readFileSync(`test/images/${fileName}`));
  return image.imgData;
}

describe('imgData', () => {
  describe('node', () => {
    test.each(files)('%s', fileName => {
      expect(getImgData(PNGNode, fileName)).toMatchSnapshot();
    });
  });

  describe('browser', () => {
    test.each(files)('%s', fileName => {
      expect(getImgData(PNG, fileName)).toMatchSnapshot();
    });
  });
});
