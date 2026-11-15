'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const sourceFunction = require('../src/progress-bar');

function readChunks(bytes) {
  const chunks = new Map();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset < bytes.length) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    chunks.set(type, bytes.slice(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') break;
  }
  return chunks;
}

function readStoredZlib(data) {
  let offset = 2;
  const blocks = [];
  let finalBlock = false;
  while (!finalBlock) {
    const header = data[offset++];
    finalBlock = (header & 1) !== 0;
    assert.equal(header & 6, 0);
    const length = data[offset] | (data[offset + 1] << 8);
    const inverse = data[offset + 2] | (data[offset + 3] << 8);
    offset += 4;
    assert.equal((length ^ inverse) & 0xFFFF, 0xFFFF);
    blocks.push(data.slice(offset, offset + length));
    offset += length;
  }

  const output = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 0));
  let position = 0;
  for (const block of blocks) {
    output.set(block, position);
    position += block.length;
  }
  return output;
}

function loadBundleFunction() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'progress-bar.js'), 'utf8');
  const context = { Buffer };
  assert.doesNotMatch(source, /node:zlib/);
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.createProgressBar;
}

test('source exports a Buffer-producing function for CommonJS consumers', () => {
  assert.equal(typeof sourceFunction, 'function');
  assert(Buffer.isBuffer(sourceFunction(0.5)));
});

test('bundle creates PNG Buffer data with the requested two-opacity progress split', () => {
  const createProgressBar = loadBundleFunction();
  const png = createProgressBar(0.5);
  const chunks = readChunks(new Uint8Array(png));
  const header = chunks.get('IHDR');
  const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const pixels = readStoredZlib(chunks.get('IDAT'));
  const rowBytes = Math.ceil(150 / 8) + 1;
  const indexAt = (x) => (pixels[1 + (x >> 3)] >> (7 - (x & 7))) & 1;

  assert(Buffer.isBuffer(png));
  assert.equal(headerView.getUint32(0, false), 150);
  assert.equal(headerView.getUint32(4, false), 28);
  assert.deepEqual([...chunks.get('PLTE')], [3, 171, 160, 3, 171, 160]);
  assert.deepEqual([...chunks.get('tRNS')], [255, 97]);
  assert.equal(pixels[0], 0);
  assert.equal(indexAt(0), 0);
  assert.equal(indexAt(74), 0);
  assert.equal(indexAt(75), 1);
  assert.equal(indexAt(149), 1);
  assert.equal(pixels.length, rowBytes * 28);
});

test('bundle accepts fractional progress, hex color, and custom dimensions', () => {
  const createProgressBar = loadBundleFunction();
  assert.throws(() => createProgressBar(25), /fraction from 0 to 1/);
  assert.throws(() => createProgressBar(0.25, 'rgb(10, 20, 30)'), /#RRGGBB/);
  const png = createProgressBar(0.25, '#0A141E', 8, 2);
  const chunks = readChunks(new Uint8Array(png));
  const headerView = new DataView(chunks.get('IHDR').buffer);
  const pixels = readStoredZlib(chunks.get('IDAT'));

  assert.equal(headerView.getUint32(0, false), 8);
  assert.equal(headerView.getUint32(4, false), 2);
  assert.deepEqual([...chunks.get('PLTE')], [10, 20, 30, 10, 20, 30]);
  assert.deepEqual([...pixels], [0, 63, 0, 63]);
});
