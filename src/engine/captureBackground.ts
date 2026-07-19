import * as THREE from "three";

export function createCaptureBackgroundTexture(width: number, height: number) {
  const canvas = drawCaptureTriangleBackground(width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function drawCaptureTriangleBackground(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  const primary = context.createLinearGradient(0, height, width, 0);
  primary.addColorStop(0, "#f9fffe");
  primary.addColorStop(0.52, "#edfaff");
  primary.addColorStop(1, "#fff8fe");
  context.fillStyle = primary;
  context.fillRect(0, 0, width, height);

  const overlay = context.createLinearGradient(0, 0, width, height);
  overlay.addColorStop(0, "rgba(255, 246, 252, 0.34)");
  overlay.addColorStop(1, "rgba(219, 246, 255, 0.40)");
  context.fillStyle = overlay;
  context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(255, 255, 255, 0.48)";
  context.fillRect(0, 0, width, height);

  const random = makeSeededRandom(width * 73856093 ^ height * 19349663);
  const colors = [
    [166, 236, 255],
    [214, 206, 255],
    [255, 204, 238],
    [255, 237, 182],
  ] as const;
  const aspect = width / Math.max(height, 1);
  const wideShift = Math.min(0.12, Math.max(0, (aspect - 1) * 0.08));

  const drawTriangle = (
    x: number,
    y: number,
    rotation: number,
    size: number,
    color: readonly number[],
    alpha: number
  ) => {
    context.save();
    context.translate(x, y);
    context.rotate(rotation);
    context.beginPath();
    for (let index = 0; index < 3; index += 1) {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / 3;
      const px = Math.cos(angle) * size * 0.56;
      const py = Math.sin(angle) * size * 0.56;
      if (index === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    }
    context.closePath();
    context.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
    context.fill();
    context.restore();
  };

  const drawRandomTriangles = (count: number, baseSize: number) => {
    for (let index = 0; index < count; index += 1) {
      const edgeRoll = random();
      let x: number;
      let y: number;
      if (edgeRoll < 0.78) {
        const edge = random();
        if (edge < 0.26) {
          x = (-0.04 + random() * 0.22) * width;
          y = random() * height;
        } else if (edge < 0.50) {
          x = (0.82 - wideShift + random() * (0.21 + wideShift)) * width;
          y = random() * height;
        } else if (edge < 0.78) {
          x = random() * width;
          y = (-0.04 + random() * (0.24 + wideShift * 0.5)) * height;
        } else {
          x = random() * width;
          y = (0.80 - wideShift * 0.8 + random() * (0.23 + wideShift * 0.8)) * height;
        }
      } else {
        x = (0.12 + random() * 0.76) * width;
        y = (0.12 + random() * 0.76) * height;
      }
      const dx = (x - width * 0.5) / width * 2;
      const dy = (y - height * 0.5) / height * 2;
      const edgeDistance = Math.max(0.28, dx * dx + dy * dy);
      const size = baseSize * (0.72 + random() * 0.46) * edgeDistance;
      const alpha = (0.08 + random() * 0.13) * Math.min(1.25, edgeDistance + 0.25);
      drawTriangle(
        x,
        y,
        random() * Math.PI * 2,
        size,
        colors[Math.floor(random() * colors.length)],
        alpha
      );
    }
  };

  const scale = Math.min(width, height) / 1000;
  drawRandomTriangles(Math.max(8, Math.round(18 * scale)), 150 * scale);
  drawRandomTriangles(Math.max(24, Math.round(80 * scale)), 72 * scale);
  return canvas;
}
