/* Lightweight QR generator for GOAL 2026 share cards.
   Fixed to QR version 5-L, which comfortably fits normal GitHub Pages URLs. */
(() => {
  'use strict';

  const VERSION = 5;
  const SIZE = 21 + (VERSION - 1) * 4;
  const DATA_CODEWORDS = 108;
  const ECC_CODEWORDS = 26;
  const MAX_BYTES = 106;

  function make(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    if (bytes.length > MAX_BYTES) throw new Error('QR text is too long');

    const data = encodeData(bytes);
    const ecc = reedSolomonRemainder(data, ECC_CODEWORDS);
    const codewords = data.concat(ecc);

    let best = null;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const qr = baseMatrix();
      placeData(qr, codewords, mask);
      drawFormatBits(qr, mask);
      const score = penalty(qr.modules);
      if (score < bestScore) {
        bestScore = score;
        best = qr.modules.map(row => row.slice());
      }
    }
    return best;
  }

  function encodeData(bytes) {
    const bits = [];
    appendBits(bits, 0x4, 4); // byte mode
    appendBits(bits, bytes.length, 8);
    bytes.forEach(b => appendBits(bits, b, 8));

    const capacity = DATA_CODEWORDS * 8;
    appendBits(bits, 0, Math.min(4, capacity - bits.length));
    while (bits.length % 8) bits.push(false);

    const out = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] ? 1 : 0);
      out.push(b);
    }
    for (let pad = 0xec; out.length < DATA_CODEWORDS; pad ^= 0xfd) out.push(pad);
    return out;
  }

  function appendBits(bits, val, len) {
    for (let i = len - 1; i >= 0; i--) bits.push(((val >>> i) & 1) !== 0);
  }

  function baseMatrix() {
    const modules = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
    const reserved = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));

    const set = (x, y, dark, reserve = true) => {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
      modules[y][x] = !!dark;
      if (reserve) reserved[y][x] = true;
    };
    const reserve = (x, y) => {
      if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) reserved[y][x] = true;
    };

    drawFinder(set, 0, 0);
    drawFinder(set, SIZE - 7, 0);
    drawFinder(set, 0, SIZE - 7);
    drawAlignment(set, 30, 30);

    for (let i = 8; i < SIZE - 8; i++) {
      const dark = i % 2 === 0;
      set(i, 6, dark);
      set(6, i, dark);
    }

    reserveFormatAreas(reserve);
    set(8, SIZE - 8, true);
    return { modules, reserved, set };
  }

  function drawFinder(set, left, top) {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const inFinder = x >= 0 && x <= 6 && y >= 0 && y <= 6;
        const border = x === 0 || x === 6 || y === 0 || y === 6;
        const center = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        set(left + x, top + y, inFinder && (border || center));
      }
    }
  }

  function drawAlignment(set, cx, cy) {
    for (let y = -2; y <= 2; y++) {
      for (let x = -2; x <= 2; x++) {
        set(cx + x, cy + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
      }
    }
  }

  function reserveFormatAreas(reserve) {
    for (let i = 0; i <= 8; i++) {
      if (i !== 6) {
        reserve(8, i);
        reserve(i, 8);
      }
    }
    for (let i = 0; i < 8; i++) reserve(SIZE - 1 - i, 8);
    for (let i = 0; i < 7; i++) reserve(8, SIZE - 1 - i);
    reserve(8, SIZE - 8);
  }

  function placeData(qr, codewords, mask) {
    const bits = [];
    codewords.forEach(b => appendBits(bits, b, 8));
    let bitIndex = 0;
    let upward = true;

    for (let right = SIZE - 1; right >= 1; right -= 2) {
      if (right === 6) right--;
      for (let vert = 0; vert < SIZE; vert++) {
        const y = upward ? SIZE - 1 - vert : vert;
        for (let dx = 0; dx < 2; dx++) {
          const x = right - dx;
          if (qr.reserved[y][x]) continue;
          let dark = bitIndex < bits.length ? bits[bitIndex++] : false;
          if (maskBit(mask, x, y)) dark = !dark;
          qr.modules[y][x] = dark;
        }
      }
      upward = !upward;
    }
  }

  function maskBit(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return false;
    }
  }

  function drawFormatBits(qr, mask) {
    const bits = formatBits(mask);
    const bit = i => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) qr.set(8, i, bit(i));
    qr.set(8, 7, bit(6));
    qr.set(8, 8, bit(7));
    qr.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) qr.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) qr.set(SIZE - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) qr.set(8, SIZE - 15 + i, bit(i));
    qr.set(8, SIZE - 8, true);
  }

  function formatBits(mask) {
    const data = (1 << 3) | mask; // error correction level L
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >>> 9) & 1) ? 0x537 : 0);
    return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
  }

  function reedSolomonRemainder(data, degree) {
    const gen = generatorPoly(degree).slice(1);
    const result = Array(degree).fill(0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      for (let i = 0; i < degree; i++) result[i] ^= gfMul(gen[i], factor);
    }
    return result;
  }

  function generatorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const root = gfPow2(i);
      const next = Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], root);
      }
      poly = next;
    }
    return poly;
  }

  const EXP = [];
  const LOG = Array(256).fill(0);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

  function gfMul(a, b) {
    return a && b ? EXP[LOG[a] + LOG[b]] : 0;
  }

  function gfPow2(power) {
    return EXP[power % 255];
  }

  function penalty(modules) {
    let score = 0;
    for (let y = 0; y < SIZE; y++) score += linePenalty(modules[y]);
    for (let x = 0; x < SIZE; x++) score += linePenalty(modules.map(row => row[x]));

    for (let y = 0; y < SIZE - 1; y++) {
      for (let x = 0; x < SIZE - 1; x++) {
        const c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
      }
    }

    const pattern = [true, false, true, true, true, false, true, false, false, false, false];
    const reverse = pattern.slice().reverse();
    const rows = modules;
    const cols = Array.from({ length: SIZE }, (_, x) => modules.map(row => row[x]));
    rows.concat(cols).forEach(line => {
      for (let i = 0; i <= SIZE - 11; i++) {
        const slice = line.slice(i, i + 11);
        if (samePattern(slice, pattern) || samePattern(slice, reverse)) score += 40;
      }
    });

    const dark = modules.flat().filter(Boolean).length;
    const percent = dark * 100 / (SIZE * SIZE);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;
    return score;
  }

  function linePenalty(line) {
    let score = 0;
    let runColor = line[0];
    let run = 1;
    for (let i = 1; i < line.length; i++) {
      if (line[i] === runColor) run++;
      else {
        if (run >= 5) score += run - 2;
        runColor = line[i];
        run = 1;
      }
    }
    if (run >= 5) score += run - 2;
    return score;
  }

  function samePattern(a, b) {
    for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function draw(ctx, modules, x, y, size) {
    const quiet = 4;
    const count = modules.length + quiet * 2;
    const cell = Math.floor(size / count);
    const actual = cell * count;
    const ox = x + Math.floor((size - actual) / 2);
    const oy = y + Math.floor((size - actual) / 2);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox, oy, actual, actual);
    ctx.fillStyle = '#07110b';
    modules.forEach((row, yy) => {
      row.forEach((dark, xx) => {
        if (dark) ctx.fillRect(ox + (xx + quiet) * cell, oy + (yy + quiet) * cell, cell, cell);
      });
    });
    ctx.restore();
    return { x: ox, y: oy, size: actual };
  }

  window.Goal2026Qr = { make, draw, maxBytes: MAX_BYTES };
})();
