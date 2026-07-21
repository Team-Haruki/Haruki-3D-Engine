import { pathToFileURL } from "node:url";

const assetMaxAge = 2_592_000;

function contentType(headers) {
  return (headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
}

function hasAssetCache(headers) {
  const value = headers.get("cache-control") ?? "";
  const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(value)?.[1];
  return /(?:^|,)\s*public(?:\s*,|$)/i.test(value)
    && Number(maxAge) === assetMaxAge
    && !/(?:^|,)\s*immutable(?:\s*,|$)/i.test(value);
}

function hasRevalidation(headers) {
  const value = headers.get("cache-control") ?? "";
  return /(?:^|,)\s*(?:no-cache|no-store|must-revalidate|max-age=0)(?:\s*,|$)/i.test(value);
}

export function validateAssetHeaders(rawUrl, headers, webOrigin = null) {
  const url = new URL(rawUrl);
  const pathname = url.pathname.toLowerCase();
  const type = contentType(headers);
  const errors = [];
  let expectedType = null;
  let asset = true;

  if (pathname.endsWith(".msgpack.br")) expectedType = "application/msgpack";
  else if (pathname.endsWith(".ktx2")) expectedType = "image/ktx2";
  else if (pathname.endsWith(".wasm")) expectedType = "application/wasm";
  else if (pathname.endsWith(".js") || pathname.endsWith(".mjs")) {
    if (!new Set(["text/javascript", "application/javascript"]).has(type)) {
      errors.push(`expected JavaScript Content-Type, received ${type || "<missing>"}`);
    }
  } else if (pathname.endsWith(".html")) {
    expectedType = "text/html";
    asset = false;
  } else {
    errors.push("unsupported asset extension");
  }

  if (expectedType && type !== expectedType) {
    errors.push(`expected Content-Type ${expectedType}, received ${type || "<missing>"}`);
  }
  if (pathname.endsWith(".msgpack.br") && headers.has("content-encoding")) {
    errors.push("Content-Encoding must be absent for .msgpack.br");
  }
  if (asset && !hasAssetCache(headers)) {
    errors.push(`assets require public max-age=${assetMaxAge} without immutable`);
  }
  if (!asset && (hasAssetCache(headers) || !hasRevalidation(headers))) {
    errors.push("HTML must be revalidated instead of using the asset cache policy");
  }

  if (webOrigin && new URL(webOrigin).origin !== url.origin) {
    const expectedOrigin = new URL(webOrigin).origin;
    const allowOrigin = headers.get("access-control-allow-origin");
    if (allowOrigin !== "*" && allowOrigin !== expectedOrigin) {
      errors.push(`cross-origin assets must allow ${expectedOrigin}`);
    }
    if (headers.has("x-haruki-file-version")) {
      const exposed = (headers.get("access-control-expose-headers") ?? "")
        .split(",")
        .map(value => value.trim().toLowerCase());
      if (!exposed.includes("x-haruki-file-version") && !exposed.includes("*")) {
        errors.push("X-Haruki-File-Version must be exposed to the web origin");
      }
    }
  }
  return errors;
}

async function main(args) {
  let webOrigin = null;
  const urls = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--origin") {
      webOrigin = args[index + 1] ?? null;
      index += 1;
    } else {
      urls.push(args[index]);
    }
  }
  if (urls.length === 0) {
    throw new Error("usage: check-web-asset-headers [--origin WEB_ORIGIN] URL...");
  }

  let failed = false;
  for (const url of urls) {
    const response = await fetch(url, { redirect: "follow" });
    const errors = response.ok
      ? validateAssetHeaders(response.url, response.headers, webOrigin)
      : [`HTTP ${response.status}`];
    await response.body?.cancel();
    if (errors.length === 0) {
      console.log(`ok ${url}`);
    } else {
      failed = true;
      console.error(`fail ${url}: ${errors.join("; ")}`);
    }
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
