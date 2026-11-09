// Qué usa Einstein para correr: se le quita algo y se corre la misma carrera (mismas semillas) contra 5 de la casa.
// node analiza.js <red.json> <carreras> [semilla]. Variantes: normal, sin memoria (se borra cada tick), memoria borrada cada
// 30 ticks (1 s) o al empezar la vuelta 2, sin cada canal (SOLO=normal,sinMemoria corre solo esas) de la vista (pista, vallas, peligros, rivales) y sin los 8 números.
const H = require('path').join(__dirname, '../../') + '/', fs = require('fs');
const { Track, Horse, stepRace, drawGates, laneOffset, mulberry32, FPS, MUNDOS, visionGrid, einsteinStep, ESCALARES, VISTA } = require(H + 'sim');
const { repartir, loadPerfiles, loadHandicapPers } = require(H + 'establo');
const [redf, Ns, seedS] = process.argv.slice(2), N = +Ns, SEED = +(seedS || 3);
const red = JSON.parse(fs.readFileSync(redf)), B = loadPerfiles(), HP = loadHandicapPers(), sizes = ['corta', 'media', 'larga'], mundos = Object.keys(MUNDOS);
const C = VISTA * VISTA;
const VARIANTES = {
  normal: {}, sinMemoria: { borra: () => true }, borra1s: { borra: t => t % 30 === 0 }, borraVuelta2: { vuelta2: true },
  sinPista: { canal: 0 }, sinVallas: { canal: 1 }, sinPeligros: { canal: 2 }, sinRivales: { canal: 3 }, sinNumeros: { numeros: true },
};
const out = {};
for (const [nombre, v] of Object.entries(VARIANTES).filter(([k]) => !process.env.SOLO || process.env.SOLO.split(',').includes(k))) {
  const t = { gana: 0, podio: 0, tiempo: 0, llegan: 0, falls: 0, stumbles: 0, mudHits: 0, jumps: 0, dodges: 0, hitsGiven: 0 };
  for (let r = 0; r < N; r++) {
    const rng = mulberry32(SEED * 1e6 + r * 7919); Math.random = mulberry32(SEED * 31 + r);
    const tr = new Track(Math.floor(rng() * 1e6), null, sizes[r % 3], mundos[r % mundos.length]), g = drawGates(6, rng);
    const L = repartir(rng).slice(0, 5);
    const hs = L.map((x, i) => new Horse(tr, B[x.slot], { id: i, form: HP[x.pers] * (0.93 + rng() * 0.14), lane: laneOffset(g[i], 6) }));
    const me = new Horse(tr, red, { id: 5, form: 0.93 + rng() * 0.14, lane: laneOffset(g[5], 6) });
    let borrada = false; // `laps` va en fracciones de vuelta
    me.piloto = (h, others) => {
      const grid = visionGrid(h, others), x = h.inputs(others.length);
      if (v.canal !== undefined) grid.fill(0, v.canal * C, (v.canal + 1) * C);
      const sc = v.numeros ? ESCALARES.map(() => 0) : ESCALARES.map(i => x[i]);
      if ((v.borra && v.borra(h.ticks)) || (v.vuelta2 && h.laps >= 1 && !borrada)) { h.mem.fill(0); borrada = borrada || !!v.vuelta2; }
      return einsteinStep(red, grid, sc, h.mem);
    };
    hs.push(me);
    const max = FPS * 90; let k = 0;
    while (k < max && !hs.every(h => h.finished)) { k++; stepRace(hs); for (const h of hs) if (!h.finished && h.laps >= tr.laps) { h.finished = true; h.finishTick = h.ticks; } }
    const rk = h => h.finished ? h.finishTick : 1e9 - h.total, place = hs.filter(o => rk(o) < rk(me)).length;
    if (place === 0) t.gana++;
    if (place < 3) t.podio++;
    if (me.finished) { t.tiempo += me.finishTick / FPS; t.llegan++; }
    for (const k2 of ['falls', 'stumbles', 'mudHits', 'jumps', 'dodges', 'hitsGiven']) t[k2] += me[k2];
  }
  out[nombre] = { gana: +(t.gana / N * 100).toFixed(1), podio: +(t.podio / N * 100).toFixed(1), tiempo: +(t.tiempo / Math.max(1, t.llegan)).toFixed(2), llegan: +(t.llegan / N * 100).toFixed(0) };
  for (const k2 of ['falls', 'stumbles', 'mudHits', 'jumps', 'dodges', 'hitsGiven']) out[nombre][k2] = +(t[k2] / N).toFixed(2);
  console.log(nombre, JSON.stringify(out[nombre]));
}
