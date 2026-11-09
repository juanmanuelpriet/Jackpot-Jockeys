// Graba carreras de Einstein (einstein.json) contra 5 de la casa para mirar qué ve: node graba.js <salida> <carreras> [semilla]
// <salida>.vis: la cuadrícula exacta (float32). <salida>.json: por tick carrera, escalares, su decisión y qué pasó
// (saltos, esquivas, salidas, tropiezos y golpes acumulados, puesto, giro de la pista por delante).
const H = require('path').join(__dirname, '../../') + '/', fs = require('fs');
const { Track, Horse, stepRace, drawGates, laneOffset, mulberry32, FPS, MUNDOS, visionGrid, einsteinStep, ESCALARES } = require(H + 'sim');
const { repartir, loadPerfiles, loadHandicapPers } = require(H + 'establo');
const [out, Ns, seedS] = process.argv.slice(2), N = +Ns, SEED = +(seedS || 11);
const B = loadPerfiles(), HP = loadHandicapPers(), red = B.einstein, sizes = ['corta', 'media', 'larga'], mundos = Object.keys(MUNDOS);
const vis = [], filas = [];
for (let r = 0; r < N; r++) {
  const rng = mulberry32(SEED * 1e6 + r * 7919); Math.random = mulberry32(SEED * 31 + r);
  const wd = mundos[r % mundos.length], tr = new Track(Math.floor(rng() * 1e6), null, sizes[r % 3], wd), g = drawGates(6, rng);
  const hs = repartir(rng).slice(0, 5).map((x, i) => new Horse(tr, B[x.slot], { id: i, form: HP[x.pers] * (0.93 + rng() * 0.14), lane: laneOffset(g[i], 6) }));
  const me = new Horse(tr, red, { id: 5, form: 0.93 + rng() * 0.14, lane: laneOffset(g[5], 6) });
  me.piloto = (h, others) => {
    const grid = visionGrid(h, others), x = h.inputs(others.length), sc = ESCALARES.map(i => x[i]), y = einsteinStep(red, grid, sc, h.mem);
    vis.push(Float32Array.from(grid));
    filas.push([r, h.ticks, ...sc, y[0], y[1], h.jumps, h.dodges, h.falls, h.stumbles, h.hitsGiven, h.mudHits, +h.speed.toFixed(3)]);
    return y;
  };
  hs.push(me);
  const max = FPS * 90; let t = 0;
  while (t < max && !hs.every(h => h.finished)) { t++; stepRace(hs); for (const h of hs) if (!h.finished && h.laps >= tr.laps) { h.finished = true; h.finishTick = h.ticks; } }
}
fs.writeFileSync(out + '.vis', Buffer.concat(vis.map(v => Buffer.from(v.buffer))));
fs.writeFileSync(out + '.json', JSON.stringify({ cols: ['carrera', 'tick', 's0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 'giro', 'gas', 'saltos', 'esquivas', 'salidas', 'tropiezos', 'golpes', 'barro', 'vel'], mundos: Array.from({ length: N }, (_, r) => mundos[r % mundos.length]), filas }));
console.log('ticks', filas.length);
