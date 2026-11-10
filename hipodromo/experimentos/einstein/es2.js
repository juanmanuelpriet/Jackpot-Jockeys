// es2.js — Afina a Einstein con evolución en el entorno del juego (entorno.js): casa aprendida y con cuerpo, potros, poderes.
// Más severo que es.js: premia ganar y el podio, castiga salidas, tropiezos, barro y no terminar, y puede tocar más capas.
// node es2.js <red.json> <salida.json> <generaciones> [pares] [carreras por generación] [sigma] [tasa]
// CAPAS=densa,gru2,gru1,proy,conv (o todo) elige qué se afina (por defecto densa,gru2). Cada 10 generaciones valida en 300 carreras
// fijas y guarda la mejor; la última queda en <salida>_ultimo.json y el estado de Adam en <salida>_adam.json (SIGUE=1 lo retoma).
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const CAPAS = (process.env.CAPAS === 'todo' ? 'conv,proy,gru1,gru2,densa' : process.env.CAPAS || 'densa,gru2').split(',');
const capas = red => CAPAS.flatMap(c => c === 'densa' ? red.densa : c === 'gru1' ? [red.gru[0]] : c === 'gru2' ? [red.gru[1]] : c === 'proy' ? [red.proy] : c === 'conv' ? red.conv : []);
const plano = red => capas(red).flatMap(l => [...(Array.isArray(l.W[0]) ? l.W.flat() : l.W), ...l.b]);
function pon(red, v) {
  let k = 0;
  for (const l of capas(red)) { l.W = Array.isArray(l.W[0]) ? l.W.map(f => f.map(() => v[k++])) : l.W.map(() => v[k++]); l.b = l.b.map(() => v[k++]); }
  return red;
}
// Puntos de una carrera: severos con los errores (BARRO=castigo por pisar barro, 0.2 por defecto)
const BARRO = +(process.env.BARRO || 0.2);
const puntos = r => 5 * (r.n - 1 - r.place) / (r.n - 1) + 3 * r.gana + r.podio - 1 * r.falls - 0.3 * r.stumbles - BARRO * r.mudHits - 3 * (1 - r.termina);
if (!isMainThread) {
  const { carrera } = require('./entorno'), base = JSON.parse(workerData.red);
  parentPort.on('message', ({ id, v, seeds }) => {
    const red = pon(JSON.parse(JSON.stringify(base)), v), r = seeds.map(s => carrera(red, s));
    const m = f => r.reduce((a, x) => a + f(x), 0) / r.length;
    parentPort.postMessage({ id, pts: m(puntos), gana: m(x => x.gana), podio: m(x => x.podio), falls: m(x => x.falls), stumbles: m(x => x.stumbles), barro: m(x => x.mudHits) });
  });
  return;
}
const [entra, sale, Gs, Ps, Cs, sigS, lrS] = process.argv.slice(2);
const G = +Gs, P = +(Ps || 32), C = +(Cs || 12), SIG = +(sigS || 0.02), LR = +(lrS || 0.002);
const red = JSON.parse(fs.readFileSync(entra)), txt = JSON.stringify(red), n = Math.max(1, require('os').cpus().length - 1);
const pool = Array.from({ length: n }, () => new Worker(__filename, { workerData: { red: txt } }));
let next = 0; const espera = new Map(), cola = [], libres = [...pool];
pool.forEach(w => w.on('message', m => { espera.get(m.id)(m); espera.delete(m.id); libre(w); }));
function libre(w) { if (cola.length) { const [msg, ok] = cola.shift(); espera.set(msg.id, ok); w.postMessage(msg); } else libres.push(w); }
const evalua = (v, seeds) => new Promise(ok => { const msg = { id: next++, v, seeds }; const w = libres.pop(); if (w) { espera.set(msg.id, ok); w.postMessage(msg); } else cola.push([msg, ok]); });
async function evaluaMuchas(v, seeds) {
  const parts = Array.from({ length: n * 2 }, (_, k) => seeds.filter((_, i) => i % (n * 2) === k)).filter(x => x.length);
  const r = await Promise.all(parts.map(p => evalua(v, p))), w = parts.map(p => p.length), tot = w.reduce((a, b) => a + b, 0);
  const m = k => r.reduce((a, x, i) => a + x[k] * w[i], 0) / tot;
  return { pts: +m('pts').toFixed(3), gana: +m('gana').toFixed(3), podio: +m('podio').toFixed(3), falls: +m('falls').toFixed(2), stumbles: +m('stumbles').toFixed(2), barro: +m('barro').toFixed(2) };
}
const gauss = () => Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
const VAL = Array.from({ length: 300 }, (_, i) => 7000000 + i);   // carreras de validación: nunca se entrena con ellas
const ADAM = sale.replace(/\.json$/, '_adam.json');
(async () => {
  let th = plano(red), m = th.map(() => 0), q = th.map(() => 0), g0 = 0;
  if (process.env.SIGUE && fs.existsSync(ADAM)) ({ m, q, g: g0 } = JSON.parse(fs.readFileSync(ADAM)));
  let mejor = await evaluaMuchas(th, VAL), mejorTh = th.slice();
  console.log('capas', CAPAS.join('+'), 'parámetros', th.length, 'inicio', JSON.stringify(mejor));
  for (let g = g0 + 1; g <= G; g++) {
    const seeds = Array.from({ length: C }, (_, i) => g * 1000 + i), eps = Array.from({ length: P }, () => th.map(gauss));
    const res = await Promise.all(eps.flatMap(e => [1, -1].map(s => evalua(th.map((x, i) => x + s * SIG * e[i]), seeds))));
    const f = res.map(r => r.pts), ord = f.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), rank = f.slice();
    ord.forEach(([, i], k) => { rank[i] = k / (f.length - 1) - 0.5; });
    const grad = th.map((_, j) => eps.reduce((a, e, k) => a + (rank[2 * k] - rank[2 * k + 1]) * e[j], 0) / (P * SIG));
    m = m.map((x, j) => 0.9 * x + 0.1 * grad[j]); q = q.map((x, j) => 0.999 * x + 0.001 * grad[j] ** 2);
    th = th.map((x, j) => x + LR * (m[j] / (1 - 0.9 ** g)) / (Math.sqrt(q[j] / (1 - 0.999 ** g)) + 1e-8));
    if (g % 10 === 0 || g === G) {
      const v = await evaluaMuchas(th, VAL), media = f.reduce((a, b) => a + b, 0) / f.length;
      console.log('gen', g, 'media', media.toFixed(2), 'validación', JSON.stringify(v));
      fs.writeFileSync(sale.replace(/\.json$/, '_ultimo.json'), JSON.stringify(pon(JSON.parse(txt), th)));
      fs.writeFileSync(ADAM, JSON.stringify({ m, q, g }));
      if (v.pts > mejor.pts) { mejor = v; mejorTh = th.slice(); fs.writeFileSync(sale, JSON.stringify(pon(JSON.parse(txt), mejorTh))); console.log('  mejor hasta ahora'); }
    }
  }
  console.log('mejor', JSON.stringify(mejor));
  pool.forEach(w => w.terminate());
})();
