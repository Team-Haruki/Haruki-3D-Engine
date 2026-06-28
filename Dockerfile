FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-noto-cjk ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
  CHROMIUM=chromium \
  HARUKI_RUNTIME_ROOT=/data/runtime \
  HARUKI_CAPTURE_OUTPUT_DIR=/data/captures \
  HARUKI_CAPTURE_SCALE=2 \
  PORT=8080

COPY --from=build /app/dist ./dist
COPY config ./config
COPY capture-server.mjs ./capture-server.mjs
COPY png-rgba.mjs ./png-rgba.mjs

EXPOSE 8080
CMD ["node", "capture-server.mjs"]
