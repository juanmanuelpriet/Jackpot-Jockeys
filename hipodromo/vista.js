// vista.js — Lo que ve Einstein y dónde mira, en vivo (tecla L de la pantalla).
// Repite la pasada de einsteinStep (sim.js) guardando lo de en medio y la recorre hacia atrás para sacar el Grad-CAM
// de la primera convolución, como experimentos/einstein/gradcam.py, pero solo del tick actual: la memoria que traía
// se toma fija (gradcam.py, en cambio, deriva por todo el último segundo).
const { VISTA } = require('./sim');

const sig = v => 1 / (1 + Math.exp(-v));

// Convolución 3×3 con relleno de ceros y ReLU, sin pooling: devuelve el mapa entero
function conv(x, cin, size, l) {
  const cout = l.b.length, a = new Float32Array(cout * size * size);
  for (let co = 0; co < cout; co++) for (let r = 0; r < size; r++) for (let k = 0; k < size; k++) {
    let s = l.b[co];
    for (let ci = 0; ci < cin; ci++) {
      const wb = (co * cin + ci) * 9, xb = ci * size * size;
      for (let ky = 0; ky < 3; ky++) {
        const yy = r + ky - 1; if (yy < 0 || yy >= size) continue;
        for (let kx = 0; kx < 3; kx++) { const xx = k + kx - 1; if (xx >= 0 && xx < size) s += l.W[wb + ky * 3 + kx] * x[xb + yy * size + xx]; }
      }
    }
    a[(co * size + r) * size + k] = Math.max(0, s);
  }
  return a;
}
// Pooling 2×2 que guarda de dónde salió cada máximo (para devolver el gradiente solo ahí)
function pool(a, c, size) {
  const h = size / 2, y = new Float32Array(c * h * h), de = new Int32Array(c * h * h);
  for (let ch = 0; ch < c; ch++) for (let r = 0; r < h; r++) for (let k = 0; k < h; k++) {
    let best = -1, at = 0;
    for (let dr = 0; dr < 2; dr++) for (let dk = 0; dk < 2; dk++) {
      const i = (ch * size + 2 * r + dr) * size + 2 * k + dk;
      if (a[i] > best) { best = a[i]; at = i; }
    }
    const o = (ch * h + r) * h + k; y[o] = best; de[o] = at;
  }
  return { y, de };
}
// Hacia atrás de una convolución (con su ReLU): del gradiente de su salida al de su entrada
function convAtras(g, a, cin, size, l) {
  const cout = l.b.length, gx = new Float32Array(cin * size * size);
  for (let co = 0; co < cout; co++) for (let r = 0; r < size; r++) for (let k = 0; k < size; k++) {
    const o = (co * size + r) * size + k; if (!g[o] || a[o] <= 0) continue;
    for (let ci = 0; ci < cin; ci++) {
      const wb = (co * cin + ci) * 9, xb = ci * size * size;
      for (let ky = 0; ky < 3; ky++) {
        const yy = r + ky - 1; if (yy < 0 || yy >= size) continue;
        for (let kx = 0; kx < 3; kx++) { const xx = k + kx - 1; if (xx >= 0 && xx < size) gx[xb + yy * size + xx] += g[o] * l.W[wb + ky * 3 + kx]; }
      }
    }
  }
  return gx;
}
// GRU hacia adelante (como gruStep de sim.js) guardando sus puertas
function gru(l, x, m) {
  const u = l.b.length / 3, n = l.W.length - u, z = [], r = [], c = [], h = [];
  for (let j = 0; j < u; j++) {
    let a = l.b[j], b = l.b[j + u];
    for (let i = 0; i < n; i++) { a += x[i] * l.W[i][j]; b += x[i] * l.W[i][j + u]; }
    for (let k = 0; k < u; k++) { a += m[k] * l.W[n + k][j]; b += m[k] * l.W[n + k][j + u]; }
    z[j] = sig(a); r[j] = sig(b);
  }
  for (let j = 0; j < u; j++) {
    let s = l.b[j + 2 * u];
    for (let i = 0; i < n; i++) s += x[i] * l.W[i][j + 2 * u];
    for (let k = 0; k < u; k++) s += r[k] * m[k] * l.W[n + k][j + 2 * u];
    c[j] = Math.tanh(s); h[j] = (1 - z[j]) * m[j] + z[j] * c[j];
  }
  return { h, z, r, c, m, n, u };
}
// GRU hacia atrás respecto a su entrada (la memoria que traía queda fija)
function gruAtras(l, g, s) {
  const { z, r, c, m, n, u } = s, dz = [], dr = new Array(u).fill(0), dc = [], gx = new Array(n).fill(0);
  for (let j = 0; j < u; j++) { dc[j] = g[j] * z[j] * (1 - c[j] * c[j]); dz[j] = g[j] * (c[j] - m[j]) * z[j] * (1 - z[j]); }
  for (let k = 0; k < u; k++) { let a = 0; for (let j = 0; j < u; j++) a += dc[j] * l.W[n + k][j + 2 * u]; dr[k] = a * m[k] * r[k] * (1 - r[k]); }
  for (let i = 0; i < n; i++) { let a = 0; for (let j = 0; j < u; j++) a += dz[j] * l.W[i][j] + dr[j] * l.W[i][j + u] + dc[j] * l.W[i][j + 2 * u]; gx[i] = a; }
  return gx;
}
const densa = (x, l) => l.b.map((b, j) => { let s = b; for (let i = 0; i < x.length; i++) s += x[i] * l.W[i][j]; return Math.tanh(s); });
const densaAtras = (g, y, l, n) => { const d = y.map((v, j) => g[j] * (1 - v * v)), gx = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < d.length; j++) gx[i] += d[j] * l.W[i][j]; return gx; };

// Analiza un tick: cuadrícula, 8 números y la memoria con la que llegó. Devuelve la decisión y un Grad-CAM (16×16, 0..1)
// para el giro (hacia donde gira) y otro para el acelerador.
function analiza(brain, grid, scalars, mem, prueba = null) {
  const [c1, c2] = brain.conv, S = VISTA, C1 = c1.b.length, C2 = c2.b.length;
  const a1 = conv(grid, 4, S, c1), p1 = pool(a1, C1, S);
  const a2 = conv(p1.y, C1, S / 2, c2), p2 = pool(a2, C2, S / 2);
  const v = densa(p2.y, brain.proy), x1 = [...v, ...scalars];
  const u1 = brain.gru[0].b.length / 3, u2 = brain.gru[1].b.length / 3;
  mem = Array.from({ length: u1 + u2 }, (_, i) => mem[i] || 0);   // al empezar la carrera la memoria aún está vacía
  const g1 = gru(brain.gru[0], x1, mem.slice(0, u1)), g2 = gru(brain.gru[1], g1.h, mem.slice(u1));
  const d1 = densa(g2.h, brain.densa[0]), y = densa(d1, brain.densa[1]);
  const cam = k => {
    const gy = [0, 0]; gy[k] = k === 0 && y[0] < 0 ? -1 : 1;              // el giro, hacia donde gira
    let g = densaAtras(gy, y, brain.densa[1], d1.length);
    g = densaAtras(g, d1, brain.densa[0], g2.h.length);
    g = gruAtras(brain.gru[1], g, g2); g = gruAtras(brain.gru[0], g, g1).slice(0, v.length);
    g = densaAtras(g, v, brain.proy, p2.y.length);
    const ga2 = new Float32Array(a2.length); p2.de.forEach((at, o) => { ga2[at] += g[o]; });
    const gp1 = convAtras(ga2, a2, C1, S / 2, c2);
    const ga1 = new Float32Array(a1.length); p1.de.forEach((at, o) => { ga1[at] += gp1[o]; });
    if (prueba) prueba[k] = { ga1, a1 };
    // Grad-CAM: cada mapa pesa por su gradiente medio; se suma y se queda lo positivo
    const n2 = S * S, out = new Float32Array(n2);
    for (let ch = 0; ch < C1; ch++) {
      let w = 0; for (let i = 0; i < n2; i++) w += ga1[ch * n2 + i]; w /= n2;
      for (let i = 0; i < n2; i++) out[i] += w * a1[ch * n2 + i];
    }
    let mx = 0; for (let i = 0; i < n2; i++) { out[i] = Math.max(0, out[i]); mx = Math.max(mx, out[i]); }
    if (mx > 0) for (let i = 0; i < n2; i++) out[i] /= mx;
    return out;
  };
  return { y, giro: cam(0), gas: cam(1) };
}

module.exports = { analiza, _interno: { conv, pool, gru, densa } };
