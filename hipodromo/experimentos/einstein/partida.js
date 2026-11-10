// partida.js — Una partida de verdad con el código del juego (la sala de sala.js, sin pantalla ni jugadores) y Einstein
// en todas las carreras (JJ_EINSTEIN=1). La casa entrena el cuerpo cada 5 carreras como en server.js, y Einstein también.
// node partida.js <carreras> [red.json] [semilla]   APRENDIDOS=<perfiles_aprendidos.json> usa lo que la casa aprendió en una partida.
// Escribe una línea JSON: victorias de Einstein y de cada línea de la casa, su cuota media y cuánto había entrenado cada uno.
process.env.JJ_EINSTEIN = '1';
process.env.JJ_DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'jj-partida-'));
const H = require('path').join(__dirname, '../../') + '/', fs = require('fs');
const { mulberry32, FPS, SIM_SPEED } = require(H + 'sim');
const [Ns, redf, seedS] = process.argv.slice(2), N = +Ns;
Math.random = mulberry32(+(seedS || 1));
const sala = require(H + 'sala');
const { PLAN_CASA, BODY_STEP, RACES_PER_TRAINING } = require(H + 'establo');
if (redf) sala.setHouseBrain('einstein', JSON.parse(fs.readFileSync(redf)));
if (process.env.APRENDIDOS) for (const [slot, l] of Object.entries(JSON.parse(fs.readFileSync(process.env.APRENDIDOS)))) if (l.brain) sala.setHouseBrain(slot, l.brain);
// Igual que trainHouseBodies en server.js (sin el registro ni el archivo)
const cuerpos = {};
const hooks = {
  save() {}, saveWins() {},
  learn(room, entries) {
    for (const { slot, pers } of entries) {
      const l = cuerpos[slot] = cuerpos[slot] || { races: 0, trainings: 0, body: {} }, plan = PLAN_CASA[pers] || [];
      if (++l.races % RACES_PER_TRAINING || l.trainings >= plan.length) continue;
      const [k, s, max] = BODY_STEP[plan[l.trainings++]];
      l.body = { ...l.body, [k]: +Math.min(max, (l.body[k] || 0) + s).toFixed(3) };
      sala.setHouseBody(slot, l.body);
    }
  },
};
const room = new sala.Room('PRUEBA', new Map(), hooks), MAX = 200 * FPS * SIM_SPEED;
const tabla = {}, nota = (k, gano, prob) => { const t = tabla[k] = tabla[k] || { carreras: 0, gana: 0, prob: 0 }; t.carreras++; t.gana += gano; t.prob += prob; };
let podio = 0, salidas = 0, tropiezos = 0;
for (let r = 0; r < N; r++) {
  if (r) room.newRace();
  room.startRace();
  for (let t = 0; room.phase === 'carrera' && t < MAX; t++) room.step();
  if (room.phase === 'carrera') room.finishRace();
  const { order } = room.results;
  order.forEach((i, place) => {
    const h = room.lineup[i];
    nota(h.slot || h.name, +(place === 0), room.probs[i]);
    if (h.pers === 'einstein') { podio += place < 3; salidas += room.horses[i].falls; tropiezos += room.horses[i].stumbles; }
  });
}
const out = { carreras: N, red: redf || 'einstein.json', aprendidos: !!process.env.APRENDIDOS };
for (const [k, t] of Object.entries(tabla).sort((a, b) => b[1].gana / b[1].carreras - a[1].gana / a[1].carreras))
  out[k] = { carreras: t.carreras, gana: +(t.gana / t.carreras * 100).toFixed(1), cuotaProb: +(t.prob / t.carreras * 100).toFixed(1), cuerpo: cuerpos[k]?.body || {} };
out.einsteinPodio = +(podio / N * 100).toFixed(1); out.einsteinSalidas = +(salidas / N).toFixed(2); out.einsteinTropiezos = +(tropiezos / N).toFixed(2);
console.log(JSON.stringify(out));
fs.rmSync(process.env.JJ_DATA_DIR, { recursive: true, force: true });
