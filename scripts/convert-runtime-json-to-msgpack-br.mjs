#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { encode } from "@msgpack/msgpack";

const root = process.argv[2];
if (!root) {
  console.error("usage: node scripts/convert-runtime-json-to-msgpack-br.mjs <runtime-root>");
  process.exit(2);
}

let converted = 0;
let jsonBytes = 0;
let msgpackBrotliBytes = 0;

for (const filePath of walk(root)) {
  if (!filePath.endsWith(".json.gz")) {
    continue;
  }
  const jsonPath = filePath.slice(0, -".gz".length);
  const outputPath = `${jsonPath.slice(0, -".json".length)}.msgpack.br`;
  const json = zlib.gunzipSync(fs.readFileSync(filePath));
  const value = JSON.parse(json.toString("utf8"));
  const packed = encode(value);
  const compressed = zlib.brotliCompressSync(packed, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
    },
  });
  fs.writeFileSync(outputPath, compressed);
  converted += 1;
  jsonBytes += fs.statSync(filePath).size;
  msgpackBrotliBytes += compressed.byteLength;
}

console.log(JSON.stringify({
  root,
  converted,
  jsonGzipBytes: jsonBytes,
  messagePackBrotliBytes: msgpackBrotliBytes,
  ratio: jsonBytes === 0 ? null : msgpackBrotliBytes / jsonBytes,
}, null, 2));

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(filePath);
    } else if (entry.isFile()) {
      yield filePath;
    }
  }
}
