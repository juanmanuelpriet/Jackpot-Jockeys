// evolucion.js — Núcleo de la neuroevolución multi-caballo. Lo usan entrenar.js (consola)
// y el entrenamiento de los caballos de los jugadores dentro del juego (entrenador.js).

const { Track, Horse, stepRace, drawGates, laneOffset, mulberry32, upgradeBrain, cloneBrain, mutateBrain, FPS } = require('./sim');

const SIZES = ['corta', 'media', 'larga'];

// Aptitud: avanzar, terminar rápido (cada tick ahorrado vale un punto), saltar, no tropezar
// ni salirse. `hit` premia cada embestida dada (máx. 8), `taken` castiga las recibidas y
// `place` premia cada rival que deja atrás en la llegada (para que un bravo también quiera ganar).
function makeFitness({ hit = 0, taken = 10, fall = 40, stumble = 15, jump = 5, place = 0 } = {}) {
  return (h, finishBonus, beaten = 0) => h.total + finishBonus - h.stumbles * stumble - h.falls * fall
    + h.jumps * jump + Math.min(h.hitsGiven, 8) * hit - h.hitsTaken * taken + beaten * place;
}

// Corre una carrera y devuelve los caballos con sus estadísticas
function race(track, brains, forms, rng, traits = []) {
  const gates = drawGates(brains.length, rng);
  const horses = brains.map((b, i) => new Horse(track, b, { id: i, form: forms[i], ...traits[i], lane: laneOffset(gates[i], brains.length) }));
  const maxTicks = FPS * (track.size === 'larga' ? 80 : 60);
  let tick = 0;
  while (tick < maxTicks && !horses.every(h => h.finished)) {
    tick++;
    stepRace(horses);
    for (const h of horses) if (!h.finished && h.laps >= track.laps) { h.finished = true; h.finishTick = h.ticks; }
  }
  return { horses, maxTicks };
}

// Evalúa una población en grupos de 6 (completando con rivales fijos si los hay)
function evaluate(population, tracks, opts) {
  const { fitness, rivals = [], form = 1, agility = 1, power = 1, rivalForm = 1, heat = 6, rng } = opts;
  const perHeat = rivals.length ? Math.max(1, heat - rivals.length) : heat;
  const stats = population.map(() => ({ s: 0, progress: 0, hits: 0, taken: 0, stumbles: 0, falls: 0, jumps: 0, time: 0, beaten: 0 }));
  for (const tr of tracks) {
    const order = population.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (let k = 0; k < order.length; k += perHeat) {
      const group = order.slice(k, k + perHeat);
      const brains = [...group.map(i => population[i]), ...rivals];
      const forms = brains.map((_, j) => j < group.length ? form : rivalForm);
      const { horses, maxTicks } = race(tr, brains, forms, rng, brains.map((_, j) => j < group.length ? { agility, power } : {}));
      const rank = h => h.finished ? h.finishTick : maxTicks * 10 - h.total;
      horses.slice(0, group.length).forEach((h, j) => {
        const st = stats[group[j]], n = tracks.length;
        const beaten = horses.filter(o => o !== h && rank(o) > rank(h)).length;
        st.s += fitness(h, h.finished ? maxTicks - h.finishTick : 0, beaten) / n;
        st.progress += h.laps / tr.laps * 100 / n;
        st.hits += h.hitsGiven / n; st.taken += h.hitsTaken / n;
        st.stumbles += h.stumbles / n; st.falls += h.falls / n; st.jumps += h.jumps / n;
        st.time += (h.finished ? h.finishTick : maxTicks) / FPS / n; st.beaten += beaten / n;
      });
    }
  }
  return stats;
}

// Evoluciona a partir de `seeds`. Llama a onGeneration(g, ranked, tracks) en cada generación.
function evolve(opts) {
  const { seeds, generations, rng, pop = 36, elite = 8, tracksPerGen = 3, exploreEnv = false, envNoise = 1.5, mutation = [0.05, 0.25], onGeneration } = opts;
  const base = seeds.map(upgradeBrain);
  let population = base.map(cloneBrain);
  while (population.length < pop) population.push(mutateBrain(base[population.length % base.length], 0.1 + rng() * 0.3, rng));
  let ranked = [];
  for (let g = 1; g <= generations; g++) {
    const seed = Math.floor(rng() * 1e6);
    const tracks = Array.from({ length: tracksPerGen }, (_, k) => new Track(seed + k, null, SIZES[(g + k) % SIZES.length]));
    const stats = evaluate(population, tracks, opts);
    ranked = population.map((b, i) => ({ b, ...stats[i] })).sort((a, b) => b.s - a.s);
    if (onGeneration) onGeneration(g, ranked, tracks, seed);
    const parents = ranked.slice(0, elite).map(r => r.b);
    population = parents.map(cloneBrain);
    while (population.length < pop) {
      const child = mutateBrain(parents[Math.floor(rng() * parents.length)], mutation[0] + rng() * (mutation[1] - mutation[0]), rng);
      // Exploración extra en las entradas del entorno (filas 5 a 12: rival, efectos, barro y puesto)
      if (exploreEnv) for (let r = 5; r < child[0].W.length; r++) child[0].W[r] = child[0].W[r].map(w => w + (rng() - 0.5) * envNoise);
      population.push(child);
    }
  }
  return population;
}

// Elige los `n` mejores cerebros distintos en pistas nuevas
function pickBest(population, n, opts, testSeed = 900000) {
  const test = SIZES.flatMap((s, k) => [0, 1, 2].map(i => new Track(testSeed + k * 10 + i, null, s)));
  const stats = evaluate(population, test, opts);
  const finals = population.map((b, i) => ({ b, s: stats[i].s, stats: stats[i] })).sort((a, b) => b.s - a.s);
  const chosen = [];
  for (const f of finals) {
    if (chosen.some(c => JSON.stringify(c.b) === JSON.stringify(f.b))) continue;
    chosen.push(f);
    if (chosen.length === n) break;
  }
  return chosen;
}

// ─── Entrenamiento de los potros de los jugadores ───
//
// Los caballos ya corren casi al tope que permite la física y con pocas generaciones el cerebro solo
// cambia al azar (medido: el rasgo entrenado mejoraba 1 de cada 2 veces). Por eso cada entrenamiento:
//   1. Sube un poco el cuerpo (velocidad, giro o fuerza): es lo que el cerebro no puede cambiar.
//   2. Reentrena el cerebro con ese cuerpo muchas generaciones, premiando solo ese rasgo.
//   3. Presenta un examen en pistas nuevas contra el caballo de antes, con las mismas pistas y la misma
//      suerte. Solo se queda con lo aprendido si el rasgo mejoró más que el ruido y no corre mucho peor.
const TRAIN_GENERATIONS = 60;
const EXAM_TRACKS = 36;
const MAX_WORSE_PLACE = 0.3; // rivales que puede dejar de ganarle por carrera a cambio del rasgo
const FOCUS = {
  velocidad: { trait: 'speed', step: 0.015, max: 0.06, stat: s => s.time, better: -1, fitness: (h, fb, beaten) => fb * 3 - h.falls * 30 - h.stumbles * 15 - h.hitsTaken * 5 + beaten * 40 },
  agresion: { trait: 'power', step: 0.1, max: 0.4, stat: s => s.hits, better: 1, envNoise: 0.5, fitness: (h, fb, beaten) => h.hitsGiven * 150 + fb - h.falls * 40 + beaten * 30 },
  control: { trait: 'agility', step: 0.05, max: 0.2, stat: s => s.falls + s.stumbles, better: -1, fitness: (h, fb, beaten) => -h.falls * 300 - h.stumbles * 150 + fb + beaten * 30 },
};

// Convierte el cuerpo del caballo en lo que necesita la carrera (0 = sin entrenar)
const bodyOpts = (body = {}, form = 1) => ({ form: form * (1 + (body.speed || 0)), agility: 1 + (body.agility || 0), power: 1 + (body.power || 0) });

// Examen: cada pista la corre primero un caballo y luego el otro, con las mismas salidas y la misma suerte
function exam(brains, optsList, focus, tracks) {
  const realRandom = Math.random, { stat, better } = FOCUS[focus];
  const results = brains.map((b, k) => tracks.map((tr, t) => {
    Math.random = mulberry32(t * 31 + 1);
    return evaluate([b, b, b], [tr], { ...optsList[k], rng: mulberry32(t * 17 + 3) });
  }));
  Math.random = realRandom;
  const average = (k, f) => results[k].reduce((a, st) => a + st.reduce((x, s) => x + f(s), 0) / st.length, 0) / tracks.length;
  const deltas = tracks.map((_, t) => {
    const per = k => results[k][t].reduce((x, s) => x + stat(s), 0) / results[k][t].length;
    return (per(1) - per(0)) * better;
  });
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const sd = Math.sqrt(deltas.reduce((a, d) => a + (d - mean) ** 2, 0) / (deltas.length - 1));
  return { mean, se: sd / Math.sqrt(deltas.length), antes: average(0, stat), despues: average(1, stat), placeDelta: average(1, s => s.beaten) - average(0, s => s.beaten) };
}

// Devuelve { brain, body, improved, summary: { antes, despues } }. rng decide las mutaciones y las pistas.
function trainHorse({ brain, body = {}, focus, form = 1, rivals, rivalForm = 1, rng, onProgress }) {
  const f = FOCUS[focus];
  const nextBody = { ...body, [f.trait]: Math.min(f.max, (body[f.trait] || 0) + f.step) };
  const newTrack = size => new Track(Math.floor(rng() * 1e6), null, size);
  const base = { fitness: f.fitness, rivals, rivalForm, rng };
  const before = { ...base, ...bodyOpts(body, form) }, after = { ...base, ...bodyOpts(nextBody, form) };

  const population = evolve({ ...after, seeds: [brain], generations: TRAIN_GENERATIONS, pop: 24, elite: 6, tracksPerGen: 3,
    exploreEnv: !!f.envNoise, envNoise: f.envNoise, onGeneration: g => onProgress && onProgress(g) });
  // Los mejores (y el cerebro de antes con el cuerpo nuevo) se comparan en pistas que no vieron
  const finalists = [upgradeBrain(brain), ...population.slice(0, 6)];
  const check = SIZES.flatMap(s => Array.from({ length: 6 }, () => newTrack(s)));
  const best = evaluate(finalists, check, after).map((s, i) => ({ s: s.s, b: finalists[i] })).sort((a, b) => b.s - a.s)[0].b;

  const tracks = Array.from({ length: EXAM_TRACKS }, (_, i) => newTrack(SIZES[i % SIZES.length]));
  const e = exam([brain, best], [before, after], focus, tracks);
  const improved = e.mean > e.se / 2 && e.placeDelta > -MAX_WORSE_PLACE;
  return { brain: best, body: nextBody, improved, summary: { antes: +e.antes.toFixed(2), despues: +e.despues.toFixed(2) } };
}

module.exports = { makeFitness, evaluate, evolve, pickBest, trainHorse, bodyOpts, exam, FOCUS, TRAIN_GENERATIONS, SIZES };
