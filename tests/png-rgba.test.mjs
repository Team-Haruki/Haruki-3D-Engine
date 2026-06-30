import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";

import { ensurePngRgba } from "../png-rgba.mjs";

test("ensurePngRgba converts 8-bit RGB PNG screenshots to RGBA", () => {
  const rgbPng = createRgbPng(1, 1, [Buffer.from([0x12, 0x34, 0x56])], [0]);
  assert.equal(readPngColorType(rgbPng), 2);

  const rgbaPng = ensurePngRgba(rgbPng);

  assert.equal(readPngColorType(rgbaPng), 6);
  assert.deepEqual(readDecodedRgba(rgbaPng), Buffer.from([0x12, 0x34, 0x56, 0xff]));
});

test("ensurePngRgba unfilters screenshot scanlines before expanding alpha", () => {
  const rows = [
    Buffer.from([
      0x10, 0x20, 0x30,
      0x40, 0x50, 0x60,
      0x70, 0x80, 0x90,
    ]),
    Buffer.from([
      0x15, 0x25, 0x35,
      0x45, 0x55, 0x65,
      0x75, 0x85, 0x95,
    ]),
    Buffer.from([
      0x1a, 0x2a, 0x3a,
      0x4a, 0x5a, 0x6a,
      0x7a, 0x8a, 0x9a,
    ]),
    Buffer.from([
      0x1f, 0x2f, 0x3f,
      0x4f, 0x5f, 0x6f,
      0x7f, 0x8f, 0x9f,
    ]),
    Buffer.from([
      0x24, 0x34, 0x44,
      0x54, 0x64, 0x74,
      0x84, 0x94, 0xa4,
    ]),
  ];
  const rgbPng = createRgbPng(3, rows.length, rows, [0, 1, 2, 3, 4]);

  const rgbaPng = ensurePngRgba(rgbPng);
  const decoded = readDecodedRgba(rgbaPng);

  assert.equal(readPngColorType(rgbaPng), 6);
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      const rgbOffset = x * 3;
      const rgbaOffset = (y * 3 + x) * 4;
      assert.deepEqual(
        decoded.subarray(rgbaOffset, rgbaOffset + 4),
        Buffer.from([
          rows[y][rgbOffset],
          rows[y][rgbOffset + 1],
          rows[y][rgbOffset + 2],
          0xff,
        ]),
      );
    }
  }

  const inflated = readInflatedIdat(rgbaPng);
  for (let y = 0; y < rows.length; y += 1) {
    assert.equal(inflated[y * (1 + 3 * 4)], 0, "converted RGBA rows should be emitted with filter 0");
  }
});

function createRgbPng(width, height, rows, filters) {
  const signature = Buffer.from("89504e470d0a1a0a", "hex");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const filteredRows = rows.map((row, index) => Buffer.concat([
    Buffer.from([filters[index]]),
    filterScanline(row, rows[index - 1] ?? null, 3, filters[index]),
  ]));
  return Buffer.concat([
    signature,
    writeChunk("IHDR", ihdr),
    writeChunk("IDAT", zlib.deflateSync(Buffer.concat(filteredRows))),
    writeChunk("IEND", Buffer.alloc(0)),
  ]);
}

function readPngColorType(png) {
  return png[25];
}

function readInflatedIdat(png) {
  const chunks = readChunks(png);
  return zlib.inflateSync(Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data)));
}

function readDecodedRgba(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const inflated = readInflatedIdat(png);
  return unfilterScanlines(inflated, width, height, 4);
}

function filterScanline(row, previous, bytesPerPixel, filter) {
  const out = Buffer.alloc(row.length);
  for (let i = 0; i < row.length; i += 1) {
    const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
    const up = previous ? previous[i] : 0;
    const upLeft = previous && i >= bytesPerPixel ? previous[i - bytesPerPixel] : 0;
    switch (filter) {
      case 0:
        out[i] = row[i];
        break;
      case 1:
        out[i] = (row[i] - left) & 0xff;
        break;
      case 2:
        out[i] = (row[i] - up) & 0xff;
        break;
      case 3:
        out[i] = (row[i] - Math.floor((left + up) / 2)) & 0xff;
        break;
      case 4:
        out[i] = (row[i] - paeth(left, up, upLeft)) & 0xff;
        break;
      default:
        throw new Error(`Unsupported test PNG filter: ${filter}`);
    }
  }
  return out;
}

function unfilterScanlines(raw, width, height, bytesPerPixel) {
  const rowLength = width * bytesPerPixel;
  const decoded = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (1 + rowLength);
    const filter = raw[rawOffset];
    const rowOffset = y * rowLength;
    for (let i = 0; i < rowLength; i += 1) {
      const value = raw[rawOffset + 1 + i];
      const left = i >= bytesPerPixel ? decoded[rowOffset + i - bytesPerPixel] : 0;
      const up = y > 0 ? decoded[rowOffset - rowLength + i] : 0;
      const upLeft = y > 0 && i >= bytesPerPixel ? decoded[rowOffset - rowLength + i - bytesPerPixel] : 0;
      switch (filter) {
        case 0:
          decoded[rowOffset + i] = value;
          break;
        case 1:
          decoded[rowOffset + i] = (value + left) & 0xff;
          break;
        case 2:
          decoded[rowOffset + i] = (value + up) & 0xff;
          break;
        case 3:
          decoded[rowOffset + i] = (value + Math.floor((left + up) / 2)) & 0xff;
          break;
        case 4:
          decoded[rowOffset + i] = (value + paeth(left, up, upLeft)) & 0xff;
          break;
        default:
          throw new Error(`Unsupported decoded PNG filter: ${filter}`);
      }
    }
  }
  return decoded;
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) {
    return left;
  }
  if (pb <= pc) {
    return up;
  }
  return upLeft;
}

function writeChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function readChunks(png) {
  const chunks = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length;
  }
  return chunks;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
