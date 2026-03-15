// Generates a polished dock icon (512x512 PNG).
// A luminous orb on a dark rounded-square — visible and elegant at dock size.

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZE = 512;
const outPath = path.join(__dirname, '../renderer/assets/dock-icon.png');

const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');

// --- Helper: rounded rect path ---
function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// --- Background rounded square ---
const pad = 20;
const bgW = SIZE - pad * 2;
const cornerR = bgW * 0.22; // macOS-style superellipse approx
roundedRect(pad, pad, bgW, bgW, cornerR);

// Rich dark gradient
const bg = ctx.createLinearGradient(0, pad, 0, SIZE - pad);
bg.addColorStop(0, '#1e1e30');
bg.addColorStop(0.5, '#141425');
bg.addColorStop(1, '#0c0c18');
ctx.fillStyle = bg;
ctx.fill();

// Subtle inner border
ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
ctx.lineWidth = 2;
ctx.stroke();

// --- Ambient background glow ---
const cx = SIZE / 2;
const cy = SIZE / 2 + 4; // slightly below center for visual weight

const ambient = ctx.createRadialGradient(cx, cy, 20, cx, cy, 180);
ambient.addColorStop(0, 'rgba(80, 200, 160, 0.12)');
ambient.addColorStop(0.6, 'rgba(60, 160, 140, 0.04)');
ambient.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = ambient;
ctx.fillRect(0, 0, SIZE, SIZE);

// --- Main orb ---
const orbR = 64;

// Shadow under orb
const shadow = ctx.createRadialGradient(cx, cy + 12, orbR * 0.3, cx, cy + 12, orbR * 2.2);
shadow.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = shadow;
ctx.fillRect(0, 0, SIZE, SIZE);

// Outer glow ring
const outerGlow = ctx.createRadialGradient(cx, cy, orbR * 0.6, cx, cy, orbR * 2.5);
outerGlow.addColorStop(0, 'rgba(100, 230, 185, 0.30)');
outerGlow.addColorStop(0.4, 'rgba(80, 200, 165, 0.10)');
outerGlow.addColorStop(0.7, 'rgba(60, 180, 150, 0.03)');
outerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.fillStyle = outerGlow;
ctx.fillRect(0, 0, SIZE, SIZE);

// Orb body gradient
const orb = ctx.createRadialGradient(cx - 12, cy - 16, 0, cx, cy, orbR);
orb.addColorStop(0, '#a0f5d8');
orb.addColorStop(0.35, '#5ee8b5');
orb.addColorStop(0.7, '#30b888');
orb.addColorStop(1, '#1a8a60');
ctx.beginPath();
ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
ctx.fillStyle = orb;
ctx.fill();

// Glass highlight (top-left crescent)
const glass = ctx.createRadialGradient(cx - 20, cy - 28, 0, cx - 10, cy - 14, orbR * 0.9);
glass.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
glass.addColorStop(0.25, 'rgba(255, 255, 255, 0.18)');
glass.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
glass.addColorStop(1, 'rgba(255, 255, 255, 0)');
ctx.beginPath();
ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
ctx.fillStyle = glass;
ctx.fill();

// Subtle rim light (bottom edge)
const rim = ctx.createRadialGradient(cx + 16, cy + orbR * 0.6, 0, cx, cy, orbR * 1.1);
rim.addColorStop(0, 'rgba(140, 255, 220, 0.15)');
rim.addColorStop(0.5, 'rgba(140, 255, 220, 0.02)');
rim.addColorStop(1, 'rgba(0, 0, 0, 0)');
ctx.beginPath();
ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
ctx.fillStyle = rim;
ctx.fill();

// Specular dot (small bright highlight)
const spec = ctx.createRadialGradient(cx - 22, cy - 30, 0, cx - 22, cy - 30, 14);
spec.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
spec.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
ctx.fillStyle = spec;
ctx.fillRect(0, 0, SIZE, SIZE);

// --- Write output ---
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync(outPath, buffer);
console.log(`Wrote ${outPath} (${buffer.length} bytes)`);
