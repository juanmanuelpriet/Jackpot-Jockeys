// ¿Cuánto mejora un caballo de la casa si entrena el cuerpo como los potros, sin tocar su cerebro?
// node cuerpo.js <personalidad> <carreras> [semilla]. Corre contra cinco de la casa sin entrenar, con las mismas carreras para cada nivel.
const H = require('path').join(__dirname, '../../') + '/';
const { Track, Horse, stepRace, drawGates, laneOffset, mulberry32, FPS, MUNDOS } = require(H + 'sim');
const { repartir, loadPerfiles, loadHandicapPers, PLAN_CASA } = require(H + 'establo');
const { bodyOpts, FOCUS } = require(H + 'evolucion');
const [pers, Ns, seedS] = process.argv.slice(2), N = +Ns, SEED = +seedS || 1, B = loadPerfiles(), HP = loadHandicapPers();
const sizes = ['corta', 'media', 'larga'], worlds = Object.keys(MUNDOS);
const cuerpo = k => PLAN_CASA[pers].slice(0, k).reduce((b, f) => { const { trait, step, max } = FOCUS[f]; return { ...b, [trait]: Math.min(max, (b[trait] || 0) + step) }; }, {});
function mide(k) {
  const body = cuerpo(k), o = bodyOpts(body, HP[pers]); let w = 0, p3 = 0, f = 0, g = 0, t = 0;
  for (let c = 0; c < N; c++) {
    const rng = mulberry32(SEED * 1e6 + c * 7919), wd = worlds[Math.floor(rng() * worlds.length)], tr = new Track(Math.floor(rng() * 1e6), null, sizes[c % 3], wd);
    const gt = drawGates(6, rng), mine = (SEED + c) % 2 + 1, L = repartir(rng).filter(x => x.slot !== `${pers}.${mine}`).slice(0, 5), forms = [...L, 0].map(() => 0.93 + rng() * 0.14);
    Math.random = mulberry32(SEED * 31 + c);
    const hs = L.map((x, i) => new Horse(tr, B[x.slot], { id: i, form: HP[x.pers] * forms[i], lane: laneOffset(gt[i], 6) }));
    hs.push(new Horse(tr, B[`${pers}.${mine}`], { id: 5, form: o.form * forms[5], agility: o.agility, power: o.power, lane: laneOffset(gt[5], 6) }));
    let q = 0; while (q < FPS * 90 && !hs.every(h => h.finished)) { q++; stepRace(hs); for (const h of hs) if (!h.finished && h.laps >= tr.laps) { h.finished = true; h.finishTick = h.ticks; } }
    const rk = x => x.finished ? x.finishTick : 1e9 - x.total, me = hs[5], pl = hs.filter(x => rk(x) < rk(me)).length;
    if (pl === 0) w++; if (pl < 3) p3++; f += me.falls; g += me.hitsGiven; t += me.stumbles;
  }
  return `${pers} ${k} entrenos ${JSON.stringify(body)} gana ${(w / N * 100).toFixed(1)}% podio ${(p3 / N * 100).toFixed(1)}% salidas ${(f / N).toFixed(2)} golpes ${(g / N).toFixed(2)} tropiezos ${(t / N).toFixed(2)}`;
}
for (const k of [0, 2, 4, 6]) console.log(mide(k));
