const fs = require('fs');
const PNGNode = require('../lib/png-js.cjs')

const files = fs.readdirSync('test/images');

function getImgData(Ctor, fileName, wrap) {
  const image = new Ctor(fs.readFileSync(`test/images/${fileName}`));
  const imgData = image.imgData;
  return wrap && !Buffer.isBuffer(imgData) ? Buffer.from(imgData) : imgData;
}

describe('imgData', () => {
  describe('node', () => {
    test.each(files)('%s', fileName => {
      expect(getImgData(PNGNode, fileName, true)).toMatchSnapshot();
    });
  });

  describe('browser', () => {
    test.each(files)('%s', fileName => {
      expect(getImgData(PNG, fileName)).toMatchSnapshot();
    });
  });
});
