import { describe, expect, it } from "vitest";
import * as gifenc from "gifenc";
import {
  type DecodedGif,
  type TextLayer,
  createDefaultLayer,
  decodeGifBuffer,
  encodeEditedGif,
  getTextBox,
  pointHitsLayer
} from "./gifPipeline";

const gifencModule = gifenc as typeof gifenc & {
  default?: typeof gifenc;
  "module.exports"?: typeof gifenc;
};
const gifencApi = resolveGifencApi(gifencModule);
const { GIFEncoder: createEncoder, applyPalette: mapPalette, quantize: makePalette } = gifencApi;

type GifencApi = {
  GIFEncoder: typeof gifenc.GIFEncoder;
  applyPalette: typeof gifenc.applyPalette;
  quantize: typeof gifenc.quantize;
};

describe("gifPipeline", () => {
  it("decodes a real animated GIF fixture and preserves frame timing", async () => {
    const source = makeFixtureGif();
    const decoded = await decodeGifBuffer(toArrayBuffer(source));

    expect(decoded.width).toBe(32);
    expect(decoded.height).toBe(20);
    expect(decoded.frames).toHaveLength(4);
    expect(decoded.frames.map((frame) => frame.delayMs)).toEqual([50, 80, 110, 140]);
  });

  it("computes text positioning and hit testing from layer coordinates", () => {
    const layer = makeLayer(6, 4, 0, 3);
    const box = getTextBox(layer, (line) => line.length * 10);

    expect(box.x).toBe(6);
    expect(box.y).toBe(4);
    expect(box.width).toBe(40);
    expect(pointHitsLayer(layer, 8, 7)).toBe(true);
    expect(pointHitsLayer(layer, 70, 18)).toBe(false);
  });

  it("exports an animated GIF at the original size with text only on selected frames", async () => {
    const decoded = await decodeGifBuffer(toArrayBuffer(makeFixtureGif()));
    const layer = makeLayer(5, 6, 1, 2);

    const output = await encodeEditedGif(decoded, [layer], {
      renderFrame: renderSyntheticTextBlock,
      onProgress: undefined
    });

    expect(output.size).toBeGreaterThan(120);
    const exported = await decodeGifBuffer(await output.arrayBuffer());

    expect(exported.width).toBe(decoded.width);
    expect(exported.height).toBe(decoded.height);
    expect(exported.frames.length).toBeGreaterThan(1);

    expect(hasRedTextPixel(exported, 0, 5, 6)).toBe(false);
    expect(hasRedTextPixel(exported, 1, 5, 6)).toBe(true);
    expect(hasRedTextPixel(exported, 2, 5, 6)).toBe(true);
    expect(hasRedTextPixel(exported, 3, 5, 6)).toBe(false);
  });
});

function makeFixtureGif(): Uint8Array {
  const width = 32;
  const height = 20;
  const delays = [50, 80, 110, 140];
  const encoder = createEncoder();

  delays.forEach((delay, frameIndex) => {
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        rgba[i] = 22;
        rgba[i + 1] = 34 + frameIndex * 6;
        rgba[i + 2] = 48;
        rgba[i + 3] = 255;
      }
    }
    drawRect(rgba, width, height, 2 + frameIndex * 4, 4, 5, 5, [15, 118, 110, 255]);
    const palette = makePalette(rgba, 256);
    const indexed = mapPalette(rgba, palette);
    encoder.writeFrame(indexed, width, height, {
      palette,
      delay,
      repeat: frameIndex === 0 ? 0 : undefined,
      dispose: 2
    });
  });

  encoder.finish();
  return encoder.bytes();
}

function makeLayer(x: number, y: number, startFrame: number, endFrame: number): TextLayer {
  return {
    ...createDefaultLayer(32, 20),
    id: "test-layer",
    name: "Test layer",
    text: "TEXT",
    x,
    y,
    fontSize: 10,
    startFrame,
    endFrame,
    color: "#ff0000"
  };
}

function renderSyntheticTextBlock(base: Uint8ClampedArray, activeLayers: TextLayer[]): Uint8ClampedArray {
  const width = 32;
  const height = 20;
  const output = new Uint8ClampedArray(base);
  for (const layer of activeLayers) {
    drawRect(output, width, height, Math.round(layer.x), Math.round(layer.y), 6, 5, [255, 0, 0, 255]);
  }
  return output;
}

function hasRedTextPixel(decoded: DecodedGif, frameIndex: number, x: number, y: number): boolean {
  const frame = decoded.frames[frameIndex];
  const i = (y * decoded.width + x) * 4;
  return frame.rgba[i] > 180 && frame.rgba[i + 1] < 90 && frame.rgba[i + 2] < 90 && frame.rgba[i + 3] > 200;
}

function drawRect(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number, number]
) {
  for (let py = Math.max(0, y); py < Math.min(height, y + h); py += 1) {
    for (let px = Math.max(0, x); px < Math.min(width, x + w); px += 1) {
      const i = (py * width + px) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = color[3];
    }
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
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
  throw new Error("Could not resolve gifenc API");
}
