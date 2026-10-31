// entrenador.js — Entrena el caballo de un jugador en un hilo aparte (worker_threads) para no
// frenar las carreras. Recibe lo que pide trainHorse (evolucion.js) y avisa cómo va cada generación.

const { parentPort, workerData } = require('worker_threads');
const { trainHorse } = require('./evolucion');

const result = trainHorse({ ...workerData, rng: Math.random, onProgress: done => parentPort.postMessage({ progress: done }) });
parentPort.postMessage({ result });
