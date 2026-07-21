import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("dist-consumer");
const files = fs.readdirSync(path.join(root, "assets"));
const wasm = files.filter(name => name.startsWith("brotli_wasm_bg") && name.endsWith(".wasm"));
assert.equal(wasm.length, 1, "consumer build must emit exactly one Brotli WASM asset");
for (const name of ["basis_transcoder.js", "basis_transcoder.wasm"]) {
  assert.ok(fs.statSync(path.join(root, "basis", name)).size > 0, `consumer build is missing basis/${name}`);
}

for (const name of files.filter(name => name.endsWith(".js"))) {
  const source = fs.readFileSync(path.join(root, "assets", name), "utf8");
  assert.doesNotMatch(source, /["'`]\/assets\/brotli_wasm_bg/, `${name} contains a root-absolute WASM URL`);
  if (name.startsWith("runtimeDecodeWorker-")) {
    assert.doesNotMatch(source, /brotli_wasm_bg/, `${name} owns a stale build-time WASM URL`);
  }
}
