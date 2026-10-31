// entrenar.js — Neuroevolución multi-caballo con obstáculos, choques y pistas aleatorias.
// Uso: node entrenar.js <perfil> [generaciones] [premio_por_embestida] [velocidad] [premio_por_puesto]
//   perfil "corredor": premia avanzar rápido, saltar y no tropezar ni ser embestido.
//   perfil "bravo":    lo mismo que el corredor, pero cada embestida suma puntos (caos).
//                      El premio por embestida (por defecto 100) define su agresividad.
//   velocidad:         multiplicador con el que corre mientras entrena (por defecto 1). Sirve
//                      para que un caballo con hándicap alto aprenda a controlar esa velocidad.
//   premio_por_puesto: puntos por cada rival que deja atrás en la llegada (por defecto 0).
// Guarda los 3 mejores cerebros en caballos_<nombre>.json y el registro de cada
// generación en logs/entrenamiento_<nombre>.csv (para analisis.ipynb), donde
// <nombre> es "corredor" o "bravo_<premio>".

const fs = require('fs');
const path = require('path');
const { mulberry32 } = require('./sim');
const { makeFitness, evolve, pickBest, WORLDS } = require('./evolucion');

const PROFILE = process.argv[2] || 'corredor';
const GENERATIONS = parseInt(process.argv[3] || '150', 10);
const HIT_REWARD = parseInt(process.argv[4] || '100', 10);
const SPEED = parseFloat(process.argv[5] || '1');
const PLACE_REWARD = parseInt(process.argv[6] || '0', 10);
const NAME = PROFILE === 'bravo' ? `bravo_${HIT_REWARD}` : PROFILE;
if (!['corredor', 'bravo'].includes(PROFILE)) { console.error('Perfil desconocido: usa "corredor" o "bravo"'); process.exit(1); }

const fitness = PROFILE === 'bravo'
  ? makeFitness({ hit: HIT_REWARD, taken: 20, fall: 60, place: PLACE_REWARD })
  : makeFitness({ hit: 0, taken: 10, fall: 40, place: PLACE_REWARD });
const rng = mulberry32(PROFILE === 'bravo' ? 777 + HIT_REWARD : 12345);
const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const exists = f => fs.existsSync(path.join(__dirname, f));

// Punto de partida: los caballos ya entrenados, o el campeón de Python
const seedFile = [`caballos_${NAME}.json`, 'caballos.json', 'campeon_original.json'].find(exists);
const seedData = read(seedFile);
const seeds = Array.isArray(seedData[0]) ? seedData : [seedData];
console.log(`Semillas desde ${seedFile}`);

// Los bravos entrenan contra corredores ya entrenados (como en el juego), a la velocidad
// que tienen en el juego con su hándicap, así no aprenden a embestirse solo entre ellos
const rivals = PROFILE === 'bravo' && exists('caballos_corredor.json') ? read('caballos_corredor.json') : [];
let rivalForm = 1;
if (rivals.length && exists('handicap.json')) {
  const h = read('handicap.json');
  const { HORSES } = require('./establo');
  const vals = HORSES.filter(x => x.perfil === 'corredor').map(x => h[x.name]).filter(Boolean);
  if (vals.length) rivalForm = vals.reduce((a, b) => a + b, 0) / vals.length;
}
const opts = { fitness, rivals, rivalForm, form: SPEED, rng };

const logDir = path.join(__dirname, 'logs');
fs.mkdirSync(logDir, { recursive: true });
const logPath = path.join(logDir, `entrenamiento_${NAME}.csv`);
const log = fs.createWriteStream(logPath);
log.write('perfil,premio_golpe,velocidad,generation,seed,track_size,track_length,best_fitness,avg_fitness,avg_progress,avg_hits_given,avg_hits_taken,avg_stumbles,avg_falls,avg_jumps,best_hits_given,weights_json\n');

const avg = (arr, k) => arr.reduce((a, s) => a + s[k], 0) / arr.length;
const population = evolve({
  // Cada generación corre una pista de cada mundo. Mutaciones suaves: ya saben correr y no deben olvidarlo
  ...opts, seeds, generations: GENERATIONS, tracksPerGen: WORLDS.length, mutation: [0.02, 0.15],
  onGeneration(g, ranked, tracks, seed) {
    const best = ranked[0];
    log.write([PROFILE, PROFILE === 'bravo' ? HIT_REWARD : 0, SPEED, g, seed, tracks[0].size, Math.round(tracks[0].length),
      best.s.toFixed(2), avg(ranked, 's').toFixed(2), avg(ranked, 'progress').toFixed(2), avg(ranked, 'hits').toFixed(3),
      avg(ranked, 'taken').toFixed(3), avg(ranked, 'stumbles').toFixed(3), avg(ranked, 'falls').toFixed(3), avg(ranked, 'jumps').toFixed(3),
      best.hits.toFixed(2), `"${JSON.stringify(best.b).replace(/"/g, '""')}"`].join(',') + '\n');
    if (g % 10 === 0 || g === 1) {
      console.log(`[${NAME}] gen ${g}  mejor ${best.s.toFixed(1)}  media ${avg(ranked, 's').toFixed(1)}  ` +
        `golpes ${avg(ranked, 'hits').toFixed(2)}  tropiezos ${avg(ranked, 'stumbles').toFixed(2)}  salidas ${avg(ranked, 'falls').toFixed(2)}`);
    }
  },
});
log.end();

const chosen = pickBest(population, 3, opts);
fs.writeFileSync(path.join(__dirname, `caballos_${NAME}.json`), JSON.stringify(chosen.map(c => c.b)));
console.log(`Guardado caballos_${NAME}.json (${chosen.map(c => c.s.toFixed(1)).join(', ')}) y ${path.relative(__dirname, logPath)}`);
