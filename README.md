# progress-bar-png

Generates PNG bytes as a Node.js `Buffer` for a simple rectangular progress bar. The source has no runtime npm dependencies and does not use `node:zlib`; it uses Node.js built-in `Buffer`, `Uint8Array`, and `DataView` APIs.

## Build

The build machine needs Node.js 20 or later and npm access:

```powershell
npm ci
npm run build
```

Copy `dist/progress-bar.js` into the target environment. The bundle exposes `createProgressBar` and has no external runtime dependencies.

## Use

In a CommonJS environment, import the source directly:

```js
const createProgressBar = require('./src/progress-bar');
const pngBuffer = createProgressBar(0.65);
```

In an environment where the bundle is pasted into the plugin code:

```js
const pngBuffer = createProgressBar(0.65);
```

With all parameters:

```js
const percent = 65;
const pngBuffer = createProgressBar(
  percent / 100,
  '#03ABA0',
  200,
  32
);
```

Parameters:

- `progress`: a finite number. Values below `0` are treated as `0`, and values above `1` are treated as `1`. Convert percentages at the call site, for example `65 / 100`.
- `color`: optional six-digit `#RRGGBB` color; defaults to `#03ABA0`.
- `width`, `height`: optional positive integers; default to `150` and `28`.

The function returns a `Buffer` containing PNG data. When uploading or sending it, use the MIME type `image/png`. The left rectangle is fully opaque. The right rectangle uses 38% opacity (alpha 97). Both use the selected color. The fill boundary is square, with no rounded corners.

## Implementation

The PNG uses a two-entry indexed palette, a transparency chunk, and uncompressed DEFLATE blocks. This keeps the generator independent of npm packages and Node's zlib module while producing a small image for this two-color design.

Run `npm test` with Node.js 20 or later to rebuild the bundle and run the smoke tests.
