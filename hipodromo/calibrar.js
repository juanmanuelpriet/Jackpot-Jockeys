// calibrar.js — Hándicap: ajusta un multiplicador de velocidad por personalidad para que,
// al arrancar, todas tengan la misma probabilidad de ganar (como en las carreras
// con hándicap de los hipódromos reales, donde el mejor caballo carga más peso).
// Uso: node calibrar.js [iteraciones] [carreras_por_iteracion]. Con 0 iteraciones solo mide los mundos.
// Guarda handicap.json y cuotas_mundo.json, que usan server.js y torneo.js.

const fs = require('fs');
const path = require('path');
const { Track, Horse, stepRace, drawGates, laneOffset, mulberry32, FPS, SIZES, MUNDOS } = require('./sim');
const { PERSONALIDADES, repartir, loadPerfiles, loadHandicapPers } = require('./establo');

const ITER = parseInt(process.argv[2] || '8', 10);
const RACES = parseInt(process.argv[3] || '300', 10);
const brains = loadPerfiles();
const sizes = Object.keys(SIZES);
const n = 6;
const worlds = Object.keys(MUNDOS);
const pers = Object.keys(PERSONALIDADES);

// Victorias por caballo de cada personalidad, con un reparto al azar en cada carrera (como en el juego)
function winRates(handicap, rng, only = null, races = RACES) {
  const wins = Object.fromEntries(pers.map(k => [k, 0])), runs = { ...wins };
  for (let r = 0; r < races; r++) {
    const track = new Track(Math.floor(rng() * 1e6), null, sizes[r % sizes.length], only || worlds[r % worlds.length]);
    const gates = drawGates(n, rng), deal = repartir(rng);
    const horses = deal.map((h, i) => new Horse(track, brains[h.slot], {
      id: i, form: (0.93 + rng() * 0.14) * handicap[h.pers], lane: laneOffset(gates[i], n),
    }));
    let tick = 0;
    while (tick < FPS * 120 && !horses.some(h => h.finished)) {
      tick++;
      stepRace(horses);
      for (const h of horses) if (!h.finished && h.laps >= track.laps) { h.finished = true; h.finishTick = h.ticks; }
    }
    const first = horses.filter(h => h.finished).sort((a, b) => a.finishTick - b.finishTick)[0]
      || horses.slice().sort((a, b) => b.total - a.total)[0];
    wins[deal[first.id].pers]++;
    for (const h of deal) runs[h.pers]++;
  }
  return { wins, runs };
}

// Arranca desde el hándicap guardado (si existe) para converger más rápido
let handicap = Object.fromEntries(pers.map(k => [k, loadHandicapPers()[k] ?? 1]));
const rng = mulberry32(4242);
for (let it = 1; it <= ITER; it++) {
  const { wins, runs } = winRates(handicap, rng);
  const p = Object.fromEntries(pers.map(k => [k, wins[k] / runs[k]]));
  console.log(`iteración ${it}: ` + pers.map(k => `${k} ${(p[k] * 100).toFixed(0)}% (x${handicap[k].toFixed(3)})`).join(' | '));
  // Subir al que gana poco, bajar al que gana mucho, con pasos pequeños
  const next = pers.map(k => handicap[k] * Math.pow((1 / n) / Math.max(p[k], 0.01), 0.07));
  const mean = next.reduce((a, b) => a + b, 0) / pers.length;
  // Tope de 1.25: más rápido que eso, las redes (entrenadas a velocidad normal) no alcanzan a tomar las curvas
  pers.forEach((k, i) => { handicap[k] = Math.min(1.25, Math.max(0.7, next[i] / mean)); });
}
const out = Object.fromEntries(pers.map(k => [k, +handicap[k].toFixed(4)]));
fs.writeFileSync(path.join(__dirname, 'handicap.json'), JSON.stringify(out, null, 2) + '\n');
console.log('Guardado handicap.json', out);

// En cada mundo a unas personalidades les va mejor: las cuotas deben saberlo o apostarles siempre
// le ganaría a la casa. Suavizado para no exagerar con pocas carreras
const WORLD_RACES = RACES * 5, SMOOTH = 15;
const table = Object.fromEntries(worlds.map(w => {
  const { wins, runs } = winRates(handicap, rng, w, WORLD_RACES);
  const edge = Object.fromEntries(pers.map(k => [k, +((wins[k] + SMOOTH) / (runs[k] / n + SMOOTH)).toFixed(3)]));
  const mejor = pers.reduce((a, b) => edge[b] > edge[a] ? b : a);
  console.log(w.padEnd(10), JSON.stringify(edge), 'mejor', mejor);
  return [w, { edge, mejor }];
}));
fs.writeFileSync(path.join(__dirname, 'cuotas_mundo.json'), JSON.stringify(table, null, 2) + '\n');
console.log('Guardado cuotas_mundo.json');
