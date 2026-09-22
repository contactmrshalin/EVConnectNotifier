// Generates the tray/app PNGs at build time so no binary assets are committed.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BOLT = [
  [0.56, 0.04], [0.19, 0.56], [0.46, 0.56], [0.36, 0.96], [0.83, 0.42], [0.54, 0.42],
];

function insidePolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function render(size, rgb) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = 3;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          if (insidePolygon(x, y, BOLT)) hits++;
        }
      }
      const offset = (py * size + px) * 4;
      pixels[offset] = rgb[0];
      pixels[offset + 1] = rgb[1];
      pixels[offset + 2] = rgb[2];
      pixels[offset + 3] = Math.round((hits / (samples * samples)) * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = -1;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

const green = [46, 184, 96];
const black = [0, 0, 0];
const files = [
  ['trayTemplate.png', 16, black],
  ['trayTemplate@2x.png', 32, black],
  ['tray.png', 16, green],
  ['tray@2x.png', 32, green],
  ['icon.png', 512, green],
];

for (const [name, size, rgb] of files) {
  fs.writeFileSync(path.join(outDir, name), encodePng(size, render(size, rgb)));
}
console.log(`Wrote ${files.length} icons to ${outDir}`);

const extensionDir = path.join(__dirname, '..', 'extension', 'icons');
fs.mkdirSync(extensionDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(extensionDir, `icon${size}.png`), encodePng(size, render(size, green)));
}
console.log(`Wrote 4 icons to ${extensionDir}`);
