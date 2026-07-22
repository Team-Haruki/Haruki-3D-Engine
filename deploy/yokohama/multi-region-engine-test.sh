#!/usr/bin/env bash
set -euo pipefail

image="${HARUKI_ENGINE_IMAGE:-haruki-3d-engine:multi-region-test}"
container="${HARUKI_ENGINE_CONTAINER:-haruki-3d-engine-multi-region-test}"
port="${HARUKI_ENGINE_PORT:-38189}"

jp_runtime="${HARUKI_ENGINE_JP_RUNTIME:-/data/xy/haruki-3d-updater-test/3d-output-48w-20260707-122027}"
cn_runtime="${HARUKI_ENGINE_CN_RUNTIME:-/data/xy/haruki-cn3d-test/data/3d-output}"
captures="${HARUKI_ENGINE_CAPTURE_DIR:-/tmp/haruki-multiregion-captures}"
empty_runtime="${HARUKI_ENGINE_EMPTY_RUNTIME:-/tmp/haruki-empty-runtime-root}"

for dir in "$jp_runtime" "$cn_runtime"; do
  if [[ ! -d "$dir" ]]; then
    echo "missing runtime directory: $dir" >&2
    exit 1
  fi
done

mkdir -p "$captures" "$empty_runtime"

docker build -t "$image" .

if docker ps -a --format '{{.Names}}' | grep -Fxq "$container"; then
  docker rm -f "$container" >/dev/null
fi

docker run -d --name "$container" \
  -p "127.0.0.1:${port}:8080" \
  -e HARUKI_RUNTIME_ROOT=/data/runtime \
  -e HARUKI_CAPTURE_RUNTIME_ROOT=/data/runtime \
  -e HARUKI_CAPTURE_OUTPUT_DIR=/data/captures \
  -e HARUKI_CAPTURE_WIDTH=1024 \
  -e HARUKI_CAPTURE_HEIGHT=1024 \
  -e HARUKI_CAPTURE_SCALE=2 \
  -e HARUKI_CAPTURE_TIMEOUT_MS=120000 \
  -e HARUKI_CAPTURE_CAMERA_PRESET=capture \
  -e HARUKI_CAPTURE_SPRING_RUNTIME_MODE=unity-prefab \
  -e HARUKI_CAPTURE_WARMUP_FRAMES=60 \
  -e HARUKI_CAPTURE_WARMUP_MODE=animation \
  -v "${empty_runtime}:/data/runtime" \
  -v "${jp_runtime}:/data/runtime/jp:ro" \
  -v "${cn_runtime}:/data/runtime/cn:ro" \
  -v "${captures}:/data/captures" \
  "$image"

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${port}/healthz" >/dev/null; then
    break
  fi
  sleep 1
done

curl -fsS "http://127.0.0.1:${port}/healthz"
echo
