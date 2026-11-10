// Mide a varios caballos en el asiento de Einstein con las MISMAS carreras (entorno.js), en paralelo.
// node mide.js <carreras> <semilla> <modo: juego|fabrica> <quien>... ; quien = red.json | maestro | corredor.1 | …
// Escribe una línea JSON por caballo: % de victorias y podio con su error típico, eventos por carrera y victorias por mundo y tamaño.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const H = require('path').join(__dirname, '../../') + '/', fs = require('fs');
const cerebro = q => q.endsWith('.json') ? JSON.parse(fs.readFileSync(q)) : q === 'maestro' ? 'maestro' : require(H + 'establo').loadPerfiles()[q];
const formDe = q => q.endsWith('.json') || q === 'maestro' ? 1 : require(H + 'establo').loadHandicapPers()[q.split('.')[0]] ?? 1;
if (!isMainThread) {
  const { carrera } = require('./entorno'), { quien, seeds, modo } = workerData, b = cerebro(quien), form = formDe(quien);
  parentPort.postMessage(seeds.map(s => carrera(b, s, { modo, form })));
  return;
}
const [Ns, seedS, modo, ...quienes] = process.argv.slice(2), N = +Ns, base = +seedS * 100000;
const hilos = Math.max(1, require('os').cpus().length - 1), seeds = Array.from({ length: N }, (_, i) => base + i);
const corre = quien => Promise.all(Array.from({ length: hilos }, (_, k) => new Promise((ok, mal) => {
  const w = new Worker(__filename, { workerData: { quien, modo, seeds: seeds.filter((_, i) => i % hilos === k) } });
  w.once('message', ok); w.once('error', mal);
}))).then(p => p.flat());
(async () => {
  for (const quien of quienes) {
    const r = await corre(quien), m = k => r.reduce((a, x) => a + x[k], 0) / r.length, et = p => Math.sqrt(p * (1 - p) / r.length);
    const por = k => { const o = {}; for (const x of r) { const z = o[x[k]] = o[x[k]] || [0, 0]; z[0] += x.gana; z[1]++; } return Object.fromEntries(Object.entries(o).map(([a, [g, n]]) => [a, Math.round(g / n * 100)])); };
    const out = { quien, modo, carreras: r.length, gana: +(m('gana') * 100).toFixed(1), etGana: +(et(m('gana')) * 100).toFixed(1), podio: +(m('podio') * 100).toFixed(1),
      puesto: +(m('place') + 1).toFixed(2), justo: +(100 / m('n')).toFixed(1) };
    for (const k of ['falls', 'stumbles', 'mudHits', 'jumps', 'dodges', 'hitsGiven', 'hitsTaken']) out[k] = +m(k).toFixed(2);
    out.ganaPorMundo = por('mundo'); out.ganaPorTamaño = por('tam');
    console.log(JSON.stringify(out));
  }
})();
