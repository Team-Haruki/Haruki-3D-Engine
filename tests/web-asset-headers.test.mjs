import assert from "node:assert/strict";
import test from "node:test";

import { validateAssetHeaders } from "../scripts/check-web-asset-headers.mjs";

const immutable = "public, max-age=31536000, immutable";

test("versioned runtime headers satisfy the browser asset contract", () => {
  assert.deepEqual(validateAssetHeaders(
    "https://assets.example/6.6.0.30/jp/parts/part-runtime.msgpack.br",
    new Headers({
      "cache-control": immutable,
      "content-type": "application/msgpack",
      "x-haruki-file-version": "123-456",
      "access-control-allow-origin": "https://viewer.example",
      "access-control-expose-headers": "X-Haruki-File-Version",
    }),
    "https://viewer.example"
  ), []);
});

test("header validation rejects double Brotli decoding and stale MIME types", () => {
  assert.match(
    validateAssetHeaders(
      "https://assets.example/6.6.0.30/jp/parts/part-runtime.msgpack.br",
      new Headers({
        "cache-control": immutable,
        "content-type": "application/octet-stream",
        "content-encoding": "br",
      })
    ).join("\n"),
    /application\/msgpack.*Content-Encoding must be absent/s
  );
});

test("hashed engine files are immutable while HTML is revalidated", () => {
  assert.deepEqual(validateAssetHeaders(
    "https://viewer.example/assets/brotli_wasm_bg-NfWIZley.wasm",
    new Headers({
      "cache-control": immutable,
      "content-type": "application/wasm",
    })
  ), []);
  assert.deepEqual(validateAssetHeaders(
    "https://viewer.example/index.html",
    new Headers({
      "cache-control": "no-cache",
      "content-type": "text/html; charset=utf-8",
    })
  ), []);
  assert.match(
    validateAssetHeaders(
      "https://viewer.example/index.html",
      new Headers({
        "cache-control": immutable,
        "content-type": "text/html; charset=utf-8",
      })
    ).join("\n"),
    /HTML must be revalidated/
  );
});
