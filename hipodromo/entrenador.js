// entrenador.js — Entrena el caballo de un jugador en un hilo aparte (worker_threads)
// para no frenar las carreras. Recibe { brain, focus, form, rivals, rivalForm } y devuelve
// el mejor cerebro de una neuroevolución corta más un resumen de antes y después.

const { parentPort, workerData } = require('worker_threads');
const { Track } = require('./sim');
const { makeFitness, evolve, evaluate } = require('./evolucion');

const FOCUS = {
  velocidad: makeFitness({ hit: 0, taken: 10, fall: 40, place: 120 }),
  agresion: makeFitness({ hit: 140, taken: 20, fall: 60, place: 60 }),
  control: makeFitness({ hit: 0, taken: 10, fall: 150, stumble: 60, place: 60 }),
};

const { brain, focus, form, rivals, rivalForm } = workerData;
const rng = Math.random;
const opts = { fitness: FOCUS[focus], rivals, rivalForm, form, rng };

// Medición en las mismas pistas antes y después, contra los corredores de la casa
const test = ['corta', 'media', 'larga'].flatMap(s => [1, 2].map(() => new Track(Math.floor(Math.random() * 1e6), null, s)));
const measure = b => {
  const st = evaluate([b, b, b], test, { ...opts, fitness: makeFitness({ place: 1, fall: 0, stumble: 0, jump: 0, taken: 0 }) });
  const m = k => +(st.reduce((a, s) => a + s[k], 0) / st.length).toFixed(2);
  return { golpes: m('hits'), salidas: m('falls'), tropiezos: m('stumbles') };
};

const antes = measure(brain);
const population = evolve({ ...opts, seeds: [brain], generations: 10, pop: 15, elite: 4, tracksPerGen: 2, exploreEnv: focus === 'agresion' });
// Elegimos con pistas nuevas para no premiar la suerte de una pista
const final = evaluate(population, test, opts).map((s, i) => ({ s: s.s, b: population[i] })).sort((a, b) => b.s - a.s)[0];
const despues = measure(final.b);
parentPort.postMessage({ brain: final.b, summary: { antes, despues } });
