# png.js

A PNG decoder in JS for the canvas element or Node.js.

## Browser Usage

Include png.js and zlib.js on your HTML page, create a canvas element, and call
`PNG.load` to load and render an image. It returns a Promise resolving to the
PNG instance after rendering; omit the canvas to load without rendering.

    <canvas></canvas>
    <script src="zlib.js"></script>
    <script src="png.js"></script>
    <script type="module">
        try {
            const canvas = document.getElementsByTagName('canvas')[0];
            const png = await window.PNG.load('some.png', canvas);
            console.log('Loaded PNG:', png.width, png.height);
        } catch (err) {
            console.error('Could not load PNG:', err);
        }
    </script>

The standalone browser version resides in `png.js`, exposes `window.PNG`, and
also supports loading and displaying animated PNGs. Its `PNG.load` rejects on non-2xx HTTP responses,
network errors, aborted requests, and parsing or rendering errors. Serve the
page over HTTP; local-file requests with status 0 are rejected.

## Node.js Usage

Install the module using npm

    sudo npm install png-js

Import the module and decode a PNG. Run this example as an ES module, for
example in an `.mjs` file or in a package with `"type": "module"`.

    import PNG from 'png-js';

    try {
        const pixels = await PNG.decode('some.png');
        // pixels is a 1d Uint8Array in RGBA order
    } catch (err) {
        console.error('Could not decode PNG:', err);
    }

The packaged asynchronous methods `PNG.decode(path)`, `png.decode()`, and
`png.decodePixels()` return Promises. The first two resolve to RGBA pixel
data as a `Uint8Array`; `decodePixels()` resolves to raw pixel data before
RGBA conversion. They reject on errors, including file-read failures such as
`ENOENT`, invalid PNG data, and decompression failures. The packaged browser
build supports instance decoding but rejects `PNG.decode(path)`.

You can also call `PNG.load` if you want to load the PNG (but not decode the pixels) synchronously. If you already
have the PNG data in a buffer, simply use `new PNG(buffer)`. In both of these cases, you need to call `png.decode`
yourself and await the decoded RGBA pixels. This synchronous Node.js
`PNG.load` is distinct from the standalone browser's asynchronous `PNG.load`.
If you already have a buffer you want the pixels copied to, call
`copyToImageData` with your buffer and the raw pixels resolved by
`decodePixels()`.

For synchronous pixel decoding, call `decodePixelsSync` on a PNG instance. It returns a `Uint8Array` containing the
decoded pixel data before conversion to RGBA.

    var png = new PNG(buffer);
    var pixels = png.decodePixelsSync();

## Performance

Decoding runs in a fixed number of passes with no per-byte allocation: the
compressed `IDAT` stream is concatenated exactly once, inflated without an
extra input copy on Node (the browser build makes one copy because fflate's
async `unzlib` detaches its input), and unfiltered scanline by scanline —
interlaced (Adam7) images reuse a two-scanline ring buffer instead of
per-pass scratch allocations.

See [`bench/README.md`](bench/README.md) for the benchmark suite and how to
compare two checkouts with the same harness.
