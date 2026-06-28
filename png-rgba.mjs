import zlib from "node:zlib";

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

export function ensurePngRgba(png) {
  if (!Buffer.isBuffer(png)) {
    throw new TypeError("png must be a Buffer.");
  }
  if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("Input is not a PNG file.");
  }

  const chunks = readChunks(png);
  const ihdr = chunks.find((chunk) => chunk.type === "IHDR");
  if (!ihdr || ihdr.data.length !== 13) {
    throw new Error("PNG is missing a valid IHDR chunk.");
  }

  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const compression = ihdr.data[10];
  const filter = ihdr.data[11];
  const interlace = ihdr.data[12];
  if (colorType === 6) {
    return png;
  }
  if (bitDepth !== 8 || colorType !== 2 || compression !== 0 || filter !== 0 || interlace !== 0) {
    throw new Error(`Unsupported PNG format for RGBA conversion: bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}.`);
  }

  const idatData = Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));
  const inflated = zlib.inflateSync(idatData);
  const rgbStride = 1 + width * 3;
  const rgbaStride = 1 + width * 4;
  const expectedLength = rgbStride * height;
  if (inflated.length !== expectedLength) {
    throw new Error(`Unexpected PNG scanline length: ${inflated.length}, expected ${expectedLength}.`);
  }

  const rgba = Buffer.alloc(rgbaStride * height);
  for (let row = 0; row < height; row += 1) {
    const sourceRow = row * rgbStride;
    const targetRow = row * rgbaStride;
    rgba[targetRow] = inflated[sourceRow];
    for (let x = 0; x < width; x += 1) {
      const source = sourceRow + 1 + x * 3;
      const target = targetRow + 1 + x * 4;
      rgba[target] = inflated[source];
      rgba[target + 1] = inflated[source + 1];
      rgba[target + 2] = inflated[source + 2];
      rgba[target + 3] = 0xff;
    }
  }

  const nextIhdr = Buffer.from(ihdr.data);
  nextIhdr[9] = 6;
  const nextChunks = chunks
    .filter((chunk) => chunk.type !== "IDAT")
    .map((chunk) => chunk.type === "IHDR"
      ? { type: chunk.type, data: nextIhdr }
      : chunk);
  const firstIdatIndex = nextChunks.findIndex((chunk) => chunk.type === "IEND");
  nextChunks.splice(firstIdatIndex, 0, {
    type: "IDAT",
    data: zlib.deflateSync(rgba),
  });

  return Buffer.concat([
    PNG_SIGNATURE,
    ...nextChunks.map((chunk) => writeChunk(chunk.type, chunk.data)),
  ]);
}

function readChunks(png) {
  const chunks = [];
  let offset = PNG_SIGNATURE.length;
  while (offset < png.length) {
    if (offset + 12 > png.length) {
      throw new Error("Invalid PNG chunk boundary.");
    }
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) {
      throw new Error(`Invalid PNG ${type} chunk length.`);
    }
    chunks.push({
      type,
      data: png.subarray(dataStart, dataEnd),
    });
    offset = dataEnd + 4;
    if (type === "IEND") {
      break;
    }
  }
  return chunks;
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
