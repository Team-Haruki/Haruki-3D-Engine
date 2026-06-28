import assert from "node:assert/strict";
import test from "node:test";
import zlib from "node:zlib";

import { ensurePngRgba } from "../png-rgba.mjs";

test("ensurePngRgba converts 8-bit RGB PNG screenshots to RGBA", () => {
  const rgbPng = createRgbPng(1, 1, Buffer.from([0x12, 0x34, 0x56]));
  assert.equal(readPngColorType(rgbPng), 2);

  const rgbaPng = ensurePngRgba(rgbPng);

  assert.equal(readPngColorType(rgbaPng), 6);
  assert.deepEqual(readInflatedIdat(rgbaPng), Buffer.from([0, 0x12, 0x34, 0x56, 0xff]));
});

function createRgbPng(width, height, rgb) {
  const signature = Buffer.from("89504e470d0a1a0a", "hex");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    signature,
    writeChunk("IHDR", ihdr),
    writeChunk("IDAT", zlib.deflateSync(Buffer.concat([Buffer.from([0]), rgb]))),
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
