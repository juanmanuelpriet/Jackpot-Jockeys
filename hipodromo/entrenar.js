// entrenar.js — Neuroevolución multi-caballo con obstáculos, choques y pistas de varios largos.
// Uso: node entrenar.js <perfil> [generaciones] [premio_por_embestida]
//   perfil "corredor": premia avanzar rápido, saltar y no tropezar ni ser embestido.
//   perfil "bravo":    lo mismo que el corredor, pero cada embestida suma puntos (caos).
//                      El premio por embestida (por defecto 100) define su agresividad.
// Guarda los 3 mejores cerebros en caballos_<nombre>.json y el registro de cada
// generación en logs/entrenamiento_<nombre>.csv (para analisis.ipynb), donde
// <nombre> es "corredor" o "bravo_<premio>".

const fs = require('fs');
const path = require('path');
const { Track, Horse, stepRace, drawGates, laneOffset, upgradeBrain, cloneBrain, mutateBrain, mulberry32, FPS } = require('./sim');

const PROFILE = process.argv[2] || 'corredor';
const GENERATIONS = parseInt(process.argv[3] || '150', 10);
const HIT_REWARD = parseInt(process.argv[4] || '100', 10);
const NAME = PROFILE === 'bravo' ? `bravo_${HIT_REWARD}` : PROFILE;
const POP = 36;          // 6 grupos de 6 caballos por pista
const HEAT = 6;
const ELITE = 8;
const TRACKS_PER_GEN = 3;
const SIZES = ['corta', 'media', 'larga'];

const FITNESS = {
  corredor: (h, finishBonus) => h.total + finishBonus - h.stumbles * 15 - h.falls * 40 + h.jumps * 5 - h.hitsTaken * 10,
  bravo: (h, finishBonus) => h.total + finishBonus - h.stumbles * 15 - h.falls * 60 + Math.min(h.hitsGiven, 8) * HIT_REWARD - h.hitsTaken * 20,
};
if (!FITNESS[PROFILE]) { console.error('Perfil desconocido: usa "corredor" o "bravo"'); process.exit(1); }

const rng = mulberry32(PROFILE === 'bravo' ? 777 + HIT_REWARD : 12345);

// Punto de partida: los caballos ya entrenados, o el campeón de Python
function loadSeeds() {
  for (const f of [`caballos_${NAME}.json`, 'caballos.json', 'campeon_original.json']) {
    const p = path.join(__dirname, f);
    if (!fs.existsSync(p)) continue;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    console.log(`Semillas desde ${f}`);
    return (Array.isArray(data[0]) ? data : [data]).map(upgradeBrain);
  }
}
const seeds = loadSeeds();

// Los bravos entrenan contra corredores ya entrenados (como en el juego), así no
// aprenden a embestirse solo entre ellos
const RIVALS = PROFILE === 'bravo' && fs.existsSync(path.join(__dirname, 'caballos_corredor.json'))
  ? JSON.parse(fs.readFileSync(path.join(__dirname, 'caballos_corredor.json'), 'utf8'))
  : [];
const PER_HEAT = RIVALS.length ? HEAT - RIVALS.length : HEAT;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Corre una carrera con un grupo de cerebros y devuelve las estadísticas de cada uno
function race(track, brains) {
  const gates = drawGates(brains.length, rng);
  const horses = brains.map((b, i) => new Horse(track, b, { id: i, lane: laneOffset(gates[i], brains.length) }));
  const maxTicks = FPS * (track.size === 'larga' ? 80 : 60);
  let tick = 0;
  while (tick < maxTicks && !horses.every(h => h.finished)) {
    tick++;
    stepRace(horses);
    for (const h of horses) {
      if (!h.finished && h.laps >= track.laps) { h.finished = true; h.finishTick = h.ticks; }
    }
  }
  return { horses, maxTicks };
}

function evaluate(population, tracks) {
  const stats = population.map(() => ({ s: 0, progress: 0, hits: 0, taken: 0, stumbles: 0, falls: 0, jumps: 0 }));
  for (const tr of tracks) {
    const order = shuffle(population.map((_, i) => i));
    for (let k = 0; k < order.length; k += PER_HEAT) {
      const group = order.slice(k, k + PER_HEAT);
      const { horses, maxTicks } = race(tr, [...group.map(i => population[i]), ...RIVALS]);
      horses.slice(0, group.length).forEach((h, j) => {
        const st = stats[group[j]];
        // Cada tick ahorrado vale un punto: la velocidad pesa tanto como avanzar
        const finishBonus = h.finished ? maxTicks - h.finishTick : 0;
        st.s += FITNESS[PROFILE](h, finishBonus) / tracks.length;
        st.progress += h.laps / tr.laps * 100 / tracks.length;
        st.hits += h.hitsGiven / tracks.length;
        st.taken += h.hitsTaken / tracks.length;
        st.stumbles += h.stumbles / tracks.length;
        st.falls += h.falls / tracks.length;
        st.jumps += h.jumps / tracks.length;
      });
    }
  }
  return stats;
}

let population = [];
for (const s of seeds) population.push(cloneBrain(s));
while (population.length < POP) population.push(mutateBrain(seeds[population.length % seeds.length], 0.1 + rng() * 0.3, rng));

const logDir = path.join(__dirname, 'logs');
fs.mkdirSync(logDir, { recursive: true });
const logPath = path.join(logDir, `entrenamiento_${NAME}.csv`);
const log = fs.createWriteStream(logPath);
log.write('perfil,premio_golpe,generation,seed,track_size,track_length,best_fitness,avg_fitness,avg_progress,avg_hits_given,avg_hits_taken,avg_stumbles,avg_falls,avg_jumps,best_hits_given,weights_json\n');

const avg = (arr, k) => arr.reduce((a, s) => a + s[k], 0) / arr.length;
let ranked = [];
for (let g = 1; g <= GENERATIONS; g++) {
  const seed = Math.floor(rng() * 1e6);
  const size = SIZES[g % SIZES.length];
  const tracks = Array.from({ length: TRACKS_PER_GEN }, (_, k) => new Track(seed + k, null, SIZES[(g + k) % SIZES.length]));
  const stats = evaluate(population, tracks);
  ranked = population.map((b, i) => ({ b, ...stats[i] })).sort((a, b) => b.s - a.s);
  const best = ranked[0];
  log.write([PROFILE, PROFILE === 'bravo' ? HIT_REWARD : 0, g, seed, size, Math.round(tracks[0].length), best.s.toFixed(2), avg(ranked, 's').toFixed(2),
    avg(ranked, 'progress').toFixed(2), avg(ranked, 'hits').toFixed(3), avg(ranked, 'taken').toFixed(3),
    avg(ranked, 'stumbles').toFixed(3), avg(ranked, 'falls').toFixed(3), avg(ranked, 'jumps').toFixed(3),
    best.hits.toFixed(2), `"${JSON.stringify(best.b).replace(/"/g, '""')}"`].join(',') + '\n');
  if (g % 10 === 0 || g === 1) {
    console.log(`[${NAME}] gen ${g}  mejor ${best.s.toFixed(1)}  media ${avg(ranked, 's').toFixed(1)}  ` +
      `golpes ${avg(ranked, 'hits').toFixed(2)}  tropiezos ${avg(ranked, 'stumbles').toFixed(2)}  salidas ${avg(ranked, 'falls').toFixed(2)}`);
  }
  const elite = ranked.slice(0, ELITE).map(r => r.b);
  population = elite.map(cloneBrain);
  while (population.length < POP) {
    const parent = elite[Math.floor(rng() * ELITE)];
    const child = mutateBrain(parent, 0.05 + rng() * 0.2, rng);
    // Los bravos exploran más fuerte las entradas del entorno (filas 5 a 12 de la primera capa:
    // rival, efectos, barro y puesto)
    if (PROFILE === 'bravo') {
      for (let r = 5; r < child[0].W.length; r++) child[0].W[r] = child[0].W[r].map(w => w + (rng() - 0.5) * 1.5);
    }
    population.push(child);
  }
}
log.end();

// Evaluación final en pistas nuevas para elegir 3 caballos distintos
const test = SIZES.flatMap((s, k) => [0, 1, 2].map(i => new Track(900000 + k * 10 + i, null, s)));
const finalStats = evaluate(population, test);
const finals = population.map((b, i) => ({ b, s: finalStats[i].s })).sort((a, b) => b.s - a.s);
const chosen = [];
for (const f of finals) {
  // Evitar clones exactos para que cada caballo tenga "personalidad"
  if (chosen.some(c => JSON.stringify(c.b) === JSON.stringify(f.b))) continue;
  chosen.push(f);
  if (chosen.length === 3) break;
}
fs.writeFileSync(path.join(__dirname, `caballos_${NAME}.json`), JSON.stringify(chosen.map(c => c.b)));
console.log(`Guardado caballos_${NAME}.json (${chosen.map(c => c.s.toFixed(1)).join(', ')}) y ${path.relative(__dirname, logPath)}`);
