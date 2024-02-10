const fs = require('fs');
const { default: PNGNode } = require('../lib/png-js.cjs');

const files = fs.readdirSync('test/images');

function getMetaData(Ctor, fileName) {
  const image = new Ctor(fs.readFileSync(`test/images/${fileName}`));
  const { imgData, data, ...metadata } = image;
  return metadata;
}

describe('metadata', () => {
  describe('node', () => {
    test.each(files)('%s', fileName => {
      expect(getMetaData(PNGNode, fileName)).toMatchSnapshot();
    });
  });

  describe('browser', () => {
    test.each(files)('%s', fileName => {
      expect(getMetaData(PNG, fileName)).toMatchSnapshot();
    });
  });
});
