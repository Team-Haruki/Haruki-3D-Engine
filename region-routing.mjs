import path from "node:path";

const regionPattern = /^[A-Za-z0-9_-]+$/;

export function resolveRegionRoute(pathname, runtimeRoot) {
  if (!pathname.startsWith("/regions/")) {
    return { region: null, pathname, runtimeRoot };
  }
  const match = pathname.match(/^\/regions\/([^/]+)(\/.*)$/);
  if (!match || match[2] === "/") {
    return null;
  }
  let region;
  try {
    region = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (region !== match[1] || !regionPattern.test(region)) {
    return null;
  }
  return {
    region,
    pathname: match[2],
    runtimeRoot: path.join(runtimeRoot, region),
  };
}

export function applyRouteRegion(body, region) {
  if (!region) {
    return body;
  }
  const requestedRegion = String(body.region ?? "").trim();
  if (requestedRegion && requestedRegion !== region) {
    throw new Error(`capture region ${requestedRegion} does not match route region ${region}`);
  }
  return { ...body, region };
}
