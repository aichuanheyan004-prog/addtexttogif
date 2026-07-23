import * as gifenc from "gifenc";
import type { Palette } from "gifenc";
import { decompressFrames, parseGIF, type GifuctFrame } from "gifuct-js";

const gifencModule = gifenc as typeof gifenc & {
  default?: typeof gifenc;
  "module.exports"?: typeof gifenc;
};
const gifencApi = resolveGifencApi(gifencModule);
const { GIFEncoder, applyPalette, quantize } = gifencApi;

type GifencApi = {
  GIFEncoder: typeof gifenc.GIFEncoder;
  applyPalette: typeof gifenc.applyPalette;
  quantize: typeof gifenc.quantize;
};

export const GIF_LIMITS = {
  maxFileBytes: 12 * 1024 * 1024,
  maxFrames: 300,
  maxPixels: 1280 * 900,
  maxDurationMs: 60_000,
  maxSide: 1280
} as const;

export type TextAlign = "left" | "center" | "right";

export interface TextLayer {
  id: string;
  name: string;
  text: string;
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: "400" | "600" | "700" | "800";
  color: string;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  backgroundColor: string;
  backgroundOpacity: number;
  opacity: number;
  align: TextAlign;
  startFrame: number;
  endFrame: number;
}

export interface DecodedGifFrame {
  index: number;
  delayMs: number;
  disposalType: number;
  rgba: Uint8ClampedArray;
}

export interface DecodedGif {
  width: number;
  height: number;
  frames: DecodedGifFrame[];
  durationMs: number;
}

export interface TextBox {
  x: number;
  y: number;
  width: number;
  height: number;
  lineHeight: number;
  lines: string[];
}

export interface EncodeProgress {
  phase: "render" | "encode" | "finish";
  frameIndex: number;
  frameCount: number;
  progress: number;
  message: string;
}

export interface EncodeOptions {
  signal?: AbortSignal;
  onProgress?: (progress: EncodeProgress) => void;
  renderFrame: (
    baseFrame: Uint8ClampedArray,
    activeLayers: TextLayer[],
    frameIndex: number
  ) => Uint8ClampedArray;
}

export class GifToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GifToolError";
  }
}

const DEFAULT_FONT = "Impact, Arial Black, Arial, sans-serif";

export function createDefaultLayer(width: number, height: number, ordinal = 1): TextLayer {
  const fontSize = clampNumber(Math.round(Math.min(width, height) * 0.14), 18, 72);
  return {
    id: cryptoSafeId(),
    name: `Text layer ${ordinal}`,
    text: ordinal === 1 ? "Your text" : `Text ${ordinal}`,
    x: Math.round(width * 0.08),
    y: Math.round(height * 0.1),
    fontFamily: DEFAULT_FONT,
    fontSize,
    fontWeight: "800",
    color: "#ffffff",
    strokeColor: "#111827",
    strokeWidth: Math.max(2, Math.round(fontSize * 0.09)),
    shadowColor: "#000000",
    shadowBlur: 2,
    shadowOffsetX: 1,
    shadowOffsetY: 2,
    backgroundColor: "#111827",
    backgroundOpacity: 0,
    opacity: 100,
    align: "left",
    startFrame: 0,
    endFrame: 0
  };
}

export async function decodeGifBuffer(buffer: ArrayBuffer): Promise<DecodedGif> {
  if (buffer.byteLength > GIF_LIMITS.maxFileBytes) {
    throw new GifToolError(
      `This GIF is larger than the tested ${formatBytes(GIF_LIMITS.maxFileBytes)} browser limit.`
    );
  }

  let rawFrames: GifuctFrame[];
  let parsed: unknown;
  try {
    parsed = parseGIF(buffer);
    rawFrames = decompressFrames(parsed, true);
  } catch (error) {
    throw new GifToolError(
      error instanceof Error ? `Could not decode this GIF: ${error.message}` : "Could not decode this GIF."
    );
  }

  if (!rawFrames.length) {
    throw new GifToolError("This GIF did not contain any decodable image frames.");
  }

  const { width, height } = readGifSize(parsed, rawFrames);
  validateDimensions(width, height);
  if (rawFrames.length > GIF_LIMITS.maxFrames) {
    throw new GifToolError(
      `This GIF has ${rawFrames.length} frames. The tested browser limit is ${GIF_LIMITS.maxFrames} frames.`
    );
  }

  const frames = reconstructDisplayFrames(rawFrames, width, height);
  const durationMs = frames.reduce((sum, frame) => sum + frame.delayMs, 0);
  if (durationMs > GIF_LIMITS.maxDurationMs) {
    throw new GifToolError(
      `This GIF runs for ${formatMs(durationMs)}. The tested browser limit is ${formatMs(
        GIF_LIMITS.maxDurationMs
      )}.`
    );
  }

  return { width, height, frames, durationMs };
}

export async function encodeEditedGif(
  decoded: DecodedGif,
  layers: TextLayer[],
  options: EncodeOptions
): Promise<Blob> {
  if (!decoded.frames.length) {
    throw new GifToolError("There are no decoded frames to export.");
  }

  const encoder = GIFEncoder({ initialCapacity: Math.max(4096, decoded.width * decoded.height) });
  const frameCount = decoded.frames.length;

  for (let index = 0; index < frameCount; index += 1) {
    if (options.signal?.aborted) {
      throw new DOMException("Export canceled", "AbortError");
    }

    const sourceFrame = decoded.frames[index];
    const activeLayers = getActiveLayers(layers, index);
    const rendered = options.renderFrame(sourceFrame.rgba, activeLayers, index);
    options.onProgress?.({
      phase: "render",
      frameIndex: index,
      frameCount,
      progress: (index + 0.35) / frameCount,
      message: `Rendering frame ${index + 1} of ${frameCount}`
    });

    const palette = quantize(rendered, 256, {
      format: "rgba4444",
      oneBitAlpha: 127,
      clearAlpha: true
    });
    const indexed = applyPalette(rendered, palette, "rgba4444");
    const transparentIndex = findTransparentIndex(palette);
    const frameOptions: Parameters<ReturnType<typeof GIFEncoder>["writeFrame"]>[3] = {
      palette,
      delay: Math.max(0, Math.round(sourceFrame.delayMs)),
      dispose: 2
    };
    if (index === 0) {
      frameOptions.repeat = 0;
    }
    if (transparentIndex >= 0) {
      frameOptions.transparent = true;
      frameOptions.transparentIndex = transparentIndex;
    }

    encoder.writeFrame(indexed, decoded.width, decoded.height, frameOptions);
    options.onProgress?.({
      phase: "encode",
      frameIndex: index,
      frameCount,
      progress: (index + 0.9) / frameCount,
      message: `Encoding frame ${index + 1} of ${frameCount}`
    });

    if (index % 4 === 0) {
      await animationYield();
    }
  }

  encoder.finish();
  options.onProgress?.({
    phase: "finish",
    frameIndex: frameCount - 1,
    frameCount,
    progress: 1,
    message: "GIF export complete"
  });
  return new Blob([copyToArrayBuffer(encoder.bytes())], { type: "image/gif" });
}

export function createCanvasFrameRenderer(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new GifToolError("Canvas rendering is not available in this browser.");
  }

  return (baseFrame: Uint8ClampedArray, activeLayers: TextLayer[]) => {
    ctx.clearRect(0, 0, width, height);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(baseFrame), width, height), 0, 0);
    for (const layer of activeLayers) {
      drawTextLayerOnCanvas(ctx, layer);
    }
    return ctx.getImageData(0, 0, width, height).data;
  };
}

export function drawTextLayerOnCanvas(ctx: CanvasRenderingContext2D, layer: TextLayer): void {
  const box = getTextBox(layer, (line) => ctx.measureText(line).width);
  const padding = Math.max(4, Math.round(layer.fontSize * 0.18));
  const textAlpha = clampNumber(layer.opacity, 0, 100) / 100;
  const backgroundAlpha = textAlpha * (clampNumber(layer.backgroundOpacity, 0, 100) / 100);

  ctx.save();
  ctx.font = `${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
  ctx.textBaseline = "top";
  ctx.textAlign = layer.align;

  if (backgroundAlpha > 0) {
    ctx.globalAlpha = backgroundAlpha;
    ctx.fillStyle = layer.backgroundColor;
    roundRect(
      ctx,
      box.x - padding,
      box.y - padding,
      box.width + padding * 2,
      box.height + padding * 2,
      Math.min(8, padding)
    );
    ctx.fill();
  }

  ctx.globalAlpha = textAlpha;
  ctx.shadowColor = layer.shadowColor;
  ctx.shadowBlur = clampNumber(layer.shadowBlur, 0, 40);
  ctx.shadowOffsetX = layer.shadowOffsetX;
  ctx.shadowOffsetY = layer.shadowOffsetY;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = layer.strokeColor;
  ctx.fillStyle = layer.color;
  ctx.lineWidth = clampNumber(layer.strokeWidth, 0, 24);

  const textX =
    layer.align === "center" ? box.x + box.width / 2 : layer.align === "right" ? box.x + box.width : box.x;
  box.lines.forEach((line, index) => {
    const lineY = box.y + index * box.lineHeight;
    if (layer.strokeWidth > 0) {
      ctx.strokeText(line, textX, lineY);
    }
    ctx.fillText(line, textX, lineY);
  });
  ctx.restore();
}

export function getActiveLayers(layers: TextLayer[], frameIndex: number): TextLayer[] {
  return layers.filter((layer) => layer.text.trim() && frameIndex >= layer.startFrame && frameIndex <= layer.endFrame);
}

export function getTextBox(layer: TextLayer, measureLine?: (line: string) => number): TextBox {
  const lines = splitLayerText(layer.text);
  const lineHeight = Math.max(1, Math.round(layer.fontSize * 1.18));
  const width = Math.max(
    1,
    ...lines.map((line) => Math.ceil(measureLine ? measureLine(line) : line.length * layer.fontSize * 0.62))
  );
  return {
    x: layer.x,
    y: layer.y,
    width,
    height: Math.max(lineHeight, lines.length * lineHeight),
    lineHeight,
    lines
  };
}

export function pointHitsLayer(layer: TextLayer, x: number, y: number): boolean {
  const box = getTextBox(layer);
  const pad = Math.max(8, layer.fontSize * 0.18);
  return x >= box.x - pad && x <= box.x + box.width + pad && y >= box.y - pad && y <= box.y + box.height + pad;
}

export function clampLayerToCanvas(layer: TextLayer, width: number, height: number): TextLayer {
  return {
    ...layer,
    x: clampNumber(Math.round(layer.x), -width, width),
    y: clampNumber(Math.round(layer.y), -height, height),
    fontSize: clampNumber(Math.round(layer.fontSize), 8, 220),
    strokeWidth: clampNumber(Math.round(layer.strokeWidth), 0, 32),
    opacity: clampNumber(Math.round(layer.opacity), 0, 100),
    backgroundOpacity: clampNumber(Math.round(layer.backgroundOpacity), 0, 100)
  };
}

export function clampFrameRange(layer: TextLayer, frameCount: number): TextLayer {
  const maxFrame = Math.max(0, frameCount - 1);
  const startFrame = clampNumber(Math.round(layer.startFrame), 0, maxFrame);
  const endFrame = clampNumber(Math.round(layer.endFrame), startFrame, maxFrame);
  return { ...layer, startFrame, endFrame };
}

export function getFrameStartMs(decoded: DecodedGif, frameIndex: number): number {
  return decoded.frames.slice(0, frameIndex).reduce((sum, frame) => sum + frame.delayMs, 0);
}

export function formatMs(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function reconstructDisplayFrames(rawFrames: GifuctFrame[], width: number, height: number): DecodedGifFrame[] {
  let canvas = new Uint8ClampedArray(width * height * 4);
  const output: DecodedGifFrame[] = [];

  rawFrames.forEach((frame, index) => {
    if (!frame.patch) {
      throw new GifToolError("A GIF frame was missing decoded pixel data.");
    }
    const previousCanvas = frame.disposalType === 3 ? new Uint8ClampedArray(canvas) : null;
    drawPatch(canvas, frame.patch, frame.dims, width, height);
    output.push({
      index,
      delayMs: normalizeDelay(frame.delay),
      disposalType: frame.disposalType,
      rgba: new Uint8ClampedArray(canvas)
    });

    if (frame.disposalType === 2) {
      clearRect(canvas, frame.dims, width, height);
    } else if (frame.disposalType === 3 && previousCanvas) {
      canvas = previousCanvas;
    }
  });

  return output;
}

function drawPatch(
  canvas: Uint8ClampedArray,
  patch: Uint8ClampedArray,
  dims: GifuctFrame["dims"],
  canvasWidth: number,
  canvasHeight: number
): void {
  for (let y = 0; y < dims.height; y += 1) {
    const targetY = dims.top + y;
    if (targetY < 0 || targetY >= canvasHeight) continue;
    for (let x = 0; x < dims.width; x += 1) {
      const targetX = dims.left + x;
      if (targetX < 0 || targetX >= canvasWidth) continue;
      const sourceIndex = (y * dims.width + x) * 4;
      const alpha = patch[sourceIndex + 3];
      if (alpha === 0) continue;
      const targetIndex = (targetY * canvasWidth + targetX) * 4;
      canvas[targetIndex] = patch[sourceIndex];
      canvas[targetIndex + 1] = patch[sourceIndex + 1];
      canvas[targetIndex + 2] = patch[sourceIndex + 2];
      canvas[targetIndex + 3] = alpha;
    }
  }
}

function clearRect(
  canvas: Uint8ClampedArray,
  dims: GifuctFrame["dims"],
  canvasWidth: number,
  canvasHeight: number
): void {
  for (let y = 0; y < dims.height; y += 1) {
    const targetY = dims.top + y;
    if (targetY < 0 || targetY >= canvasHeight) continue;
    for (let x = 0; x < dims.width; x += 1) {
      const targetX = dims.left + x;
      if (targetX < 0 || targetX >= canvasWidth) continue;
      const index = (targetY * canvasWidth + targetX) * 4;
      canvas[index] = 0;
      canvas[index + 1] = 0;
      canvas[index + 2] = 0;
      canvas[index + 3] = 0;
    }
  }
}

function readGifSize(parsed: unknown, frames: GifuctFrame[]): { width: number; height: number } {
  const maybe = parsed as {
    lsd?: { width?: number; height?: number };
    header?: { width?: number; height?: number };
    width?: number;
    height?: number;
  };
  const width =
    maybe.lsd?.width ??
    maybe.header?.width ??
    maybe.width ??
    Math.max(...frames.map((frame) => frame.dims.left + frame.dims.width));
  const height =
    maybe.lsd?.height ??
    maybe.header?.height ??
    maybe.height ??
    Math.max(...frames.map((frame) => frame.dims.top + frame.dims.height));
  return { width, height };
}

function validateDimensions(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new GifToolError("This GIF has invalid dimensions.");
  }
  if (width * height > GIF_LIMITS.maxPixels) {
    throw new GifToolError(
      `This GIF is ${width} x ${height}. The tested browser limit is ${GIF_LIMITS.maxPixels.toLocaleString()} pixels.`
    );
  }
  if (width > GIF_LIMITS.maxSide || height > GIF_LIMITS.maxSide) {
    throw new GifToolError(
      `This GIF is ${width} x ${height}. The tested browser limit is ${GIF_LIMITS.maxSide}px on the longest side.`
    );
  }
}

function normalizeDelay(delay: number): number {
  if (!Number.isFinite(delay) || delay <= 0) {
    return 100;
  }
  return Math.round(delay);
}

function splitLayerText(text: string): string[] {
  const lines = text.replace(/\r/g, "").split("\n");
  return lines.length ? lines : [""];
}

function findTransparentIndex(palette: Palette): number {
  return palette.findIndex((color) => color.length === 4 && color[3] <= 127);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cryptoSafeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `layer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function animationYield(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function resolveGifencApi(value: unknown): GifencApi {
  const seen = new Set<unknown>();
  let current = value as Record<string, unknown> | undefined;

  for (let index = 0; index < 8; index += 1) {
    if (current && typeof current.GIFEncoder === "function") return current as GifencApi;
    if (!current || seen.has(current)) break;
    seen.add(current);
    current = (current.default ?? current["module.exports"]) as Record<string, unknown> | undefined;
  }

  throw new Error("The GIF encoder library could not be initialized.");
}
