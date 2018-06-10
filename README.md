**NOTE:** All credit for this code belongs to the developers of https://github.com/devongovett/png.js
# Purpose of this Fork
This fork was created for use in https://github.com/Hopding/pdf-lib.

**Update 6/10/2018:** The static `PNG.decode` and `PNG.load` methods have been removed from the `PNG` class in the `png-node.coffee` (and thus `png-node.js`) file. This allows all references to the `fs` module to be removed from those files. This was done to prevent packaging errors when using the module in a React Native app.

The original repository offered a `decode` method and a `decodePixels` method on `PNG` objects. Both of these methods were asynchronous (when using the package installed via `npm`), and they passed their results to a callback function. This was necessary because the original repository used Node's `zlib` module for decoding the PNG data, which is inherently asynchronous. However, this asynchronous behavior is not always desirable. For example, in the case of [`pdf-lib`](https://github.com/Hopding/pdf-lib) all aspects of the API are synchronous. So the PNG image embedding feature (which makes use of `png.js`) was forced to be asynchronous, and it stuck out like a sore thumb.

This fork preserves both the `decode` and `decodePixels` methods, but adds two new ones: `decodeSync` and `decodePixelsSync`. These methods work just like the original ones, except they behave in a synchronous fashion. This is made possible by using the [`pako`](https://github.com/nodeca/pako) library to decode PNG data instead of Node's `zlib` module.

## Example of `PNG.decodePixelsSync`
```javascript
const PNG = require('png-js');
const pngImg = new PNG(/* Buffer object containing PNG image */);
const pixels = pngImg.decodePixelsSync(); // pixels is a 1d array (in rgba order) of decoded pixel data
```

# png.js
A PNG decoder in JS for the canvas element or Node.js.

## Browser Usage
Simply include png.js and zlib.js on your HTML page, create a canvas element, and call PNG.load to load an image.

    <canvas></canvas>
    <script src="zlib.js"></script>
    <script src="png.js"></script>
    <script>
        var canvas = document.getElementsByTagName('canvas')[0];
        PNG.load('some.png', canvas);
    </script>

The source code for the browser version resides in `png.js` and also supports loading and displaying animated PNGs.

## Node.js Usage
Install the module using npm

    sudo npm install png-js

Require the module and decode a PNG

    var PNG = require('png-js');
    PNG.decode('some.png', function(pixels) {
        // pixels is a 1d array (in rgba order) of decoded pixel data
    });

You can also call `PNG.load` if you want to load the PNG (but not decode the pixels) synchronously.  If you already
have the PNG data in a buffer, simply use `new PNG(buffer)`.  In both of these cases, you need to call `png.decode`
yourself which passes your callback the decoded pixels as a buffer.  If you already have a buffer you want the pixels
copied to, call `copyToImageData` with your buffer and the decoded pixels as returned from `decodePixels`.
