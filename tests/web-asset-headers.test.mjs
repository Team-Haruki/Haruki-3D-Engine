import assert from "node:assert/strict";
import test from "node:test";

import { validateAssetHeaders } from "../scripts/check-web-asset-headers.mjs";

const oneMonth = "public, max-age=2592000";

test("stable runtime URLs use the one-month browser asset contract", () => {
  assert.deepEqual(validateAssetHeaders(
    "https://assets.example/jp/parts/part-runtime.msgpack.br",
    new Headers({
      "cache-control": oneMonth,
      "content-type": "application/msgpack",
      "x-haruki-file-version": "123-456",
      "access-control-allow-origin": "https://viewer.example",
      "access-control-expose-headers": "X-Haruki-File-Version",
    }),
    "https://viewer.example"
  ), []);

  assert.match(validateAssetHeaders(
    "https://assets.example/jp/parts/part-runtime.msgpack.br",
    new Headers({
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "application/msgpack",
    })
  ).join("\n"), /max-age=2592000 without immutable/);
});

test("header validation rejects double Brotli decoding and stale MIME types", () => {
  assert.match(
    validateAssetHeaders(
      "https://assets.example/jp/parts/part-runtime.msgpack.br",
      new Headers({
        "cache-control": oneMonth,
        "content-type": "application/octet-stream",
        "content-encoding": "br",
      })
    ).join("\n"),
    /application\/msgpack.*Content-Encoding must be absent/s
  );
});

test("engine files use the one-month policy while HTML is revalidated", () => {
  assert.deepEqual(validateAssetHeaders(
    "https://viewer.example/assets/brotli_wasm_bg-NfWIZley.wasm",
    new Headers({
      "cache-control": oneMonth,
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
        "cache-control": oneMonth,
        "content-type": "text/html; charset=utf-8",
      })
    ).join("\n"),
    /HTML must be revalidated/
  );
});
