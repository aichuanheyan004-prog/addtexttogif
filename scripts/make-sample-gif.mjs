import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as gifenc from "gifenc";

const gifencApi = resolveGifenc(gifenc);
const { GIFEncoder, applyPalette, quantize } = gifencApi;

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "../public/sample-orbit.gif");
const width = 360;
const height = 210;
const frameCount = 24;
const encoder = GIFEncoder();

for (let frame = 0; frame < frameCount; frame += 1) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  fillBackground(rgba, frame);
  drawGrid(rgba);
  drawCircle(rgba, 85, 105, 38, [15, 118, 110, 255]);
  drawCircle(rgba, 260, 104, 42, [220, 38, 38, 255]);
  drawOrbit(rgba, frame);
  drawBars(rgba, frame);
  const palette = quantize(rgba, 256);
  const indexed = applyPalette(rgba, palette);
  encoder.writeFrame(indexed, width, height, {
    palette,
    delay: 80,
    repeat: frame === 0 ? 0 : undefined,
    dispose: 2
  });
}

encoder.finish();
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, encoder.bytes());
console.log(`Wrote ${outPath}`);

function fillBackground(rgba, frame) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const stripe = Math.sin((x + frame * 7) / 24) * 8;
      rgba[i] = 244 + stripe;
      rgba[i + 1] = 247 + y / 80;
      rgba[i + 2] = 251;
      rgba[i + 3] = 255;
    }
  }
}

function drawGrid(rgba) {
  for (let y = 20; y < height; y += 34) {
    drawRect(rgba, 0, y, width, 1, [217, 224, 234, 255]);
  }
  for (let x = 20; x < width; x += 42) {
    drawRect(rgba, x, 0, 1, height, [229, 235, 242, 255]);
  }
}

function drawOrbit(rgba, frame) {
  const angle = (frame / frameCount) * Math.PI * 2;
  const cx = 175;
  const cy = 105;
  const rx = 118;
  const ry = 56;
  for (let dot = 0; dot < 9; dot += 1) {
    const dotAngle = angle + (dot / 9) * Math.PI * 2;
    const x = cx + Math.cos(dotAngle) * rx;
    const y = cy + Math.sin(dotAngle) * ry;
    const shade = 255 - dot * 18;
    drawCircle(rgba, x, y, 8 - dot * 0.35, [37, 99, 235, shade * 0.6, 255]);
  }
  drawCircle(rgba, cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry, 12, [180, 83, 9, 255]);
}

function drawBars(rgba, frame) {
  const baseX = 42;
  for (let i = 0; i < 5; i += 1) {
    const value = 18 + Math.round(Math.sin((frame + i * 2) / 4) * 10 + i * 5);
    drawRect(rgba, baseX + i * 14, height - 24 - value, 8, value, [23, 32, 51, 220]);
  }
}

function drawRect(rgba, x, y, w, h, color) {
  const left = Math.max(0, Math.round(x));
  const top = Math.max(0, Math.round(y));
  const right = Math.min(width, Math.round(x + w));
  const bottom = Math.min(height, Math.round(y + h));
  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      const i = (py * width + px) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = color[3];
    }
  }
}

function drawCircle(rgba, cx, cy, radius, color) {
  const left = Math.floor(cx - radius);
  const right = Math.ceil(cx + radius);
  const top = Math.floor(cy - radius);
  const bottom = Math.ceil(cy + radius);
  const r2 = radius * radius;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        drawRect(rgba, x, y, 1, 1, color);
      }
    }
  }
}

function resolveGifenc(value) {
  const seen = new Set();
  let current = value;
  for (let index = 0; index < 8; index += 1) {
    if (current && typeof current.GIFEncoder === "function") return current;
    if (!current || seen.has(current)) break;
    seen.add(current);
    current = current.default ?? current["module.exports"];
  }
  throw new Error("Could not resolve gifenc API");
}
