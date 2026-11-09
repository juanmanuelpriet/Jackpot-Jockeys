// Afina a Einstein sin maestro: evolución (ES con ruido en pares opuestos) solo de sus capas densas, premiando ganarle a la casa.
// node es.js <red.json> <salida.json> <generaciones> [pares] [carreras por generación] [sigma] [tasa]
// Cada generación corre las mismas carreras nuevas para todos; cada 10 se valida en 150 carreras fijas y se guarda la mejor
// (y la última en <salida>_ultimo.json).
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const H = require('path').join(__dirname, '../../') + '/', fs = require('fs');
const { Track, Horse, stepRace, drawGates, laneOffset, mulberry32, FPS, MUNDOS } = require(H + 'sim');
const { repartir, loadPerfiles, loadHandicapPers } = require(H + 'establo');
const capas = red => red.densa;
const plano = red => capas(red).flatMap(l => [...l.W.flat(), ...l.b]);
function pon(red, v) {
  let k = 0;
  for (const l of capas(red)) { l.W = l.W.map(f => f.map(() => v[k++])); l.b = l.b.map(() => v[k++]); }
  return red;
}
// Una carrera contra 5 de la casa: puntos = rivales vencidos + 2 si gana − 0.5 por salida
function carrera(red, seed, B, HP) {
  const sizes = ['corta', 'media', 'larga'], mundos = Object.keys(MUNDOS), rng = mulberry32(seed); Math.random = mulberry32(seed + 7);
  const tr = new Track(Math.floor(rng() * 1e6), null, sizes[seed % 3], mundos[seed % mundos.length]), g = drawGates(6, rng);
  const hs = repartir(rng).slice(0, 5).map((x, i) => new Horse(tr, B[x.slot], { id: i, form: HP[x.pers] * (0.93 + rng() * 0.14), lane: laneOffset(g[i], 6) }));
  const me = new Horse(tr, red, { id: 5, form: 0.93 + rng() * 0.14, lane: laneOffset(g[5], 6) }); hs.push(me);
  const max = FPS * 90; let t = 0;
  while (t < max && !hs.every(h => h.finished)) { t++; stepRace(hs); for (const h of hs) if (!h.finished && h.laps >= tr.laps) { h.finished = true; h.finishTick = h.ticks; } }
  const rk = h => h.finished ? h.finishTick : 1e9 - h.total, place = hs.filter(o => rk(o) < rk(me)).length;
  return { pts: 5 - place + (place === 0 ? 2 : 0) - 0.5 * me.falls, gana: place === 0 ? 1 : 0, podio: place < 3 ? 1 : 0, falls: me.falls };
}
if (!isMainThread) {
  const B = loadPerfiles(), HP = loadHandicapPers(), base = JSON.parse(workerData.red);
  parentPort.on('message', ({ id, v, seeds }) => {
    const red = pon(JSON.parse(JSON.stringify(base)), v), r = seeds.map(s => carrera(red, s, B, HP));
    const m = k => r.reduce((a, x) => a + x[k], 0) / r.length;
    parentPort.postMessage({ id, pts: m('pts'), gana: m('gana'), podio: m('podio'), falls: m('falls') });
  });
  return;
}
const [entra, sale, Gs, Ps, Cs, sigS, lrS] = process.argv.slice(2);
const G = +Gs, P = +(Ps || 12), C = +(Cs || 8), SIG = +(sigS || 0.02), LR = +(lrS || 0.002);
const red = JSON.parse(fs.readFileSync(entra)), txt = JSON.stringify(red), n = Math.min(8, require('os').cpus().length - 1);
const pool = Array.from({ length: n }, () => new Worker(__filename, { workerData: { red: txt } }));
let next = 0; const espera = new Map(), cola = [];
pool.forEach(w => w.on('message', m => { espera.get(m.id)(m); espera.delete(m.id); libre(w); }));
const libres = [...pool];
function libre(w) { if (cola.length) { const [msg, ok] = cola.shift(); espera.set(msg.id, ok); w.postMessage(msg); } else libres.push(w); }
const evalua = (v, seeds) => new Promise(ok => { const msg = { id: next++, v, seeds }; const w = libres.pop(); if (w) { espera.set(msg.id, ok); w.postMessage(msg); } else cola.push([msg, ok]); });
// Muchas carreras: se reparten entre los hilos y se promedian
async function evaluaMuchas(v, seeds) {
  const parts = Array.from({ length: n }, (_, k) => seeds.filter((_, i) => i % n === k)).filter(x => x.length);
  const r = await Promise.all(parts.map(p => evalua(v, p))), w = parts.map(p => p.length), tot = w.reduce((a, b) => a + b, 0);
  const m = k => r.reduce((a, x, i) => a + x[k] * w[i], 0) / tot;
  return { pts: +m('pts').toFixed(3), gana: +m('gana').toFixed(3), podio: +m('podio').toFixed(3), falls: +m('falls').toFixed(2) };
}
const gauss = () => Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
const VAL = Array.from({ length: 150 }, (_, i) => 900000 + i);
(async () => {
  let th = plano(red), m = th.map(() => 0), q = th.map(() => 0);
  let mejor = await evaluaMuchas(th, VAL), mejorTh = th.slice();
  console.log('inicio', JSON.stringify(mejor), 'parámetros', th.length);
  for (let g = 1; g <= G; g++) {
    const seeds = Array.from({ length: C }, (_, i) => g * 1000 + i), eps = Array.from({ length: P }, () => th.map(gauss));
    const res = await Promise.all(eps.flatMap(e => [1, -1].map(s => evalua(th.map((x, i) => x + s * SIG * e[i]), seeds))));
    // Rangos en vez de puntos crudos: una carrera rara no manda
    const f = res.map(r => r.pts), ord = f.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), rank = f.slice();
    ord.forEach(([, i], k) => { rank[i] = k / (f.length - 1) - 0.5; });
    const grad = th.map((_, j) => eps.reduce((a, e, k) => a + (rank[2 * k] - rank[2 * k + 1]) * e[j], 0) / (P * SIG));
    // Adam: cada peso se mueve como mucho unas milésimas por generación
    m = m.map((x, j) => 0.9 * x + 0.1 * grad[j]); q = q.map((x, j) => 0.999 * x + 0.001 * grad[j] ** 2);
    th = th.map((x, j) => x + LR * (m[j] / (1 - 0.9 ** g)) / (Math.sqrt(q[j] / (1 - 0.999 ** g)) + 1e-8));
    if (g % 10 === 0 || g === G) {
      const v = await evaluaMuchas(th, VAL);
      console.log('gen', g, 'media', (f.reduce((a, b) => a + b, 0) / f.length).toFixed(2), 'validación', JSON.stringify(v));
      fs.writeFileSync(sale.replace(/\.json$/, '_ultimo.json'), JSON.stringify(pon(JSON.parse(txt), th)));
      if (v.pts > mejor.pts) { mejor = v; mejorTh = th.slice(); fs.writeFileSync(sale, JSON.stringify(pon(JSON.parse(txt), mejorTh))); }
    }
  }
  console.log('mejor', JSON.stringify(mejor));
  pool.forEach(w => w.terminate());
})();
