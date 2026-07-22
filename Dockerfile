FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim

ARG CHROMIUM_DEBIAN_VERSION=150.0.7871.100-1~deb12u1
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium=${CHROMIUM_DEBIAN_VERSION} \
    chromium-common=${CHROMIUM_DEBIAN_VERSION} \
    fonts-noto-cjk \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
  CHROMIUM=chromium \
  HARUKI_RUNTIME_ROOT=/data/runtime \
  HARUKI_CAPTURE_OUTPUT_DIR=/data/captures \
  HARUKI_CAPTURE_TEMP_TTL=6h \
  HARUKI_CAPTURE_GC_INTERVAL=1h \
  HARUKI_CAPTURE_IDLE_SHUTDOWN=1h \
  HARUKI_CAPTURE_WIDTH=1024 \
  HARUKI_CAPTURE_HEIGHT=1024 \
  HARUKI_CAPTURE_SCALE=2 \
  HARUKI_CAPTURE_WARMUP_FRAMES=60 \
  HARUKI_CAPTURE_WARMUP_MODE=animation \
  HARUKI_CAPTURE_SPRING_RUNTIME_MODE=unity-prefab \
  HARUKI_CAPTURE_CAMERA_PRESET=capture \
  PORT=8080

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY config ./config
COPY capture-server.mjs ./capture-server.mjs
COPY png-rgba.mjs ./png-rgba.mjs
COPY region-routing.mjs runtime-binary-codec.mjs ./
COPY THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md

EXPOSE 8080
CMD ["node", "capture-server.mjs"]
