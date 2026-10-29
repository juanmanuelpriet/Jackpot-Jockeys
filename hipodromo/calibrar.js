// calibrar.js — Hándicap: ajusta un multiplicador de velocidad por caballo para que,
// al arrancar, todos tengan la misma probabilidad de ganar (como en las carreras
// con hándicap de los hipódromos reales, donde el mejor caballo carga más peso).
// Uso: node calibrar.js [iteraciones] [carreras_por_iteracion]
// Guarda handicap.json, que usan server.js y torneo.js.

const fs = require('fs');
const path = require('path');
const { Track, Horse, stepRace, drawGates, laneOffset, mulberry32, FPS, SIZES } = require('./sim');
const { HORSES, loadBrains, loadHandicap } = require('./establo');

const ITER = parseInt(process.argv[2] || '8', 10);
const RACES = parseInt(process.argv[3] || '300', 10);
const brains = loadBrains(() => {});
const sizes = Object.keys(SIZES);
const n = HORSES.length;

function winRates(handicap, rng) {
  const wins = new Array(n).fill(0);
  for (let r = 0; r < RACES; r++) {
    const track = new Track(Math.floor(rng() * 1e6), null, sizes[r % sizes.length]);
    const gates = drawGates(n, rng);
    const horses = HORSES.map((_, i) => new Horse(track, brains[i], {
      id: i, form: (0.93 + rng() * 0.14) * handicap[i], lane: laneOffset(gates[i], n),
    }));
    let tick = 0;
    while (tick < FPS * 120 && !horses.some(h => h.finished)) {
      tick++;
      stepRace(horses);
      for (const h of horses) if (!h.finished && h.laps >= track.laps) { h.finished = true; h.finishTick = h.ticks; }
    }
    const first = horses.filter(h => h.finished).sort((a, b) => a.finishTick - b.finishTick)[0]
      || horses.slice().sort((a, b) => b.total - a.total)[0];
    wins[first.id]++;
  }
  return wins.map(w => w / RACES);
}

// Arranca desde el hándicap guardado (si existe) para converger más rápido
let handicap = loadHandicap();
const rng = mulberry32(4242);
for (let it = 1; it <= ITER; it++) {
  const p = winRates(handicap, rng);
  console.log(`iteración ${it}: ` + HORSES.map((h, i) => `${h.name} ${(p[i] * 100).toFixed(0)}% (x${handicap[i].toFixed(3)})`).join(' | '));
  // Subir al que gana poco, bajar al que gana mucho, con pasos pequeños
  handicap = handicap.map((h, i) => h * Math.pow((1 / n) / Math.max(p[i], 0.01), 0.07));
  const mean = handicap.reduce((a, b) => a + b, 0) / n;
  // Tope de 1.25: más rápido que eso, las redes (entrenadas a velocidad normal) no alcanzan a tomar las curvas
  handicap = handicap.map(h => Math.min(1.25, Math.max(0.7, h / mean)));
}
const out = Object.fromEntries(HORSES.map((h, i) => [h.name, +handicap[i].toFixed(4)]));
fs.writeFileSync(path.join(__dirname, 'handicap.json'), JSON.stringify(out, null, 2) + '\n');
console.log('Guardado handicap.json', out);
