(function() {
  /*
  # MIT LICENSE
  # Copyright (c) 2011 Devon Govett
  # 
  # Permission is hereby granted, free of charge, to any person obtaining a copy of this 
  # software and associated documentation files (the "Software"), to deal in the Software 
  # without restriction, including without limitation the rights to use, copy, modify, merge, 
  # publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons 
  # to whom the Software is furnished to do so, subject to the following conditions:
  # 
  # The above copyright notice and this permission notice shall be included in all copies or 
  # substantial portions of the Software.
  # 
  # THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING 
  # BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND 
  # NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, 
  # DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, 
  # OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  */  var PNG;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };
  PNG = (function() {
    PNG.load = function(url, callback) {
      var xhr;
      xhr = new XMLHttpRequest;
      xhr.open("GET", url, true);
      xhr.responseType = "arraybuffer";
      xhr.onload = __bind(function() {
        var data;
        data = new Uint8Array(xhr.response || xhr.mozResponseArrayBuffer);
        return callback(new PNG(data));
      }, this);
      return xhr.send(null);
    };
    function PNG(data) {
      var chunkSize, colors, i, section, short, _ref;
      this.data = data;
      this.pos = 8;
      this.palette = [];
      this.imgData = [];
      this.transparency = {};
      while (true) {
        chunkSize = this.readUInt32();
        section = ((function() {
          var _results;
          _results = [];
          for (i = 0; i < 4; i++) {
            _results.push(String.fromCharCode(this.data[this.pos++]));
          }
          return _results;
        }).call(this)).join('');
        switch (section) {
          case 'IHDR':
            this.width = this.readUInt32();
            this.height = this.readUInt32();
            this.bits = this.data[this.pos++];
            this.colorType = this.data[this.pos++];
            this.compressionMethod = this.data[this.pos++];
            this.filterMethod = this.data[this.pos++];
            this.interlaceMethod = this.data[this.pos++];
            break;
          case 'PLTE':
            this.palette = this.read(chunkSize);
            break;
          case 'IDAT':
            for (i = 0; 0 <= chunkSize ? i < chunkSize : i > chunkSize; 0 <= chunkSize ? i++ : i--) {
              this.imgData.push(this.data[this.pos++]);
            }
            break;
          case 'tRNS':
            this.transparency = {};
            switch (this.colorType) {
              case 3:
                this.transparency.indexed = this.read(chunkSize);
                short = 255 - this.transparency.indexed.length;
                if (short > 0) {
                  for (i = 0; 0 <= short ? i < short : i > short; 0 <= short ? i++ : i--) {
                    this.transparency.indexed.push(255);
                  }
                }
                break;
              case 0:
                this.transparency.grayscale = this.read(chunkSize)[0];
                break;
              case 2:
                this.transparency.rgb = this.read(chunkSize);
            }
            break;
          case 'IEND':
            this.colors = (function() {
              switch (this.colorType) {
                case 0:
                case 3:
                case 4:
                  return 1;
                case 2:
                case 6:
                  return 3;
              }
            }).call(this);
            this.hasAlphaChannel = (_ref = this.colorType) === 4 || _ref === 6;
            colors = this.colors + (this.hasAlphaChannel ? 1 : 0);
            this.pixelBitlength = this.bits * colors;
            this.colorSpace = (function() {
              switch (this.colors) {
                case 1:
                  return 'DeviceGray';
                case 3:
                  return 'DeviceRGB';
              }
            }).call(this);
            this.imgData = new Uint8Array(this.imgData);
            return;
          default:
            this.pos += chunkSize;
        }
        this.pos += 4;
      }
      return;
    }
    PNG.prototype.read = function(bytes) {
      var i, _results;
      _results = [];
      for (i = 0; 0 <= bytes ? i < bytes : i > bytes; 0 <= bytes ? i++ : i--) {
        _results.push(this.data[this.pos++]);
      }
      return _results;
    };
    PNG.prototype.readUInt32 = function() {
      var b1, b2, b3, b4;
      b1 = this.data[this.pos++] << 24;
      b2 = this.data[this.pos++] << 16;
      b3 = this.data[this.pos++] << 8;
      b4 = this.data[this.pos++];
      return b1 | b2 | b3 | b4;
    };
    PNG.prototype.getPixelData = function() {
      var byte, col, data, filter, i, left, length, p, pa, paeth, pb, pc, pixelBytes, pixels, pos, row, rowData, s, scanlineLength, upper, upperLeft, _ref, _step;
      data = new FlateStream(this.imgData);
      data = data.getBytes();
      pixelBytes = this.pixelBitlength / 8;
      scanlineLength = pixelBytes * this.width;
      row = 0;
      pixels = [];
      length = data.length;
      pos = 0;
      while (pos < length) {
        filter = data[pos++];
        i = 0;
        rowData = [];
        switch (filter) {
          case 0:
            while (i < scanlineLength) {
              rowData[i++] = data[pos++];
            }
            break;
          case 1:
            while (i < scanlineLength) {
              byte = data[pos++];
              left = i < pixelBytes ? 0 : rowData[i - pixelBytes];
              rowData[i++] = (byte + left) % 256;
            }
            break;
          case 2:
            while (i < scanlineLength) {
              byte = data[pos++];
              col = (i - (i % pixelBytes)) / pixelBytes;
              upper = row === 0 ? 0 : pixels[row - 1][col][i % pixelBytes];
              rowData[i++] = (upper + byte) % 256;
            }
            break;
          case 3:
            while (i < scanlineLength) {
              byte = data[pos++];
              col = (i - (i % pixelBytes)) / pixelBytes;
              left = i < pixelBytes ? 0 : rowData[i - pixelBytes];
              upper = row === 0 ? 0 : pixels[row - 1][col][i % pixelBytes];
              rowData[i++] = (byte + Math.floor((left + upper) / 2)) % 256;
            }
            break;
          case 4:
            while (i < scanlineLength) {
              byte = data[pos++];
              col = (i - (i % pixelBytes)) / pixelBytes;
              left = i < pixelBytes ? 0 : rowData[i - pixelBytes];
              if (row === 0) {
                upper = upperLeft = 0;
              } else {
                upper = pixels[row - 1][col][i % pixelBytes];
                upperLeft = col === 0 ? 0 : pixels[row - 1][col - 1][i % pixelBytes];
              }
              p = left + upper - upperLeft;
              pa = Math.abs(p - left);
              pb = Math.abs(p - upper);
              pc = Math.abs(p - upperLeft);
              if (pa <= pb && pa <= pc) {
                paeth = left;
              } else if (pb <= pc) {
                paeth = upper;
              } else {
                paeth = upperLeft;
              }
              rowData[i++] = (byte + paeth) % 256;
            }
            break;
          default:
            throw new Error("Invalid filter algorithm: " + filter);
        }
        s = [];
        for (i = 0, _ref = rowData.length, _step = pixelBytes; 0 <= _ref ? i < _ref : i > _ref; i += _step) {
          s.push(rowData.slice(i, i + pixelBytes));
        }
        pixels.push(s);
        row += 1;
      }
      return pixels;
    };
    PNG.prototype.copyToImageData = function(imageData) {
      var alpha, byte, colors, data, i, pixel, pixels, row, v, _i, _j, _k, _len, _len2, _len3;
      pixels = this.getPixelData();
      colors = this.colors;
      alpha = this.hasAlphaChannel;
      data = imageData.data;
      i = 0;
      for (_i = 0, _len = pixels.length; _i < _len; _i++) {
        row = pixels[_i];
        for (_j = 0, _len2 = row.length; _j < _len2; _j++) {
          pixel = row[_j];
          if (colors === 1) {
            v = pixel[0];
            data[i++] = v;
            data[i++] = v;
            data[i++] = v;
            data[i++] = pixel[1] || 255;
          } else {
            for (_k = 0, _len3 = pixel.length; _k < _len3; _k++) {
              byte = pixel[_k];
              data[i++] = byte;
            }
            if (!alpha) {
              data[i++] = 255;
            }
          }
        }
      }
    };
    return PNG;
  })();
  window.PNG = PNG;
}).call(this);
