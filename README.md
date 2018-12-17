# png-ts

<!-- NPM Version -->
<a href="https://www.npmjs.com/package/png-ts">
  <img
    src="https://img.shields.io/npm/v/png-ts.svg?style=flat-square"
    alt="NPM Version"
  />
</a>

<!-- Prettier Badge -->
<a href="https://prettier.io/">
  <img
    src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square"
    alt="Prettier Badge"
  />
</a>

> A PNG decoder written in TypeScript

This project is a fork of [`png.js`](https://github.com/devongovett/png.js) and was created for use in [`pdf-lib`](https://github.com/Hopding/pdf-lib). The original project is written in CoffeeScript. It contains a file for browser environments (`png.coffee`) and a different file for Node environments (`png-node.coffee`). This fork is a rewrite of the original project in TypeScript. All environment specific code has been removed or replaced with environment-independent code.

## Example of `PNG.decodePixels`
```javascript
// Import the PNG class
import PNG from 'png-ts';

// Create a PNG object
const pngImage = PNG.load(/* Uint8Array containing bytes of PNG image */);

// `pixels` is a 1D array (in rgba order) of decoded pixel data
const pixels = pngImage.decodePixels();
```

## Installation
### NPM Module
To install the latest stable version:
```bash
# With npm
npm install --save png-ts

# With yarn
yarn add png-ts
```
This assumes you're using [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/lang/en/) as your package manager.

### UMD Module
You can also download `png-ts` as a UMD module from [unpkg](https://unpkg.com/#/). The UMD builds have been compiled to ES5, so they should work [in any modern browser](https://caniuse.com/#feat=es5). UMD builds are useful if you aren't using a package manager or module bundler. For example, you can use them directly in the `<script>` tag of an HTML page.

The following builds are available:

* https://unpkg.com/png-ts/dist/png-ts.js
* https://unpkg.com/png-ts/dist/png-ts.min.js

When using a UMD build, you will have access to a global `window.PNG` variable. This variable contains the `PNG` class exported by `png-ts`. For example:

```javascript
// NPM module
import PNG from 'pdf-lib';
const pngImage = PNG.load(/* ... */)

// UMD module
var pngImage = window.PNG.load(/* ... */)
```

## TODO
- [ ] Document `PNG.decode()` and `PNG.copyImageDataToBuffer()` methods.
- [ ] See how much `pako` inflates the bundle size, replace if necessary
- [ ] Replace the switch statements with if-statements to improve readability
- [ ] Add unit tests

## Prior Art
* [`png-js`](https://github.com/devongovett/png.js) is a (animated) PNG decoder written in JavaScript for the HTML5 canvas element and Node.js (http://devongovett.github.io/png.js/).

## License
[MIT](https://choosealicense.com/licenses/mit/)
