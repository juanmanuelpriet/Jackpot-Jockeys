// Cuánto frena el charco del sabotaje. node charco.js <carreras> [tipo de obstáculo]
// A un caballo se le tira el charco delante a los 10 s y se compara con la misma carrera sin charco.
const H = require('path').join(__dirname, '../../') + '/';
const { Track, Horse, stepRace, drawGates, laneOffset, mulberry32, FPS, MUNDOS } = require(H + 'sim');
const { repartir, loadPerfiles, loadHandicapPers } = require(H + 'establo');
const N = +process.argv[2] || 200, TIPO = process.argv[3] || 'charco', B = loadPerfiles(), HP = loadHandicapPers();
const sizes = ['corta', 'media', 'larga'], worlds = Object.keys(MUNDOS);
function carrera(c, conCharco) {
  const rng = mulberry32(c * 7919 + 1), wd = worlds[c % worlds.length], tr = new Track(Math.floor(rng() * 1e6), null, sizes[c % 3], wd);
  const gt = drawGates(6, rng), L = repartir(rng), forms = L.map(() => 0.93 + rng() * 0.14), target = c % 6;
  Math.random = mulberry32(c * 31 + 5);
  const hs = L.map((x, i) => new Horse(tr, B[x.slot], { id: i, form: HP[x.pers] * forms[i], lane: laneOffset(gt[i], 6) }));
  let k = 0, salto = 0, piso = 0, o = null;
  while (k < FPS * 90 && !hs.every(h => h.finished)) {
    k++;
    if (conCharco && k === FPS * 10) o = tr.addObstacle(TIPO, hs[target].maxProgress + 12, (Math.random() - 0.5) * 20);
    const j0 = hs[target].jumps, m0 = hs[target].mudHits;
    stepRace(hs);
    if (o) { const h = hs[target], cerca = (h.x - o.x) ** 2 + (h.y - o.y) ** 2 < (o.r + 10) ** 2; if (cerca && h.jumps > j0) salto++; if (cerca && h.mudHits > m0) piso++; }
    for (const h of hs) if (!h.finished && h.laps >= tr.laps) { h.finished = true; h.finishTick = h.ticks; }
  }
  const h = hs[target];
  return { t: h.finished ? h.finishTick / FPS : 90, salto, piso, pers: L[target].pers };
}
let dt = 0, dt2 = 0, s = 0, p = 0;
for (let c = 0; c < N; c++) { const a = carrera(c, false), b = carrera(c, true), d = b.t - a.t; dt += d; dt2 += d * d; s += b.salto > 0; p += b.piso > 0; }
const m = dt / N, se = Math.sqrt((dt2 / N - m * m) / (N - 1));
console.log(JSON.stringify({ tipo: TIPO, carreras: N, segundosPerdidos: +m.toFixed(2), error: +se.toFixed(2), loSalta: +(s / N * 100).toFixed(1), loPisa: +(p / N * 100).toFixed(1) }));
