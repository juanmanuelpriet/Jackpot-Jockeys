// Graba lo que ve Einstein y lo que haría su maestro. node gen.js <salida> <carreras por mundo> <semilla> [red.json]
// Sin red conduce el maestro; con red conduce Einstein y el maestro dice qué habría hecho (DAgger).
// Escribe <salida>.vis (la cuadrícula, un byte por celda: valor × 250) y <salida>.bin (carrera, escalares y la acción del maestro).
const H = require('path').join(__dirname, '../../') + '/', fs = require('fs');
const { Track, Horse, stepRace, drawGates, laneOffset, mulberry32, FPS, MUNDOS, visionGrid, einsteinStep, ESCALARES } = require(H + 'sim');
const { repartir, loadPerfiles, loadHandicapPers } = require(H + 'establo');
const { einstein: maestro } = require('./maestro');
const [out, Ns, seedS, netf] = process.argv.slice(2), N = +Ns, seed = +seedS;
const B = loadPerfiles(), HP = loadHandicapPers(), net = netf ? JSON.parse(fs.readFileSync(netf)) : null;
const sizes = ['corta', 'media', 'larga'], rng = mulberry32(seed); Math.random = mulberry32(seed + 1);
const vis = [], rows = []; let race = 0, T = 0, n = 0, fa = 0, st = 0, w = 0, nr = 0;
for (const wd of Object.keys(MUNDOS)) for (let r = 0; r < N; r++) {
  const tr = new Track(Math.floor(rng() * 1e6), null, sizes[r % 3], wd), solo = r % 3 === 0, g = drawGates(6, rng); race++;
  const me = new Horse(tr, B['corredor.1'], { id: 5, form: 0.93 + rng() * 0.14, lane: solo ? 0 : laneOffset(g[5], 6) });
  const L = repartir(rng).slice(0, 5);
  const hs = solo ? [me] : [...L.map((x, i) => new Horse(tr, B[x.slot], { id: i, form: HP[x.pers] * (0.93 + rng() * 0.14), lane: laneOffset(g[i], 6) })), me];
  me.piloto = (h, others) => {
    const grid = visionGrid(h, others), x = h.inputs(others.length), sc = ESCALARES.map(i => x[i]), a = maestro(h);
    vis.push(Uint8Array.from(grid, v => Math.round(v * 250))); rows.push(race, ...sc, a[0], a[1]);
    return net ? einsteinStep(net, grid, sc, h.mem) : a;
  };
  const max = FPS * 90; let t = 0;
  while (t < max && !hs.every(h => h.finished)) { t++; stepRace(hs); for (const h of hs) if (!h.finished && h.laps >= tr.laps) { h.finished = true; h.finishTick = h.ticks; } }
  if (solo) { T += (me.finished ? me.finishTick : max) / FPS; n++; fa += me.falls; st += me.stumbles; }
  else { nr++; const rk = h => h.finished ? h.finishTick : 1e9 - h.total; if (hs.every(o => o === me || rk(me) <= rk(o))) w++; }
}
fs.writeFileSync(out + '.vis', Buffer.concat(vis.map(v => Buffer.from(v.buffer))));
fs.writeFileSync(out + '.bin', Buffer.from(new Float32Array(rows).buffer));
console.log(JSON.stringify({ muestras: rows.length / 11, soloT: +(T / n).toFixed(2), salidas: +(fa / n).toFixed(2), tropiezos: +(st / n).toFixed(2), ganaContraLaCasa: +(w / nr * 100).toFixed(1) }));
