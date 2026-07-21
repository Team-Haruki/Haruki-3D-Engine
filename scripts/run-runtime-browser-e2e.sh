#!/usr/bin/env bash
set -euo pipefail

runtime_root="${HARUKI_RUNTIME_E2E_ROOT:-}"
host_port="${HARUKI_RUNTIME_E2E_PORT:-60008}"
if [[ -z "$runtime_root" || ! -f "$runtime_root/jp/parts/part-registry.msgpack.br" ]]; then
  echo "HARUKI_RUNTIME_E2E_ROOT must point to a final multi-region Exporter output." >&2
  exit 2
fi

container="haruki-3d-web-e2e-$$"
captures="$(mktemp -d)"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$captures"
}
trap cleanup EXIT

npm run test:consumer
docker build -t haruki-3d-engine:web-e2e-local .
docker run -d --name "$container" \
  -p "127.0.0.1:${host_port}:8080" \
  -e HARUKI_RUNTIME_ROOT=/data/runtime \
  -e HARUKI_CAPTURE_OUTPUT_DIR=/data/captures \
  -v "$runtime_root:/data/runtime:ro" \
  -v "$captures:/data/captures" \
  haruki-3d-engine:web-e2e-local >/dev/null
docker cp dist-consumer/. "$container:/app/dist/consumer"

for _ in {1..30}; do
  if curl --fail --silent "http://127.0.0.1:${host_port}/healthz" >/dev/null; then
    break
  fi
  sleep 1
done
curl --fail --silent "http://127.0.0.1:${host_port}/healthz" >/dev/null

runner=()
if command -v xvfb-run >/dev/null 2>&1; then
  runner=(xvfb-run -a)
fi
HARUKI_RUNTIME_E2E_URL="http://127.0.0.1:${host_port}" \
  "${runner[@]}" npm run test:browser:runtime
