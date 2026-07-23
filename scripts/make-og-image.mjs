import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const file = resolve("public/og-image.jpg");
const image = await readFile(file);

const { width, height } = readJpegSize(image);

if (width !== 1200 || height !== 630) {
  throw new Error(`${file} must be 1200 x 630. Found ${width} x ${height}.`);
}

console.log(`${file} is ready: ${width} x ${height}`);

function readJpegSize(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error(`${file} is not a JPEG file.`);
  }

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + length;
  }

  throw new Error(`Could not read dimensions from ${file}.`);
}
