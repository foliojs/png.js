import fs from 'fs';
import { inflate as nodeInflate, inflateSync as nodeInflateSync } from 'zlib';
import {
  unzlib as browserInflate,
  unzlibSync as browserInflateSync
} from 'fflate';

const inflate = BROWSER ? browserInflate : nodeInflate;
const inflateSync = BROWSER ? browserInflateSync : nodeInflateSync;

// Decodes an inflated PNG data stream into raw pixel bytes. Takes plain
// image metadata rather than the PNG instance so callers can hand over a
// lightweight object instead of pinning the decoder's whole state.
function decodePixelsData(meta, data) {
  const { width, height } = meta;
  const pixelBytes = meta.pixelBitlength / 8;

  const pixels = new Uint8Array(width * height * pixelBytes);
  const { length } = data;
  let pos = 0;

  function pass(x0, y0, dx, dy, singlePass = false) {
    const w = Math.ceil((width - x0) / dx);
    const h = Math.ceil((height - y0) / dy);
    const scanlineLength = pixelBytes * w;
    const buffer = singlePass ? pixels : new Uint8Array(scanlineLength * h);
    let row = 0;
    let c = 0;
    while (row < h && pos < length) {
      var byte, col, i, left, upper;
      switch (data[pos++]) {
        case 0: // None
          for (i = 0; i < scanlineLength; i++) {
            buffer[c++] = data[pos++];
          }
          break;

        case 1: // Sub
          for (i = 0; i < scanlineLength; i++) {
            byte = data[pos++];
            left = i < pixelBytes ? 0 : buffer[c - pixelBytes];
            buffer[c++] = (byte + left) % 256;
          }
          break;

        case 2: // Up
          for (i = 0; i < scanlineLength; i++) {
            byte = data[pos++];
            col = (i - (i % pixelBytes)) / pixelBytes;
            upper =
              row &&
              buffer[
                (row - 1) * scanlineLength + col * pixelBytes + (i % pixelBytes)
              ];
            buffer[c++] = (upper + byte) % 256;
          }
          break;

        case 3: // Average
          for (i = 0; i < scanlineLength; i++) {
            byte = data[pos++];
            col = (i - (i % pixelBytes)) / pixelBytes;
            left = i < pixelBytes ? 0 : buffer[c - pixelBytes];
            upper =
              row &&
              buffer[
                (row - 1) * scanlineLength + col * pixelBytes + (i % pixelBytes)
              ];
            buffer[c++] = (byte + Math.floor((left + upper) / 2)) % 256;
          }
          break;

        case 4: // Paeth
          for (i = 0; i < scanlineLength; i++) {
            var paeth, upperLeft;
            byte = data[pos++];
            col = (i - (i % pixelBytes)) / pixelBytes;
            left = i < pixelBytes ? 0 : buffer[c - pixelBytes];

            if (row === 0) {
              upper = upperLeft = 0;
            } else {
              upper =
                buffer[
                  (row - 1) * scanlineLength +
                    col * pixelBytes +
                    (i % pixelBytes)
                ];
              upperLeft =
                col &&
                buffer[
                  (row - 1) * scanlineLength +
                    (col - 1) * pixelBytes +
                    (i % pixelBytes)
                ];
            }

            const p = left + upper - upperLeft;
            const pa = Math.abs(p - left);
            const pb = Math.abs(p - upper);
            const pc = Math.abs(p - upperLeft);

            if (pa <= pb && pa <= pc) {
              paeth = left;
            } else if (pb <= pc) {
              paeth = upper;
            } else {
              paeth = upperLeft;
            }

            buffer[c++] = (byte + paeth) % 256;
          }
          break;

        default:
          throw new Error(`Invalid filter algorithm: ${data[pos - 1]}`);
      }

      if (!singlePass) {
        let pixelsPos = ((y0 + row * dy) * width + x0) * pixelBytes;
        let bufferPos = row * scanlineLength;
        for (i = 0; i < w; i++) {
          for (let j = 0; j < pixelBytes; j++)
            pixels[pixelsPos++] = buffer[bufferPos++];
          pixelsPos += (dx - 1) * pixelBytes;
        }
      }

      row++;
    }
  }

  if (meta.interlaceMethod === 1) {
    /*
      1 6 4 6 2 6 4 6
      7 7 7 7 7 7 7 7
      5 6 5 6 5 6 5 6
      7 7 7 7 7 7 7 7
      3 6 4 6 3 6 4 6
      7 7 7 7 7 7 7 7
      5 6 5 6 5 6 5 6
      7 7 7 7 7 7 7 7
    */
    pass(0, 0, 8, 8); // 1
    pass(4, 0, 8, 8); // 2
    pass(0, 4, 4, 8); // 3
    pass(2, 0, 4, 4); // 4
    pass(0, 2, 2, 4); // 5
    pass(1, 0, 2, 2); // 6
    pass(0, 1, 1, 2); // 7
  } else {
    pass(0, 0, 1, 1, true);
  }

  return pixels;
}

// Decodes a byte array as latin1 without spreading it all onto the stack
// (String.fromCharCode has an argument-count limit).
function latin1(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    result += String.fromCharCode.apply(String, bytes.slice(i, i + 0x8000));
  }
  return result;
}

class PNG {
  static decode(path, fn) {
    if (BROWSER) {
      throw new Error('PNG.decode not available in browser build');
    } else {
      return fs.readFile(path, function(err, file) {
        const png = new PNG(file);
        return png.decode(pixels => fn(pixels));
      });
    }
  }

  static load(path) {
    if (BROWSER) {
      throw new Error('PNG.load not available in browser build');
    } else {
      const file = fs.readFileSync(path);
      return new PNG(file);
    }
  }

  constructor(data) {
    let i;
    this.data = data;
    this.pos = 8; // Skip the default header

    this.palette = [];
    this.imgData = [];
    this.transparency = {};
    this.text = {};

    // IDAT payloads are collected as views into the source buffer and
    // concatenated exactly once at IEND, so the compressed stream is never
    // held in more than one copy.
    const idatChunks = [];
    let idatLength = 0;

    if (
      data.length < 8 ||
      data[0] !== 0x89 ||
      data[1] !== 0x50 ||
      data[2] !== 0x4e ||
      data[3] !== 0x47 ||
      data[4] !== 0x0d ||
      data[5] !== 0x0a ||
      data[6] !== 0x1a ||
      data[7] !== 0x0a
    ) {
      throw new Error('Invalid PNG signature');
    }

    while (true) {
      if (this.pos + 8 > this.data.length) {
        throw new Error('Incomplete or corrupt PNG file');
      }

      const chunkSize = this.readUInt32();
      let section = '';
      for (i = 0; i < 4; i++) {
        section += String.fromCharCode(this.data[this.pos++]);
      }

      // The chunk payload and its 4-byte CRC must fit in the remaining
      // data, otherwise a corrupt length would drive huge allocations or
      // out-of-bounds reads below.
      if (chunkSize > this.data.length - this.pos - 4) {
        throw new Error('Incomplete or corrupt PNG file');
      }

      switch (section) {
        case 'IHDR':
          // we can grab  interesting values from here (like width, height, etc)
          this.width = this.readUInt32();
          this.height = this.readUInt32();
          this.bits = this.data[this.pos++];
          this.colorType = this.data[this.pos++];
          this.compressionMethod = this.data[this.pos++];
          this.filterMethod = this.data[this.pos++];
          this.interlaceMethod = this.data[this.pos++];
          if (this.width === 0 || this.height === 0) {
            throw new Error(
              'Invalid PNG dimensions: width and height must be nonzero'
            );
          }
          break;

        case 'PLTE':
          this.palette = this.read(chunkSize);
          break;

        case 'IDAT':
          idatChunks.push(this.data.subarray(this.pos, this.pos + chunkSize));
          idatLength += chunkSize;
          this.pos += chunkSize;
          break;

        case 'tRNS':
          // This chunk can only occur once and it must occur after the
          // PLTE chunk and before the IDAT chunk.
          this.transparency = {};
          switch (this.colorType) {
            case 3:
              // Indexed color, RGB. Each byte in this chunk is an alpha for
              // the palette index in the PLTE ("palette") chunk up until the
              // last non-opaque entry. Set up an array, stretching over all
              // palette entries which will be 0 (opaque) or 1 (transparent).
              this.transparency.indexed = this.read(chunkSize);
              var short = 255 - this.transparency.indexed.length;
              if (short > 0) {
                for (i = 0; i < short; i++) {
                  this.transparency.indexed.push(255);
                }
              }
              break;
            case 0:
              // Greyscale. Corresponding to entries in the PLTE chunk.
              // Grey is two bytes, range 0 .. (2 ^ bit-depth) - 1
              this.transparency.grayscale = this.read(chunkSize)[0];
              break;
            case 2:
              // True color with proper alpha channel.
              this.transparency.rgb = this.read(chunkSize);
              break;
          }
          break;

        case 'tEXt':
          var text = this.read(chunkSize);
          var index = text.indexOf(0);
          var key = latin1(text.slice(0, index));
          this.text[key] = latin1(text.slice(index + 1));
          break;

        case 'IEND':
          // we've got everything we need!
          switch (this.colorType) {
            case 0:
            case 3:
            case 4:
              this.colors = 1;
              break;
            case 2:
            case 6:
              this.colors = 3;
              break;
          }

          this.hasAlphaChannel = [4, 6].includes(this.colorType);
          var colors = this.colors + (this.hasAlphaChannel ? 1 : 0);
          this.pixelBitlength = this.bits * colors;

          switch (this.colors) {
            case 1:
              this.colorSpace = 'DeviceGray';
              break;
            case 3:
              this.colorSpace = 'DeviceRGB';
              break;
          }

          this.imgData = new Uint8Array(idatLength);
          var offset = 0;
          for (i = 0; i < idatChunks.length; i++) {
            this.imgData.set(idatChunks[i], offset);
            offset += idatChunks[i].length;
          }

          // Everything kept past construction (imgData, palette,
          // transparency, text) is copied out of the source buffer, so
          // release it rather than pinning the whole file on the instance.
          this.data = null;
          return;
          break;

        default:
          // unknown (or unimportant) section, skip it
          this.pos += chunkSize;
      }

      this.pos += 4; // Skip the CRC
    }
  }

  read(bytes) {
    // Array.from copies, so the result never pins the source buffer.
    // These stay plain arrays: consumers index and push into them.
    const result = Array.from(this.data.subarray(this.pos, this.pos + bytes));
    this.pos += bytes;
    return result;
  }

  readUInt32() {
    const b1 = this.data[this.pos++] << 24;
    const b2 = this.data[this.pos++] << 16;
    const b3 = this.data[this.pos++] << 8;
    const b4 = this.data[this.pos++];
    return (b1 | b2 | b3 | b4) >>> 0;
  }

  decodePixels(fn) {
    // fflate's async unzlib transfers its input buffer to a worker,
    // detaching it, so the browser build must hand over a throwaway copy.
    // Node's zlib.inflate only reads the buffer.
    const input = BROWSER ? this.imgData.slice() : this.imgData;

    // The callback must reference only this plain metadata, never `this`, so
    // a caller that drops the instance doesn't keep it (and everything it
    // retains) alive through the async inflate.
    const meta = {
      width: this.width,
      height: this.height,
      interlaceMethod: this.interlaceMethod,
      pixelBitlength: this.pixelBitlength
    };

    return inflate(input, (err, data) => {
      if (err) {
        throw err;
      }

      return fn(decodePixelsData(meta, data));
    });
  }

  decodePixelsSync() {
    // Both sync inflaters only read their input, and `imgData` is already a
    // Uint8Array owned by this instance, so no defensive copy is needed.
    return decodePixelsData(this, inflateSync(this.imgData));
  }

  decodePalette() {
    const { palette } = this;
    const { length } = palette;
    const transparency = this.transparency.indexed || [];
    const ret = new Uint8Array(transparency.length + length);
    let pos = 0;
    let c = 0;

    for (let i = 0; i < length; i += 3) {
      var left;
      ret[pos++] = palette[i];
      ret[pos++] = palette[i + 1];
      ret[pos++] = palette[i + 2];
      ret[pos++] = (left = transparency[c++]) != null ? left : 255;
    }

    return ret;
  }

  copyToImageData(imageData, pixels) {
    let j, k;
    let { colors } = this;
    let palette = null;
    let alpha = this.hasAlphaChannel;

    if (this.palette.length) {
      palette =
        this._decodedPalette || (this._decodedPalette = this.decodePalette());
      colors = 4;
      alpha = true;
    }

    const data = imageData.data || imageData;
    const { length } = data;
    const input = palette || pixels;
    let i = (j = 0);

    if (colors === 1) {
      while (i < length) {
        k = palette ? pixels[i / 4] * 4 : j;
        const v = input[k++];
        data[i++] = v;
        data[i++] = v;
        data[i++] = v;
        data[i++] = alpha ? input[k++] : 255;
        j = k;
      }
    } else {
      while (i < length) {
        k = palette ? pixels[i / 4] * 4 : j;
        data[i++] = input[k++];
        data[i++] = input[k++];
        data[i++] = input[k++];
        data[i++] = alpha ? input[k++] : 255;
        j = k;
      }
    }
  }

  decode(fn) {
    const ret = new Uint8Array(this.width * this.height * 4);
    return this.decodePixels(pixels => {
      this.copyToImageData(ret, pixels);
      return fn(ret);
    });
  }
}

export default PNG;
