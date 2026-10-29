// cuotasWorker.js — Simula una carrera muchas veces en un hilo aparte para estimar quién gana.
// Recibe { seed, size, brains, forms, gates, sims } y devuelve { wins, sims, ms }.

const { parentPort, workerData } = require('worker_threads');
const { Track, Horse, stepRace, laneOffset, FPS } = require('./sim');

const { seed, size, brains, forms, gates, sims } = workerData;
const t0 = Date.now();
const track = new Track(seed, null, size);
const n = brains.length;
const wins = new Array(n).fill(0);

for (let s = 0; s < sims; s++) {
  // Un poco de ruido en la forma: el día de la carrera nunca es idéntico a la simulación
  const horses = brains.map((b, i) => new Horse(track, b, {
    id: i, form: forms[i] * (0.97 + Math.random() * 0.06), lane: laneOffset(gates[i], n),
  }));
  let tick = 0, winner = null;
  while (tick < FPS * 120 && winner === null) {
    tick++;
    stepRace(horses);
    for (const h of horses) if (h.laps >= track.laps) { winner = h.id; break; }
  }
  if (winner === null) winner = horses.slice().sort((a, b) => b.total - a.total)[0].id;
  wins[winner]++;
}
parentPort.postMessage({ wins, sims, ms: Date.now() - t0 });
