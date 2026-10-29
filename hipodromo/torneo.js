// torneo.js — Evalúa a los 6 caballos del juego en muchas carreras (sin jugadores)
// y guarda logs/torneo.csv para analisis.ipynb.
// Uso: node torneo.js [carreras] [prob_poder]
//   prob_poder: probabilidad de que en cada carrera se lance un poder al azar (modo caos).

const fs = require('fs');
const path = require('path');
const { Track, Horse, stepRace, drawGates, laneOffset, mulberry32, FPS, SIZES } = require('./sim');
const { HORSES, POWERS, loadBrains, loadHandicap, applyPower } = require('./establo');

const RACES = parseInt(process.argv[2] || '400', 10);
const POWER_PROB = parseFloat(process.argv[3] || '0.7');
const rng = mulberry32(2026);
// Los efectos aleatorios internos (vendas, choques) usan Math.random; lo fijamos para reproducibilidad
Math.random = mulberry32(99);

const brains = loadBrains(() => {});
const handicap = loadHandicap();
const sizes = Object.keys(SIZES);
const powerKeys = Object.keys(POWERS);

const rows = [];
for (let r = 1; r <= RACES; r++) {
  const seed = Math.floor(rng() * 1e6);
  const size = sizes[Math.floor(rng() * sizes.length)];
  const track = new Track(seed, null, size);
  const forms = HORSES.map(() => +(0.93 + rng() * 0.14).toFixed(3));
  const gates = drawGates(HORSES.length, rng);
  const horses = HORSES.map((_, i) => new Horse(track, brains[i], { id: i, form: forms[i] * handicap[i], lane: laneOffset(gates[i], HORSES.length) }));

  // Modo caos: un poder al azar sobre un caballo al azar en un momento al azar
  let power = null, powerHorse = -1, powerTick = -1;
  if (rng() < POWER_PROB) {
    power = powerKeys[Math.floor(rng() * powerKeys.length)];
    powerHorse = Math.floor(rng() * HORSES.length);
    powerTick = Math.floor(FPS * (3 + rng() * 15));
  }

  const maxTicks = FPS * 90;
  let tick = 0, blocked = false;
  while (tick < maxTicks && !horses.every(h => h.finished)) {
    tick++;
    if (tick === powerTick && !horses[powerHorse].finished) blocked = !!applyPower(horses, track, powerHorse, power).blocked;
    stepRace(horses);
    for (const h of horses) {
      if (!h.finished && h.laps >= track.laps) { h.finished = true; h.finishTick = h.ticks; }
    }
  }

  const order = horses.map((h, i) => i).sort((a, b) => {
    const A = horses[a], B = horses[b];
    if (A.finished && B.finished) return A.finishTick - B.finishTick;
    if (A.finished !== B.finished) return A.finished ? -1 : 1;
    return B.total - A.total;
  });
  horses.forEach((h, i) => {
    const place = order.indexOf(i) + 1;
    rows.push({
      carrera: r, seed, tamano: size, largo_pista: Math.round(track.length), vueltas: track.laps,
      obstaculos: track.obstacles.filter(o => o.type === 'valla').length,
      caballo: i + 1, nombre: HORSES[i].name, perfil: HORSES[i].perfil, estilo: HORSES[i].estilo, color: HORSES[i].color, forma: forms[i], handicap: handicap[i], carril: gates[i] + 1,
      puesto: place, gano: place === 1, terminado: h.finished,
      tiempo_s: h.finished ? +(h.finishTick / FPS).toFixed(2) : '',
      progreso_pct: +Math.min(100, h.laps / track.laps * 100).toFixed(2),
      golpes_dados: h.hitsGiven, golpes_recibidos: h.hitsTaken,
      tropiezos: h.stumbles, saltos: h.jumps, salidas: h.falls,
      poder_recibido: i === powerHorse ? power : 'ninguno',
      poder_bloqueado: i === powerHorse ? blocked : '',
      poder_en_carrera: power || 'ninguno',
    });
  });
  if (r % 50 === 0) console.log(`carrera ${r}/${RACES}`);
}

const cols = Object.keys(rows[0]);
const csv = [cols.join(',')].concat(rows.map(row => cols.map(c => row[c]).join(','))).join('\n');
const out = path.join(__dirname, 'logs', 'torneo.csv');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, csv + '\n');

// Resumen rápido en consola
console.log('\nCaballo       estilo    victorias  golpes/carrera  tropiezos  salidas');
HORSES.forEach((h, i) => {
  const mine = rows.filter(r => r.caballo === i + 1);
  const m = k => (mine.reduce((a, r) => a + r[k], 0) / mine.length).toFixed(2);
  console.log(`${h.name.padEnd(13)} ${h.estilo.padEnd(9)} ${String(mine.filter(r => r.gano).length).padStart(9)}  ${m('golpes_dados').padStart(14)}  ${m('tropiezos').padStart(9)}  ${m('salidas').padStart(7)}`);
});
console.log(`\nGuardado ${path.relative(__dirname, out)} (${rows.length} filas)`);
