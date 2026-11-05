## png.js changelog

### [3.0.0] - 07-11-2026

#### Breaking changes

- Replace callbacks with Promises for packaged `PNG.decode(path)`, `png.decode()`, and `png.decodePixels()`. Await the result and handle errors with `try`/`catch`.
- Replace the standalone browser `PNG.load(url, canvas, callback)` callback with a Promise that resolves to the PNG instance. The packaged Node.js `PNG.load(path)` remains synchronous.
- Release the source buffer after parsing; `png.data` is now `null` on packaged PNG instances.
- Correct the package's Node.js engine declaration to `>=18`.

#### Added

- Add `png.decodePixelsSync()` for synchronous raw pixel decoding (#92).
- Add CPU and memory benchmarks (#99).

#### Fixed and improved

- Reject invalid PNG signatures, out-of-bounds chunks, and zero-dimension images in the packaged decoder (#100).
- Fix unfiltering of sub-byte images with non-byte-aligned scanlines (#102).
- Reduce decoding memory usage by concatenating IDAT data once and unfiltering scanlines in place (#101, #102).
- Propagate asynchronous read, decompression, and decoding errors through Promise rejections; standalone browser loading also rejects HTTP and network errors.
- Build package entry points during prepack so installations from Git work (#98).
- Declare the MIT license in package metadata (#94) and update dependencies.
- Migrate tests from Jest to Vitest (#97) and expand chunk decoding coverage (#107).

### [v2.0.0] - 14-04-2026

- Remove Buffer usage in favor of Uint8Array
- Replace browserify-zlib with fflate
- Add esm and cjs builds for node and browser (#81)

### [v1.0.0] - 17-11-2019

- Initial release of version 1.0.0
