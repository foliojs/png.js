###
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
###

class PNG
    @load: (url, callback) ->
        xhr = new XMLHttpRequest
        xhr.open("GET", url, true)
        xhr.responseType = "arraybuffer"
        xhr.onload = =>
            data = new Uint8Array(xhr.response or xhr.mozResponseArrayBuffer)
            callback new PNG(data)
            
        xhr.send(null)
    
    constructor: (@data) ->
        @pos = 8  # Skip the default header
        
        @palette = []
        @imgData = []
        @transparency = {}
        
        loop
            chunkSize = @readUInt32()
            section = (String.fromCharCode @data[@pos++] for i in [0...4]).join('')
            
            switch section
                when 'IHDR'
                    # we can grab  interesting values from here (like width, height, etc)
                    @width = @readUInt32()
                    @height = @readUInt32()
                    @bits = @data[@pos++]
                    @colorType = @data[@pos++]
                    @compressionMethod = @data[@pos++]
                    @filterMethod = @data[@pos++]
                    @interlaceMethod = @data[@pos++]
                    
                when 'PLTE'
                    @palette = @read(chunkSize)
                    
                when 'IDAT'
                    for i in [0...chunkSize]
                        @imgData.push @data[@pos++]
                        
                when 'tRNS'
                    # This chunk can only occur once and it must occur after the
                    # PLTE chunk and before the IDAT chunk.
                    @transparency = {}
                    switch @colorType
                        when 3
                            # Indexed color, RGB. Each byte in this chunk is an alpha for
                            # the palette index in the PLTE ("palette") chunk up until the
                            # last non-opaque entry. Set up an array, stretching over all
                            # palette entries which will be 0 (opaque) or 1 (transparent).
                            @transparency.indexed = @read(chunkSize)
                            short = 255 - @transparency.indexed.length
                            if short > 0
                                @transparency.indexed.push 255 for i in [0...short]
                        when 0
                            # Greyscale. Corresponding to entries in the PLTE chunk.
                            # Grey is two bytes, range 0 .. (2 ^ bit-depth) - 1
                            @transparency.grayscale = @read(chunkSize)[0]
                        when 2
                            # True color with proper alpha channel.
                            @transparency.rgb = @read(chunkSize)
                            
                when 'IEND'
                    # we've got everything we need!
                    @colors = switch @colorType
                        when 0, 3, 4 then 1
                        when 2, 6 then 3
                    
                    @hasAlphaChannel = @colorType in [4, 6]
                    colors = @colors + if @hasAlphaChannel then 1 else 0    
                    @pixelBitlength = @bits * colors
                        
                    @colorSpace = switch @colors
                        when 1 then 'DeviceGray'
                        when 3 then 'DeviceRGB'
                    
                    @imgData = new Uint8Array @imgData
                    return
                    
                else
                    # unknown (or unimportant) section, skip it
                    @pos += chunkSize
                    
            @pos += 4 # Skip the CRC
            
        return
        
    read: (bytes) ->
        (@data[@pos++] for i in [0...bytes])
    
    readUInt32: ->
        b1 = @data[@pos++] << 24
        b2 = @data[@pos++] << 16
        b3 = @data[@pos++] << 8
        b4 = @data[@pos++]
        b1 | b2 | b3 | b4
        
    decodePixels: ->        
        data = new FlateStream @imgData
        data = data.getBytes()
        pixelBytes = @pixelBitlength / 8
        scanlineLength = pixelBytes * @width

        row = 0
        pixels = []
        length = data.length
        pos = 0
        
        while pos < length
            filter = data[pos++]
            i = 0
            rowData = []

            switch filter
                when 0 # None
                    while i < scanlineLength
                        rowData[i++] = data[pos++]

                when 1 # Sub
                    while i < scanlineLength
                        byte = data[pos++]
                        left = if i < pixelBytes then 0 else rowData[i - pixelBytes]
                        rowData[i++] = (byte + left) % 256

                when 2 # Up
                    while i < scanlineLength
                        byte = data[pos++]
                        col = (i - (i % pixelBytes)) / pixelBytes
                        upper = if row is 0 then 0 else pixels[row - 1][col][i % pixelBytes]
                        rowData[i++] = (upper + byte) % 256

                when 3 # Average
                    while i < scanlineLength
                        byte = data[pos++]
                        col = (i - (i % pixelBytes)) / pixelBytes
                        left = if i < pixelBytes then 0 else rowData[i - pixelBytes]
                        upper = if row is 0 then 0 else pixels[row - 1][col][i % pixelBytes]
                        rowData[i++] = (byte + Math.floor((left + upper) / 2)) % 256

                when 4 # Paeth
                    while i < scanlineLength
                        byte = data[pos++]
                        col = (i - (i % pixelBytes)) / pixelBytes
                        left = if i < pixelBytes then 0 else rowData[i - pixelBytes]

                        if row is 0
                            upper = upperLeft = 0
                        else
                            upper = pixels[row - 1][col][i % pixelBytes]
                            upperLeft = if col is 0 then 0 else pixels[row - 1][col - 1][i % pixelBytes]

                        p = left + upper - upperLeft
                        pa = Math.abs(p - left)
                        pb = Math.abs(p - upper)
                        pc = Math.abs(p - upperLeft)

                        if pa <= pb and pa <= pc
                            paeth = left
                        else if pb <= pc
                            paeth = upper
                        else
                            paeth = upperLeft

                        rowData[i++] = (byte + paeth) % 256

                else
                    throw new Error "Invalid filter algorithm: " + filter 

            s = []
            for i in [0...rowData.length] by pixelBytes
                s.push rowData.slice(i, i + pixelBytes)

            pixels.push(s)
            row += 1
            
        return pixels
        
    decodePalette: ->
        palette = @palette
        transparency = @transparency.indexed ? []
        decodingMap = []
        index = 0
        
        for i in [0...palette.length] by 3
            alpha = transparency[index++] ? 255
            pixel = palette.slice(i, i + 3).concat(alpha)
            decodingMap.push pixel
            
        return decodingMap
        
    copyToImageData: (imageData) ->
        pixels = @decodePixels()
        colors = @colors
        palette = null
        alpha = @hasAlphaChannel
        
        if @palette.length
            palette = @decodePalette()
            colors = 4
            alpha = true
        
        data = imageData.data
        i = 0
        
        for row in pixels
            for pixel in row
                pixel = palette[pixel] if palette
                
                if colors is 1
                    v = pixel[0]
                    data[i++] = v
                    data[i++] = v
                    data[i++] = v
                    data[i++] = pixel[1] or 255
                else
                    data[i++] = byte for byte in pixel
                    data[i++] = 255 unless alpha
                
        return

window.PNG = PNG