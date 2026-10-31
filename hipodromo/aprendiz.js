// aprendiz.js — Trabajo de los caballos de la casa en un hilo aparte (worker_threads) para no frenar
// el juego: repasar una carrera (learnFromRace) o medir cuánto gana cada uno para las cuotas (houseEdges).

const { parentPort, workerData } = require('worker_threads');
const { learnFromRace, houseEdges } = require('./evolucion');

parentPort.postMessage(workerData.edgesOf
  ? houseEdges(workerData.edgesOf, workerData.forms, workerData.races, Math.random)
  : learnFromRace({ ...workerData, rng: Math.random }));
