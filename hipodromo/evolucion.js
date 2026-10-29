// evolucion.js — Núcleo de la neuroevolución multi-caballo. Lo usan entrenar.js (consola)
// y el entrenamiento de los caballos de los jugadores dentro del juego (entrenador.js).

const { Track, Horse, stepRace, drawGates, laneOffset, upgradeBrain, cloneBrain, mutateBrain, FPS } = require('./sim');

const SIZES = ['corta', 'media', 'larga'];

// Aptitud: avanzar, terminar rápido (cada tick ahorrado vale un punto), saltar, no tropezar
// ni salirse. `hit` premia cada embestida dada (máx. 8), `taken` castiga las recibidas y
// `place` premia cada rival que deja atrás en la llegada (para que un bravo también quiera ganar).
function makeFitness({ hit = 0, taken = 10, fall = 40, stumble = 15, jump = 5, place = 0 } = {}) {
  return (h, finishBonus, beaten = 0) => h.total + finishBonus - h.stumbles * stumble - h.falls * fall
    + h.jumps * jump + Math.min(h.hitsGiven, 8) * hit - h.hitsTaken * taken + beaten * place;
}

// Corre una carrera y devuelve los caballos con sus estadísticas
function race(track, brains, forms, rng) {
  const gates = drawGates(brains.length, rng);
  const horses = brains.map((b, i) => new Horse(track, b, { id: i, form: forms[i], lane: laneOffset(gates[i], brains.length) }));
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
  const { fitness, rivals = [], form = 1, rivalForm = 1, heat = 6, rng } = opts;
  const perHeat = rivals.length ? Math.max(1, heat - rivals.length) : heat;
  const stats = population.map(() => ({ s: 0, progress: 0, hits: 0, taken: 0, stumbles: 0, falls: 0, jumps: 0 }));
  for (const tr of tracks) {
    const order = population.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (let k = 0; k < order.length; k += perHeat) {
      const group = order.slice(k, k + perHeat);
      const brains = [...group.map(i => population[i]), ...rivals];
      const forms = brains.map((_, j) => j < group.length ? form : rivalForm);
      const { horses, maxTicks } = race(tr, brains, forms, rng);
      const rank = h => h.finished ? h.finishTick : maxTicks * 10 - h.total;
      horses.slice(0, group.length).forEach((h, j) => {
        const st = stats[group[j]], n = tracks.length;
        const beaten = horses.filter(o => o !== h && rank(o) > rank(h)).length;
        st.s += fitness(h, h.finished ? maxTicks - h.finishTick : 0, beaten) / n;
        st.progress += h.laps / tr.laps * 100 / n;
        st.hits += h.hitsGiven / n; st.taken += h.hitsTaken / n;
        st.stumbles += h.stumbles / n; st.falls += h.falls / n; st.jumps += h.jumps / n;
      });
    }
  }
  return stats;
}

// Evoluciona a partir de `seeds`. Llama a onGeneration(g, ranked, tracks) en cada generación.
function evolve(opts) {
  const { seeds, generations, rng, pop = 36, elite = 8, tracksPerGen = 3, exploreEnv = false, onGeneration } = opts;
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
      const child = mutateBrain(parents[Math.floor(rng() * parents.length)], 0.05 + rng() * 0.2, rng);
      // Exploración extra en las entradas del entorno (filas 5 a 12: rival, efectos, barro y puesto)
      if (exploreEnv) for (let r = 5; r < child[0].W.length; r++) child[0].W[r] = child[0].W[r].map(w => w + (rng() - 0.5) * 1.5);
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

module.exports = { makeFitness, evaluate, evolve, pickBest, SIZES };
