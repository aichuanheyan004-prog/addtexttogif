declare module "gifuct-js" {
  export interface GifuctFrame {
    pixels: number[];
    dims: {
      top: number;
      left: number;
      width: number;
      height: number;
    };
    delay: number;
    disposalType: number;
    colorTable: number[][];
    transparentIndex?: number;
    patch?: Uint8ClampedArray;
  }

  export function parseGIF(buffer: ArrayBuffer | Uint8Array): unknown;
  export function decompressFrames(gif: unknown, buildPatch: boolean): GifuctFrame[];
}

declare module "gifenc" {
  export type Palette = Array<[number, number, number] | [number, number, number, number]>;

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: {
      format?: "rgb565" | "rgb444" | "rgba4444";
      oneBitAlpha?: boolean | number;
      clearAlpha?: boolean;
      clearAlphaThreshold?: number;
      clearAlphaColor?: number;
    }
  ): Palette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: "rgb565" | "rgb444" | "rgba4444"
  ): Uint8Array;

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): {
    writeFrame: (
      index: Uint8Array,
      width: number,
      height: number,
      options?: {
        palette?: Palette;
        first?: boolean;
        transparent?: boolean;
        transparentIndex?: number;
        delay?: number;
        repeat?: number;
        dispose?: number;
      }
    ) => void;
    finish: () => void;
    bytes: () => Uint8Array;
    bytesView: () => Uint8Array;
    reset: () => void;
  };

  const gifenc: {
    GIFEncoder: typeof GIFEncoder;
    quantize: typeof quantize;
    applyPalette: typeof applyPalette;
  };

  export default gifenc;
}
