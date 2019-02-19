/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
 * MIT LICENSE
 * Copyright (c) 2011 Devon Govett
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this 
 * software and associated documentation files (the "Software"), to deal in the Software 
 * without restriction, including without limitation the rights to use, copy, modify, merge, 
 * publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons 
 * to whom the Software is furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all copies or 
 * substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING 
 * BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND 
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, 
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, 
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

var PNG = (function() {
  let APNG_DISPOSE_OP_NONE = undefined;
  let APNG_DISPOSE_OP_BACKGROUND = undefined;
  let APNG_DISPOSE_OP_PREVIOUS = undefined;
  let APNG_BLEND_OP_SOURCE = undefined;
  let APNG_BLEND_OP_OVER = undefined;
  let scratchCanvas = undefined;
  let scratchCtx = undefined;
  let makeImage = undefined;
  PNG = class PNG {
      static initClass() {
          
          APNG_DISPOSE_OP_NONE = 0;
          APNG_DISPOSE_OP_BACKGROUND = 1;
          APNG_DISPOSE_OP_PREVIOUS = 2;
          APNG_BLEND_OP_SOURCE = 0;
          APNG_BLEND_OP_OVER = 1;
          
          scratchCanvas = document.createElement('canvas');
          scratchCtx = scratchCanvas.getContext('2d');
          makeImage = function(imageData) {
              scratchCtx.width = imageData.width;
              scratchCtx.height = imageData.height;
              scratchCtx.clearRect(0, 0, imageData.width, imageData.height);
              scratchCtx.putImageData(imageData, 0, 0);
              
              const img = new Image;
              img.src = scratchCanvas.toDataURL();
              return img;
          };
      }
      static load(url, canvas, callback) {
          if (typeof canvas === 'function') { callback = canvas; }
  
          const xhr = new XMLHttpRequest;
          xhr.open("GET", url, true);
          xhr.responseType = "arraybuffer";
          xhr.onload = () => {
              const data = new Uint8Array(xhr.response || xhr.mozResponseArrayBuffer);
              const png = new PNG(data);
              if (typeof (canvas != null ? canvas.getContext : undefined) === 'function') { png.render(canvas); }
              return (typeof callback === 'function' ? callback(png) : undefined);
          };
          
          return xhr.send(null);
      }
  
      constructor(data1) {
          let i;
          this.data = data1;
          this.pos = 8;  // Skip the default header
      
          this.palette = [];
          this.imgData = [];
          this.transparency = {};
          this.animation = null;
          this.text = {};
          let frame = null;
      
          while (true) {
              var data;
              var asc, end;
              let chunkSize = this.readUInt32();
              const section = ((() => {
                  const result = [];
                  for (i = 0; i < 4; i++) {
                      result.push(String.fromCharCode(this.data[this.pos++]));
                  }
                  return result;
              })()).join('');
          
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
                      break;
                  
                  case 'acTL':
                      // we have an animated PNG
                      this.animation = { 
                          numFrames: this.readUInt32(),
                          numPlays: this.readUInt32() || Infinity,
                          frames: []
                      };
                      break;
                  
                  case 'PLTE':
                      this.palette = this.read(chunkSize);
                      break;
                  
                  case 'fcTL':
                      if (frame) { this.animation.frames.push(frame); }
              
                      this.pos += 4; // skip sequence number
                      frame = { 
                          width: this.readUInt32(),
                          height: this.readUInt32(),
                          xOffset: this.readUInt32(),
                          yOffset: this.readUInt32()
                      };
                      
                      var delayNum = this.readUInt16();
                      var delayDen = this.readUInt16() || 100;
                      frame.delay = (1000 * delayNum) / delayDen;
                  
                      frame.disposeOp = this.data[this.pos++];
                      frame.blendOp = this.data[this.pos++];
                      frame.data = [];
                      break;
                  
                  case 'IDAT': case 'fdAT':
                      if (section === 'fdAT') {
                          this.pos += 4; // skip sequence number
                          chunkSize -= 4;
                      }
                  
                      data = (frame != null ? frame.data : undefined) || this.imgData;
                      for (i = 0, end = chunkSize, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                          data.push(this.data[this.pos++]);
                      }
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
                                  var asc1, end1;
                                  for (i = 0, end1 = short, asc1 = 0 <= end1; asc1 ? i < end1 : i > end1; asc1 ? i++ : i--) { this.transparency.indexed.push(255); }
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
                      var key = String.fromCharCode(...Array.from(text.slice(0, index) || []));
                      this.text[key] = String.fromCharCode(...Array.from(text.slice(index + 1) || []));
                      break;
                          
                  case 'IEND':
                      if (frame) { this.animation.frames.push(frame); }
              
                      // we've got everything we need!
                      this.colors = (() => { switch (this.colorType) {
                          case 0: case 3: case 4: return 1;
                          case 2: case 6: return 3;
                      } })();
                  
                      this.hasAlphaChannel = [4, 6].includes(this.colorType);
                      var colors = this.colors + (this.hasAlphaChannel ? 1 : 0);    
                      this.pixelBitlength = this.bits * colors;
                      
                      this.colorSpace = (() => { switch (this.colors) {
                          case 1: return 'DeviceGray';
                          case 3: return 'DeviceRGB';
                      } })();
                  
                      this.imgData = new Uint8Array(this.imgData);                        
                      return;
                      break;
                  
                  default:
                      // unknown (or unimportant) section, skip it
                      this.pos += chunkSize;
              }
                  
              this.pos += 4; // Skip the CRC
          
              if (this.pos > this.data.length) {
                  throw new Error("Incomplete or corrupt PNG file");
              }
          }
          
      }
      
      read(bytes) {
          return (__range__(0, bytes, false).map((i) => this.data[this.pos++]));
      }
  
      readUInt32() {
          const b1 = this.data[this.pos++] << 24;
          const b2 = this.data[this.pos++] << 16;
          const b3 = this.data[this.pos++] << 8;
          const b4 = this.data[this.pos++];
          return b1 | b2 | b3 | b4;
      }
      
      readUInt16() {
          const b1 = this.data[this.pos++] << 8;
          const b2 = this.data[this.pos++];
          return b1 | b2;
      }
      
      decodePixels(data) { 
          if (data == null) { data = this.imgData; }
          if (data.length === 0) { return new Uint8Array(0); }
      
          data = new FlateStream(data);
          data = data.getBytes();
          const pixelBytes = this.pixelBitlength / 8;
          const scanlineLength = pixelBytes * this.width;

          const pixels = new Uint8Array(scanlineLength * this.height);
          const { length } = data;
          let row = 0;
          let pos = 0;
          let c = 0;
      
          while (pos < length) {
              var byte, col, i, left, upper;
              var end;
              var end1;
              var end2;
              var end3;
              var end4;
              switch (data[pos++]) {
                  case 0: // None
                      for (i = 0, end = scanlineLength; i < end; i++) {
                          pixels[c++] = data[pos++];
                      }
                      break;

                  case 1: // Sub
                      for (i = 0, end1 = scanlineLength; i < end1; i++) {
                          byte = data[pos++];
                          left = i < pixelBytes ? 0 : pixels[c - pixelBytes];
                          pixels[c++] = (byte + left) % 256;
                      }
                      break;

                  case 2: // Up
                      for (i = 0, end2 = scanlineLength; i < end2; i++) {
                          byte = data[pos++];
                          col = (i - (i % pixelBytes)) / pixelBytes;
                          upper = row && pixels[((row - 1) * scanlineLength) + (col * pixelBytes) + (i % pixelBytes)];
                          pixels[c++] = (upper + byte) % 256;
                      }
                      break;

                  case 3: // Average
                      for (i = 0, end3 = scanlineLength; i < end3; i++) {
                          byte = data[pos++];
                          col = (i - (i % pixelBytes)) / pixelBytes;
                          left = i < pixelBytes ? 0 : pixels[c - pixelBytes];
                          upper = row && pixels[((row - 1) * scanlineLength) + (col * pixelBytes) + (i % pixelBytes)];
                          pixels[c++] = (byte + Math.floor((left + upper) / 2)) % 256;
                      }
                      break;

                  case 4: // Paeth
                      for (i = 0, end4 = scanlineLength; i < end4; i++) {
                          var paeth, upperLeft;
                          byte = data[pos++];
                          col = (i - (i % pixelBytes)) / pixelBytes;
                          left = i < pixelBytes ? 0 : pixels[c - pixelBytes];

                          if (row === 0) {
                              upper = (upperLeft = 0);
                          } else {
                              upper = pixels[((row - 1) * scanlineLength) + (col * pixelBytes) + (i % pixelBytes)];
                              upperLeft = col && pixels[((row - 1) * scanlineLength) + ((col - 1) * pixelBytes) + (i % pixelBytes)];
                          }

                          const p = (left + upper) - upperLeft;
                          const pa = Math.abs(p - left);
                          const pb = Math.abs(p - upper);
                          const pc = Math.abs(p - upperLeft);

                          if ((pa <= pb) && (pa <= pc)) {
                              paeth = left;
                          } else if (pb <= pc) {
                              paeth = upper;
                          } else {
                              paeth = upperLeft;
                          }

                          pixels[c++] = (byte + paeth) % 256;
                      }
                      break;

                  default:
                      throw new Error(`Invalid filter algorithm: ${data[pos - 1]}`); 
              }

              row++;
          }
          
          return pixels;
      }
      
      decodePalette() {
          const { palette } = this;
          const transparency = this.transparency.indexed || [];
          const ret = new Uint8Array((transparency.length || 0) + palette.length);
          let pos = 0;
          const { length } = palette;
          let c = 0;
      
          for (let i = 0, end = palette.length; i < end; i += 3) {
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
              palette = this._decodedPalette != null ? this._decodedPalette : (this._decodedPalette = this.decodePalette());
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
      
      decode() {
          const ret = new Uint8Array(this.width * this.height * 4);
          this.copyToImageData(ret, this.decodePixels());
          return ret;
      }
      
      decodeFrames(ctx) {
          if (!this.animation) { return; }
      
          return (() => {
              const result = [];
              for (let i = 0; i < this.animation.frames.length; i++) {
                  const frame = this.animation.frames[i];
                  const imageData = ctx.createImageData(frame.width, frame.height);
                  const pixels = this.decodePixels(new Uint8Array(frame.data));
          
                  this.copyToImageData(imageData, pixels);
                  frame.imageData = imageData;
                  result.push(frame.image = makeImage(imageData));
              }
              return result;
          })();
      }
      
      renderFrame(ctx, number) {
          const { frames } = this.animation;
          const frame = frames[number];
          const prev = frames[number - 1];
      
          // if we're on the first frame, clear the canvas
          if (number === 0) {
              ctx.clearRect(0, 0, this.width, this.height);
          }
      
          // check the previous frame's dispose operation
          if ((prev != null ? prev.disposeOp : undefined) === APNG_DISPOSE_OP_BACKGROUND) {
              ctx.clearRect(prev.xOffset, prev.yOffset, prev.width, prev.height);
          
          } else if ((prev != null ? prev.disposeOp : undefined) === APNG_DISPOSE_OP_PREVIOUS) {
              ctx.putImageData(prev.imageData, prev.xOffset, prev.yOffset);
          }
      
          // APNG_BLEND_OP_SOURCE overwrites the previous data
          if (frame.blendOp === APNG_BLEND_OP_SOURCE) {
              ctx.clearRect(frame.xOffset, frame.yOffset, frame.width, frame.height);
          }
      
          // draw the current frame
          return ctx.drawImage(frame.image, frame.xOffset, frame.yOffset);   
      }
      
      animate(ctx) {
          let doFrame;
          let frameNumber = 0;
          const {numFrames, frames, numPlays} = this.animation;
      
          return (doFrame = () => {
              const f = frameNumber++ % numFrames;
              const frame = frames[f];
              this.renderFrame(ctx, f);
          
              if ((numFrames > 1) && ((frameNumber / numFrames) < numPlays)) {
                  return this.animation._timeout = setTimeout(doFrame, frame.delay);
              }
          })();
      }
              
      stopAnimation() {
          return clearTimeout(this.animation != null ? this.animation._timeout : undefined);
      }
  
      render(canvas) {
          // if this canvas was displaying another image before,
          // stop the animation on it
          if (canvas._png) {
              canvas._png.stopAnimation();
          }
      
          canvas._png = this;
          canvas.width = this.width;
          canvas.height = this.height;
          const ctx = canvas.getContext("2d");
      
          if (this.animation) {
              this.decodeFrames(ctx);
              return this.animate(ctx);
      
          } else {
              const data = ctx.createImageData(this.width, this.height);
              this.copyToImageData(data, this.decodePixels());
              return ctx.putImageData(data, 0, 0);
          }
      }
  };
  PNG.initClass();
  return PNG;
})();

window.PNG = PNG;
function __range__(left, right, inclusive) {
let range = [];
let ascending = left < right;
let end = !inclusive ? right : ascending ? right + 1 : right - 1;
for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
  range.push(i);
}
return range;
}