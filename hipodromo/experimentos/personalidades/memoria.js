// Qué tanto recuerdan las GRU de la casa, por personalidad. node memoria.js <carreras> [semilla] [salida.json]
//   puertas     vida media de cada número de memoria según su puerta z
//   horizonte   se cambia lo que vio en un tick y se mide cuánto cambia su decisión k ticks después (sin cerrar el lazo)
//   amnesia     en carrera real, a un caballo se le borra la memoria cada N ticks o al empezar la vuelta 2
//   sondas      qué se puede leer de la memoria que no esté ya en lo que ve ahora (con un control que se ve ahora)
const H = require('path').join(__dirname, '../../') + '/', fs = require('fs');
const { Track, Horse, stepRace, drawGates, laneOffset, mulberry32, FPS, MUNDOS } = require(H + 'sim');
const { repartir, loadPerfiles, loadHandicapPers } = require(H + 'establo');
const N = +process.argv[2] || 100, SEED = +process.argv[3] || 1, OUT = process.argv[4];
const B = loadPerfiles(), HP = loadHandicapPers();
const PERS = ['corredor', 'picaro', 'bravo', 'muybravo'], sizes = ['corta', 'media', 'larga'], worlds = Object.keys(MUNDOS);
const GRUPOS = { sensores: [0, 1, 2, 3, 4], rival: [5, 6, 7, 8], obstaculos: [11, 13, 14, 18, 19, 20], propio: [9, 10, 12, 21], mundo: [15, 16, 17] };
const KS = [0, 1, 3, 5, 10, 15, 30, 60, 90, 150], KMAX = 150;
const MODOS = { cada1: { cada: 1 }, cada10: { cada: 10 }, cada30: { cada: 30 }, cada90: { cada: 90 }, vuelta: { vuelta: true } };

// Un paso de la red igual al de sim.js, pero devolviendo también la puerta z
function paso(brain, x, h) {
  const l = brain[0], u = l.b.length / 3, n = l.W.length - u, sig = v => 1 / (1 + Math.exp(-v));
  const z = new Float64Array(u), r = new Float64Array(u), o = new Float64Array(u);
  for (let j = 0; j < u; j++) {
    let a = l.b[j], c = l.b[j + u];
    for (let i = 0; i < n; i++) { a += x[i] * l.W[i][j]; c += x[i] * l.W[i][j + u]; }
    for (let k = 0; k < u; k++) { a += h[k] * l.W[n + k][j]; c += h[k] * l.W[n + k][j + u]; }
    z[j] = sig(a); r[j] = sig(c);
  }
  for (let j = 0; j < u; j++) {
    let s = l.b[j + 2 * u];
    for (let i = 0; i < n; i++) s += x[i] * l.W[i][j + 2 * u];
    for (let k = 0; k < u; k++) s += r[k] * h[k] * l.W[n + k][j + 2 * u];
    o[j] = (1 - z[j]) * h[j] + z[j] * Math.tanh(s);
  }
  const d = brain[1], y = [0, 0];
  for (let j = 0; j < 2; j++) { let s = d.b[j]; for (let k = 0; k < u; k++) s += o[k] * d.W[k][j]; y[j] = Math.tanh(s); }
  return { h: o, z, y };
}

function carrera(c, tp, modo, graba) {
  const rng = mulberry32(SEED * 1e6 + c * 7919);
  const wd = worlds[Math.floor(rng() * worlds.length)], tr = new Track(Math.floor(rng() * 1e6), null, sizes[c % 3], wd);
  const gt = drawGates(6, rng), L = repartir(rng), forms = L.map(() => 0.93 + rng() * 0.14);
  Math.random = mulberry32(SEED * 31 + c);
  const hs = L.map((x, i) => new Horse(tr, B[x.slot], { id: i, form: HP[x.pers] * forms[i], lane: laneOffset(gt[i], 6) }));
  const target = L.findIndex(x => x.pers === tp), rec = hs.map(() => ({ xs: [], ms: [], lap: [], st: [] }));
  hs.forEach((h, i) => {
    const orig = h.inputs.bind(h); let n = 0, borrada = false;
    h.inputs = k => {
      const x = orig(k);
      if (i === target && modo) {
        if (modo.cada && n % modo.cada === 0) h.mem.length = 0;
        if (modo.vuelta && !borrada && h.laps >= 1) { h.mem.length = 0; borrada = true; }
      }
      if (graba) { const r = rec[i]; r.xs.push(Float64Array.from(x)); r.lap.push(h.laps); r.st.push(h.stumbles); if (c === 0) r.ms.push(h.mem.slice()); }
      n++; return x;
    };
  });
  const max = FPS * 90, v1 = hs.map(() => null), v2 = hs.map(() => null); let k = 0;
  while (k < max && !hs.every(h => h.finished)) {
    k++; stepRace(hs);
    hs.forEach((h, i) => {
      if (v1[i] === null && h.laps >= 1) v1[i] = h.ticks;
      if (v2[i] === null && h.laps >= 2) v2[i] = h.ticks;
      if (!h.finished && h.laps >= tr.laps) { h.finished = true; h.finishTick = h.ticks; }
    });
  }
  const rk = x => x.finished ? x.finishTick : 1e9 - x.total, ord = [...hs.keys()].sort((a, b) => rk(hs[a]) - rk(hs[b]));
  const res = hs.map((h, i) => ({ pers: L[i].pers, pl: ord.indexOf(i), t: h.finished ? h.finishTick / FPS : 90, falls: h.falls, stum: h.stumbles,
    v2: tr.laps >= 2 && v1[i] !== null && v2[i] !== null ? (v2[i] - v1[i]) / FPS : null }));
  return { L, rec, res, target };
}

// Acumuladores por personalidad
const acc = {};
for (const p of PERS) acc[p] = { lnRet: null, nz: 0, hor: Object.fromEntries(['todo', ...Object.keys(GRUPOS)].map(g => [g, { s: new Float64Array(KMAX + 1), n: 0 }])),
  filas: [], amn: Object.fromEntries(Object.keys(MODOS).map(m => [m, []])) };
let chequeo = null;
const prng = mulberry32(SEED * 97 + 3);

function analiza(brain, pers, r, carreraIdx) {
  const T = r.xs.length; if (T < KMAX + 40) return;
  const a = acc[pers], u = brain[0].b.length / 3;
  if (!a.lnRet) a.lnRet = new Float64Array(u);
  let h = new Float64Array(u); const Hs = [], Ys = [];
  for (let t = 0; t < T; t++) {
    const s = paso(brain, r.xs[t], h);
    if (carreraIdx === 0 && r.ms[t]) { const m = r.ms[t]; let e = 0; for (let j = 0; j < u; j++) e = Math.max(e, Math.abs((m[j] || 0) - h[j])); chequeo = Math.max(chequeo || 0, e); }
    for (let j = 0; j < u; j++) a.lnRet[j] += -Math.log(Math.max(1e-9, 1 - s.z[j]));
    a.nz++; h = s.h; Hs.push(h); Ys.push(s.y);
  }
  // Horizonte: cambiar lo visto en t0 por lo visto en otro momento de la misma carrera
  for (let q = 0; q < 4; q++) {
    const t0 = 1 + Math.floor(prng() * (T - KMAX - 2)), otro = r.xs[Math.floor(prng() * T)];
    for (const [g, idx] of [['todo', null], ...Object.entries(GRUPOS)]) {
      const x0 = Float64Array.from(r.xs[t0]);
      if (idx) for (const i of idx) x0[i] = otro[i]; else x0.set(otro);
      let hh = Hs[t0 - 1];
      for (let k = 0; k <= KMAX; k++) {
        const s = paso(brain, k === 0 ? x0 : r.xs[t0 + k], hh); hh = s.h;
        a.hor[g].s[k] += Math.abs(s.y[0] - Ys[t0 + k][0]) + Math.abs(s.y[1] - Ys[t0 + k][1]);
      }
      a.hor[g].n++;
    }
  }
  // Sondas: una fila cada 5 ticks
  let ult = -1e9;
  for (let t = 0; t < T; t++) {
    if (t > 0 && r.st[t] > r.st[t - 1]) ult = t;
    if (t < 30 || t % 5) continue;
    const fr = r.lap[t] % 1;
    a.filas.push({ par: carreraIdx % 2, x: r.xs[t], h: Hs[t - 1],
      y: [Math.floor(r.lap[t]), Math.sin(2 * Math.PI * fr), Math.cos(2 * Math.PI * fr), r.xs[t - 30][21], r.xs[t - 30][18], Math.min(t - ult, 90) / FPS, r.xs[t][2], r.xs[t - 3][2], r.xs[t - 3][5]] });
  }
}

const t0 = Date.now();
for (let c = 0; c < N; c++) {
  const tp = PERS[c % 4], base = carrera(c, tp, null, true);
  if (base.target < 0) continue;
  base.rec.forEach((r, i) => analiza(B[base.L[i].slot], base.L[i].pers, r, c));
  const b = base.res[base.target];
  for (const [m, modo] of Object.entries(MODOS)) {
    const x = carrera(c, tp, modo, false).res[base.target];
    acc[tp].amn[m].push({ dt: x.t - b.t, dpod: (x.pl < 3) - (b.pl < 3), dfalls: x.falls - b.falls, dstum: x.stum - b.stum,
      dv2: x.v2 !== null && b.v2 !== null ? x.v2 - b.v2 : null });
  }
  if (c % 20 === 19) console.error(`carrera ${c + 1}/${N} ${((Date.now() - t0) / 1000) | 0}s`);
}

// Regresión ridge entrenada en carreras pares y medida en impares
function ridgeR2(filas, feat0, col, lam = 1e-4) {
  const tr = filas.filter(f => !f.par), te = filas.filter(f => f.par), d = feat0(tr[0]).length + 1;
  // Cada variable a media 0 y desviación 1, medidas en entrenamiento
  const mu = new Float64Array(d - 1), sd = new Float64Array(d - 1);
  for (const f of tr) feat0(f).forEach((v, i) => { mu[i] += v; sd[i] += v * v; });
  for (let i = 0; i < d - 1; i++) { mu[i] /= tr.length; sd[i] = Math.sqrt(Math.max(1e-12, sd[i] / tr.length - mu[i] ** 2)); }
  const feat = f => feat0(f).map((v, i) => (v - mu[i]) / sd[i]);
  const A = Array.from({ length: d }, () => new Float64Array(d + 1));
  for (const f of tr) { const v = [...feat(f), 1], y = f.y[col]; for (let i = 0; i < d; i++) { for (let j = 0; j < d; j++) A[i][j] += v[i] * v[j]; A[i][d] += v[i] * y; } }
  for (let i = 0; i < d - 1; i++) A[i][i] += lam * tr.length;
  for (let i = 0; i < d; i++) {
    let p = i; for (let k = i + 1; k < d; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    [A[i], A[p]] = [A[p], A[i]];
    for (let k = 0; k < d; k++) if (k !== i) { const f = A[k][i] / A[i][i]; for (let j = i; j <= d; j++) A[k][j] -= f * A[i][j]; }
  }
  const w = A.map((row, i) => row[d] / row[i]);
  const ys = te.map(f => f.y[col]), my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let sse = 0, sst = 0;
  te.forEach((f, k) => { const v = [...feat(f), 1]; let p = 0; for (let i = 0; i < d; i++) p += w[i] * v[i]; sse += (p - ys[k]) ** 2; sst += (ys[k] - my) ** 2; });
  return 1 - sse / sst;
}

const media = a => a.reduce((s, v) => s + v, 0) / a.length;
const se = a => { const m = media(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1) / a.length); };
const SONDAS = ['vuelta', 'progreso', null, 'vel_hace_1s', 'obst_hace_1s', 'desde_tropiezo', 'control_sensor_ahora', 'sensor_hace_3t', 'rival_hace_3t'];
const out = { carreras: N, semilla: SEED, chequeo, ks: KS, pers: {} };
for (const p of PERS) {
  const a = acc[p], vida = [...a.lnRet].map(v => Math.LN2 / (v / a.nz)).sort((x, y) => x - y);
  const curva = g => KS.map(k => a.hor[g].s[k] / a.hor[g].n);
  const rel = curva('todo').map(v => v / curva('todo')[0]);
  let horiz = null; for (let i = 1; i < KS.length; i++) if (rel[i] < 0.1) { horiz = KS[i - 1] + (KS[i] - KS[i - 1]) * (rel[i - 1] - 0.1) / (rel[i - 1] - rel[i]); break; }
  const sondas = {};
  SONDAS.forEach((s, col) => {
    if (!s) return;
    const r2 = f => s === 'progreso' ? (ridgeR2(a.filas, f, 1) + ridgeR2(a.filas, f, 2)) / 2 : ridgeR2(a.filas, f, col);
    sondas[s] = { ve: r2(f => [...f.x]), memoria: r2(f => [...f.h]), ambas: r2(f => [...f.x, ...f.h]) };
  });
  const amn = {};
  for (const [m, v] of Object.entries(a.amn)) {
    const v2 = v.map(x => x.dv2).filter(x => x !== null);
    amn[m] = { n: v.length, dt: media(v.map(x => x.dt)), dtSE: se(v.map(x => x.dt)), dpodio: media(v.map(x => x.dpod)) * 100,
      dsalidas: media(v.map(x => x.dfalls)), dtropiezos: media(v.map(x => x.dstum)), dv2: v2.length ? media(v2) : null, dv2SE: v2.length > 1 ? se(v2) : null, nv2: v2.length };
  }
  out.pers[p] = { vidaMedia: { mediana: vida[vida.length >> 1], p90: vida[Math.floor(vida.length * 0.9)], max: vida[vida.length - 1], masDe1s: vida.filter(v => v > FPS).length / vida.length * 100 },
    horizonte: { ticks: horiz, rel, abs: curva('todo'), grupos: Object.fromEntries(Object.keys(GRUPOS).map(g => [g, curva(g)])) }, sondas, amnesia: amn };
}
out.segundos = ((Date.now() - t0) / 1000) | 0;
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v));
