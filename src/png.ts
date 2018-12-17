import pako from 'pako';

export type ColorSpace = 'DeviceGray' | 'DeviceRGB';

export default class PNG {
  static load = (data: Uint8Array) => new PNG(data);

  palette: number[];
  imgData: Uint8Array;
  transparency: {
    indexed?: number[];
    grayscale?: number;
    rgb?: number[];
  };
  text: { [key: string]: string };
  width: number;
  height: number;
  bits: number;
  colorType: number;
  compressionMethod: number;
  filterMethod: number;
  interlaceMethod: number;
  colors: 1 | 3;
  hasAlphaChannel: boolean;
  pixelBitlength: number;
  colorSpace: ColorSpace;

  private data: Uint8Array;
  private pos: number;

  constructor(data: Uint8Array) {
    this.data = data;
    this.pos = 8; // Skip the default header;

    this.palette = [];
    const imgDataBuff = [];
    this.transparency = {};
    this.text = {};

    while (true) {
      const chunkSize = this.readUInt32();

      let section = '';
      for (let i = 0; i < 4; i++) {
        section += String.fromCharCode(this.data[this.pos++]);
      }

      switch (section) {
        case 'IHDR': {
          // We can grab interesting values from here (like width, height, etc...)
          this.width = this.readUInt32();
          this.height = this.readUInt32();
          this.bits = this.data[this.pos++];
          this.colorType = this.data[this.pos++];
          this.compressionMethod = this.data[this.pos++];
          this.filterMethod = this.data[this.pos++];
          this.interlaceMethod = this.data[this.pos++];
          break;
        }

        case 'PLTE': {
          this.palette = this.read(chunkSize);
          break;
        }

        case 'IDAT': {
          for (let i = 0; i < chunkSize; i++) {
            imgDataBuff.push(this.data[this.pos++]);
          }
          break;
        }

        case 'tRNS': {
          // This chunk can only occur once and it must occur after the
          // PLTE chunk and before the IDAT chunk.
          this.transparency = {};
          switch (this.colorType) {
            case 3: {
              // Indexed color, RGB. Each byte in this chunk is an alpha for the
              // palette index in the PLTE ("palette") chunk up until the last
              // non-opaque entry. Set up an array, stretching over all palette
              // entries which will be 0 (opaque) or 1 (transparent).
              this.transparency.indexed = this.read(chunkSize);
              const short = 255 - this.transparency.indexed.length;
              if (short > 0) {
                for (let i = 0; i < 255; i++) {
                  this.transparency.indexed.push(255);
                }
              }
              break;
            }
            case 0: {
              // Greyscale. Corresponding to entries in the PLTE chunk.
              // Grey is two bytes, range 0 .. (2 ^ bit-depth) - 1
              this.transparency.grayscale = this.read(chunkSize)[0];
              break;
            }
            case 2: {
              // True color with proper alpha channel.
              this.transparency.rgb = this.read(chunkSize);
              break;
            }
          }
          break;
        }

        case 'tEXt': {
          const text = this.read(chunkSize);
          const index = text.indexOf(0);
          const key = String.fromCharCode(...text.slice(0, index));
          this.text[key] = String.fromCharCode(...text.slice(index + 1));
          break;
        }

        case 'IEND': {
          // We've got everything we need!
          const colorTypeMap: { [colorType: number]: 1 | 3 } = {
            0: 1,
            3: 1,
            4: 1,
            2: 3,
            6: 3,
          };
          this.colors = colorTypeMap[this.colorType];

          this.hasAlphaChannel = [4, 6].includes(this.colorType);
          const colors = this.colors + (this.hasAlphaChannel ? 1 : 0);
          this.pixelBitlength = this.bits * colors;
          this.colorSpace = {
            1: 'DeviceGray',
            3: 'DeviceRGB',
          }[this.colors] as ColorSpace;
          this.imgData = new Uint8Array(imgDataBuff);

          return;
        }

        default: {
          // Unknown (or unimportant) section, skip it
          this.pos += chunkSize;
        }
      }

      this.pos += 4; // Skip the CRC
      if (this.pos > this.data.length) {
        throw new Error('Incomplete or corrupt PNG file');
      }
    }
  }

  decode = () => {
    const retVal = new Uint8Array(this.width * this.height * 4);
    const pixels = this.decodePixels();
    this.copyImageDataToBuffer(retVal, pixels);
    return retVal;
  };

  copyImageDataToBuffer = (imageData: Uint8Array, pixels: Uint8Array): void => {
    let colors: 1 | 3 | 4 = this.colors;
    let palette;
    let alpha = this.hasAlphaChannel;

    if (this.palette.length) {
      palette = this.decodePalette();
      colors = 4;
      alpha = true;
    }

    const data = imageData;
    const length = data.length;
    const input = palette || pixels;

    let i = 0;
    let j = 0;

    if (colors === 1) {
      while (i < length) {
        let k = palette ? pixels[i / 4] * 4 : j;
        const v = input[k++];
        data[i++] = v;
        data[i++] = v;
        data[i++] = v;
        data[i++] = alpha ? input[k++] : 255;
        j = k;
      }
    } else {
      while (i < length) {
        let k = palette ? pixels[i / 4] * 4 : j;
        data[i++] = input[k++];
        data[i++] = input[k++];
        data[i++] = input[k++];
        data[i++] = alpha ? input[k++] : 255;
        j = k;
      }
    }
  };

  decodePixels = (): Uint8Array => {
    const data = pako.inflate(this.imgData);

    const pixelBytes = this.pixelBitlength / 8;
    const scanlineLength = pixelBytes * this.width;

    const pixels = new Uint8Array(scanlineLength * this.height);
    const length = data.length;
    let row = 0;
    let pos = 0;
    let c = 0;

    while (pos < length) {
      switch (data[pos++]) {
        // None
        case 0: {
          for (let i = 0; i < scanlineLength; i++) {
            pixels[c++] = data[pos++];
          }
          break;
        }

        // Sub
        case 1: {
          for (let i = 0; i < scanlineLength; i++) {
            const byte = data[pos++];
            const left = i < pixelBytes ? 0 : pixels[c - pixelBytes];
            pixels[c++] = (byte + left) % 256;
          }
          break;
        }

        // Up
        case 2: {
          for (let i = 0; i < scanlineLength; i++) {
            const byte = data[pos++];
            const col = (i - (i % pixelBytes)) / pixelBytes;
            const pixelsIdx =
              (row - 1) * scanlineLength + col * pixelBytes + (i % pixelBytes);
            const upper = row && pixels[pixelsIdx];
            pixels[c++] = (upper + byte) % 256;
          }
          break;
        }

        // Average
        case 3: {
          for (let i = 0; i < scanlineLength; i++) {
            const byte = data[pos++];
            const col = (i - (i % pixelBytes)) / pixelBytes;
            const left = i < pixelBytes ? 0 : pixels[c - pixelBytes];
            const pixelsIdx =
              (row - 1) * scanlineLength + col * pixelBytes + (i % pixelBytes);
            const upper = row && pixels[pixelsIdx];
            pixels[c++] = (byte + Math.floor((left + upper) / 2)) % 256;
          }
          break;
        }

        // Paeth
        case 4: {
          for (let i = 0; i < scanlineLength; i++) {
            const byte = data[pos++];
            const col = (i - (i % pixelBytes)) / pixelBytes;
            const left = i < pixelBytes ? 0 : pixels[c - pixelBytes];

            let upper;
            let upperLeft;

            if (row === 0) {
              upper = upperLeft = 0;
            } else {
              const upperIdx =
                (row - 1) * scanlineLength +
                col * pixelBytes +
                (i % pixelBytes);
              const upperLeftIdx =
                (row - 1) * scanlineLength +
                (col - 1) * pixelBytes +
                (i % pixelBytes);
              upper = pixels[upperIdx];
              upperLeft = col && pixels[upperLeftIdx];
            }

            const p = left + upper - upperLeft;
            const pa = Math.abs(p - left);
            const pb = Math.abs(p - upper);
            const pc = Math.abs(p - upperLeft);

            let paeth;
            if (pa <= pb && pa <= pc) {
              paeth = left;
            } else if (pb <= pc) {
              paeth = upper;
            } else {
              paeth = upperLeft;
            }

            pixels[c++] = (byte + paeth) % 256;
          }
          break;
        }

        default: {
          throw new Error(`Invalid filter algorithm: ${data[pos - 1]}`);
        }
      }
      row++;
    }

    return pixels;
  };

  private read = (numBytes: number): number[] => {
    const results = [];
    for (let i = 0; i < numBytes; i++) {
      results[i] = this.data[this.pos++];
    }
    return results;
  };

  private readUInt32 = (): number => {
    const b1 = this.data[this.pos++] << 24;
    const b2 = this.data[this.pos++] << 16;
    const b3 = this.data[this.pos++] << 8;
    const b4 = this.data[this.pos++];
    return b1 | b2 | b3 | b4;
  };

  private decodePalette = (): Uint8Array => {
    const palette = this.palette;
    const transparency = this.transparency.indexed || [];
    const retVal = new Uint8Array(transparency.length + palette.length);
    let pos = 0;
    let c = 0;

    for (let i = 0; i < palette.length; i++) {
      retVal[pos++] = palette[i];
      retVal[pos++] = palette[i + 1];
      retVal[pos++] = palette[i + 2];
      const temp = transparency[c++];
      retVal[pos++] = temp !== undefined ? temp : 255;
    }

    return retVal;
  };
}
