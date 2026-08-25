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

You can also call `PNG.load` if you want to load the PNG (but not decode the pixels) synchronously. If you already
have the PNG data in a buffer, simply use `new PNG(buffer)`. In both of these cases, you need to call `png.decode`
yourself which passes your callback the decoded pixels as a buffer. If you already have a buffer you want the pixels
copied to, call `copyToImageData` with your buffer and the decoded pixels as returned from `decodePixels`.

For synchronous pixel decoding, call `decodePixelsSync` on a PNG instance. It returns a `Uint8Array` containing the
decoded pixel data before conversion to RGBA.

    var png = new PNG(buffer);
    var pixels = png.decodePixelsSync();

Note: the source buffer is only needed during construction. After `new PNG(buffer)`
returns, the instance releases it (`png.data` is `null`) and retains only the
extracted chunk data, so holding a parsed instance does not pin the original file
in memory. Decoded pixels are intentionally not cached: each `decodePixels` call
re-inflates, so the largest buffer in the pipeline is never retained by the
instance.

## Performance

The decoder works in a fixed number of passes with no per-byte allocation:
compressed IDAT data is concatenated exactly once, inflation happens on the
raw stream without input copies (the browser build makes one explicit copy
because fflate's async `unzlib` detaches its input buffer), and unfiltering
runs scanline-by-scanline — interlaced (Adam7) images use a two-scanline
ring buffer instead of per-pass scratch allocations.

Measured with the in-repo suite (`yarn bench:fixtures && yarn bench && yarn
bench:mem`, Node 24, Apple Silicon) against the 2.0.0 decoder, which
accumulated IDAT byte-by-byte into a plain JS array and pinned the source
buffer on the instance. Both sides were measured with the same harness
(`PNG_LIB` pointed at a built 2.0.0 worktree for the baseline).

**2048×2048 RGBA, incompressible noise (16 MB file, filter None):**

| Metric                                  | 2.0.0  | Now    | Change |
| --------------------------------------- | ------ | ------ | ------ |
| Peak RSS, `new PNG(buffer)`             | 445 MB | 16 MB  | −96%   |
| Peak RSS, parse + `decodePixels`        | 498 MB | 58 MB  | −88%   |
| Retained after caller drops file buffer | 32 MB  | 16 MB  | −50%   |
| `new PNG(buffer)` (median)              | 114 ms | 1.1 ms | −99%   |
| `decodePixels` (median)                 | 32 ms  | 9.5 ms | −70%   |

**Same image, Adam7 interlaced:**

| Metric                           | 2.0.0  | Now    | Change |
| -------------------------------- | ------ | ------ | ------ |
| Peak RSS, `new PNG(buffer)`      | 445 MB | 16 MB  | −96%   |
| Peak RSS, parse + `decodePixels` | 498 MB | 76 MB  | −85%   |
| `new PNG(buffer)` (median)       | 127 ms | 1.4 ms | −99%   |
| `decodePixels` (median)          | 62 ms  | 21 ms  | −66%   |

**2048×2048 RGB gradient (12 MB raw, filters 1–4 cycling per row):**

| Metric                      | 2.0.0  | Now    | Change |
| --------------------------- | ------ | ------ | ------ |
| Peak RSS, `new PNG(buffer)` | 2.8 MB | 0.2 MB | −93%   |
| `decodePixels` (median)     | 54 ms  | 36 ms  | −33%   |

See `bench/README.md` for methodology and how to compare two checkouts with
the same harness.
