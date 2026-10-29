// entrenar.js — Neuroevolución con obstáculos a partir del campeón entrenado en Python.
// Uso: node entrenar.js [generaciones]
// Genera caballos.json con los 6 mejores cerebros (cada uno será un caballo).

const fs = require('fs');
const path = require('path');
const { Track, Horse, cloneBrain, mutateBrain, mulberry32, FPS } = require('./sim');

const GENERATIONS = parseInt(process.argv[2] || '40', 10);
const POP = 40;
const ELITE = 8;
const TRACKS_PER_GEN = 4;
const MAX_TICKS = FPS * 40;
const LAPS = 2;

const rng = mulberry32(12345);
const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'campeon_original.json'), 'utf8'));

function evaluate(brain, tracks) {
  let score = 0;
  for (const tr of tracks) {
    const h = new Horse(tr, brain);
    while (h.ticks < MAX_TICKS && h.laps < LAPS) h.update();
    // Avanzar mucho y rápido, sin tropezar ni salirse
    score += h.total + (h.laps >= LAPS ? 20000 / h.ticks : 0) - h.stumbles * 15 - h.falls * 40 + h.jumps * 5;
  }
  return score / tracks.length;
}

let population = [cloneBrain(base)];
while (population.length < POP) population.push(mutateBrain(base, 0.15 + rng() * 0.3, rng));

let ranked = [];
for (let g = 1; g <= GENERATIONS; g++) {
  const tracks = Array.from({ length: TRACKS_PER_GEN }, () => new Track(Math.floor(rng() * 1e6), 6 + Math.floor(rng() * 6)));
  ranked = population.map(b => ({ b, s: evaluate(b, tracks) })).sort((a, b) => b.s - a.s);
  console.log(`gen ${g}  mejor ${ranked[0].s.toFixed(1)}  media ${(ranked.reduce((a, r) => a + r.s, 0) / POP).toFixed(1)}`);
  const elite = ranked.slice(0, ELITE).map(r => r.b);
  population = elite.slice();
  while (population.length < POP) {
    const parent = elite[Math.floor(rng() * ELITE)];
    population.push(mutateBrain(parent, 0.05 + rng() * 0.2, rng));
  }
}

// Evaluación final en pistas nuevas para elegir 6 caballos distintos
const test = Array.from({ length: 10 }, (_, i) => new Track(900000 + i, 8));
const finals = population.map(b => ({ b, s: evaluate(b, test) })).sort((a, b) => b.s - a.s);
const chosen = [];
for (const f of finals) {
  // Evitar clones exactos para que cada caballo tenga "personalidad"
  if (chosen.some(c => JSON.stringify(c.b) === JSON.stringify(f.b))) continue;
  chosen.push(f);
  if (chosen.length === 6) break;
}
fs.writeFileSync(path.join(__dirname, 'caballos.json'), JSON.stringify(chosen.map(c => c.b)));
console.log('Guardado caballos.json:', chosen.map(c => c.s.toFixed(1)).join(', '));
