function createProgressBar(progress, color = '#03ABA0', width = 150, height = 28) {
  if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new TypeError('progress must be a fraction from 0 to 1');
  }
  if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new TypeError('color must be a #RRGGBB hex string');
  }
  if (![width, height].every((value) => Number.isInteger(value) && value > 0 && value <= 32768) ||
      width * height > 100000000) {
    throw new RangeError('width and height must be positive integers within PNG size limits');
  }

  const filledWidth = Math.round(progress * width);
  const rowBytes = Math.ceil(width / 8) + 1;
  const pixels = new Uint8Array(rowBytes * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes + 1;
    for (let x = filledWidth; x < width; x++) {
      pixels[rowStart + (x >> 3)] |= 1 << (7 - (x & 7));
    }
  }

  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width, false);
  headerView.setUint32(4, height, false);
  header[8] = 1;
  header[9] = 3;

  const compressed = storedZlib(pixels);
  const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  const rgb = [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16)
  ];
  const palette = Uint8Array.of(...rgb, ...rgb);
  const transparency = Uint8Array.of(255, 97);

  return Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('PLTE', palette),
    pngChunk('tRNS', transparency),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', new Uint8Array())
  ].map((chunk) => Buffer.from(chunk)));
}

function storedZlib(data) {
  const blockCount = Math.ceil(data.length / 65535);
  const output = new Uint8Array(2 + data.length + blockCount * 5 + 4);
  output[0] = 0x78;
  output[1] = 0x01;
  let position = 2;

  for (let offset = 0; offset < data.length;) {
    const length = Math.min(65535, data.length - offset);
    const inverse = length ^ 0xFFFF;
    output[position++] = offset + length === data.length ? 1 : 0;
    output[position++] = length & 255;
    output[position++] = length >>> 8;
    output[position++] = inverse & 255;
    output[position++] = inverse >>> 8;
    output.set(data.subarray(offset, offset + length), position);
    position += length;
    offset += length;
  }

  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  new DataView(output.buffer).setUint32(position, ((b << 16) | a) >>> 0, false);
  return output;
}

function pngChunk(type, data) {
  const crcInput = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) crcInput[i] = type.charCodeAt(i);
  crcInput.set(data, 4);

  const chunk = new Uint8Array(data.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false);
  chunk.set(crcInput, 4);
  view.setUint32(chunk.length - 4, crc32(crcInput), false);
  return chunk;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

module.exports = createProgressBar;