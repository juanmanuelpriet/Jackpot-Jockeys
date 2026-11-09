// Mide a un caballo contra 5 de la casa en muchas carreras (mundos y tamaños al azar, las mismas para todos los que se comparan).
// node evalua.js <red.json | maestro | corredor.1 | …> <carreras> [semilla]
// Escribe una línea JSON: % de victorias y podios, y por carrera salidas, tropiezos, saltos, esquivas, barro pisado y golpes.
const H = require('path').join(__dirname, '../../') + '/', fs = require('fs');
const { Track, Horse, stepRace, drawGates, laneOffset, mulberry32, FPS, MUNDOS, visionGrid, einsteinStep, ESCALARES } = require(H + 'sim');
const { repartir, loadPerfiles, loadHandicapPers } = require(H + 'establo');
const maestro = require('./maestro').einstein;
const [quien, Ns, seedS] = process.argv.slice(2), N = +Ns, seed = +(seedS || 7);
const B = loadPerfiles(), HP = loadHandicapPers(), sizes = ['corta', 'media', 'larga'], mundos = Object.keys(MUNDOS);
const red = quien.endsWith('.json') ? JSON.parse(fs.readFileSync(quien)) : null;
const rng = mulberry32(seed); Math.random = mulberry32(seed + 1);
const tot = { gana: 0, podio: 0, falls: 0, stumbles: 0, jumps: 0, dodges: 0, mudHits: 0, hitsGiven: 0, hitsTaken: 0 }, porMundo = {}, porTam = {};
for (let r = 0; r < N; r++) {
  const wd = mundos[r % mundos.length], tr = new Track(Math.floor(rng() * 1e6), null, sizes[r % 3], wd), g = drawGates(6, rng);
  const L = repartir(rng).slice(0, 5), form = 0.93 + rng() * 0.14;
  const hs = L.map((x, i) => new Horse(tr, B[x.slot], { id: i, form: HP[x.pers] * (0.93 + rng() * 0.14), lane: laneOffset(g[i], 6) }));
  const me = new Horse(tr, red || B[quien] || B['corredor.1'], { id: 5, form: (red || quien === 'maestro' ? 1 : HP[quien.split('.')[0]] || 1) * form, lane: laneOffset(g[5], 6) });
  if (quien === 'maestro') me.piloto = h => maestro(h);
  hs.push(me);
  const max = FPS * 90; let t = 0;
  while (t < max && !hs.every(h => h.finished)) { t++; stepRace(hs); for (const h of hs) if (!h.finished && h.laps >= tr.laps) { h.finished = true; h.finishTick = h.ticks; } }
  const rk = h => h.finished ? h.finishTick : 1e9 - h.total, place = hs.filter(o => rk(o) < rk(me)).length;
  const m = porMundo[wd] = porMundo[wd] || { n: 0, gana: 0 }, z = porTam[sizes[r % 3]] = porTam[sizes[r % 3]] || { n: 0, gana: 0 }; m.n++; z.n++;
  if (place === 0) { tot.gana++; m.gana++; z.gana++; }
  if (place < 3) tot.podio++;
  for (const k of ['falls', 'stumbles', 'jumps', 'dodges', 'mudHits', 'hitsGiven', 'hitsTaken']) tot[k] += me[k];
}
const out = { quien, carreras: N };
for (const [k, v] of Object.entries(tot)) out[k] = k === 'gana' || k === 'podio' ? +(v / N * 100).toFixed(1) : +(v / N).toFixed(2);
out.ganaPorMundo = Object.fromEntries(Object.entries(porMundo).map(([k, m]) => [k, Math.round(m.gana / m.n * 100)]));
out.ganaPorTamaño = Object.fromEntries(Object.entries(porTam).map(([k, m]) => [k, Math.round(m.gana / m.n * 100)]));
console.log(JSON.stringify(out));
