// entorno.js — Una carrera armada como la arma el juego (sala.js: newRace, buildLineup, houseEntry, placeHorses, tick),
// para entrenar y medir a Einstein en las mismas condiciones en que corre de verdad:
//  · tamaños con la misma probabilidad que el juego (la media sale el doble) y mundo al azar;
//  · 6 caballos: hasta 3 potros de jugadores y el resto de la casa, Einstein en lugar de uno de la casa;
//  · la casa con los cerebros de fábrica o con lo que aprendió en una partida (perfiles_aprendidos.json) y el cuerpo
//    entrenado según PLAN_CASA (la partida puede ir en cualquier punto: de 0 a 6 entrenamientos);
//  · potros con los cerebros y cuerpos de jugadores reales (jugadores.json) o los de fábrica;
//  · poderes de los jugadores durante la carrera (vendas, lazo, charco, rayo, furia…) y a veces el sabotaje de la mafia;
//  · el mismo final: meta tras las vueltas o el límite de 200 s de reloj del juego.
// Uso: const { carrera } = require('./entorno'); carrera(cerebro | 'maestro', semilla, { modo }) → resultado del asiento de Einstein.
// modo 'juego' (por defecto) es lo de arriba; 'fabrica' es el entorno viejo (5 de la casa de fábrica, sin cuerpos ni poderes).
const H = require('path').join(__dirname, '../../') + '/', fs = require('fs'), os = require('os'), path = require('path');
const { Track, Horse, stepRace, drawGates, laneOffset, mulberry32, FPS, SIM_SPEED, MUNDOS } = require(H + 'sim');
const { EINSTEIN, POWERS, POTROS, PLAN_CASA, BODY_STEP, repartir, loadPerfiles, loadColtBrain, loadHandicapPers, applyPower } = require(H + 'establo');
const { bodyOpts } = require(H + 'evolucion');
const maestro = require('./maestro').einstein;

const TRACK_SIZES = ['corta', 'media', 'media', 'larga'];      // como sala.js
const MAX_TICKS = Math.round(200 * FPS * SIM_SPEED);              // CFG.maxRaceSeconds a la velocidad del juego
const FABRICA = loadPerfiles(), HP = loadHandicapPers();
// Lo que la casa aprendió y los potros de los jugadores en la partida real, si existen (solo se leen)
const DATOS = process.env.JJ_DATOS_JUEGO || path.join(os.homedir(), 'Library', 'Application Support', 'Jackpot Jockeys');
const leer = f => { try { return JSON.parse(fs.readFileSync(path.join(DATOS, f), 'utf8')); } catch { return null; } };
const aprendido = leer('perfiles_aprendidos.json') || {};
const APRENDIDOS = Object.fromEntries(Object.entries(FABRICA).map(([k, b]) => [k, aprendido[k]?.brain || b]));
const POTROS_REALES = (leer('jugadores.json') || []).map(a => a.horse).filter(h => h?.brain);
const POTROS_FABRICA = Object.keys(POTROS).map(perfil => ({ perfil, brain: loadColtBrain(perfil) }));

// Cuerpo tras n entrenamientos del plan, como trainHouseBodies en server.js
function cuerpo(plan, n) {
  const b = {};
  for (const paso of plan.slice(0, n)) { const [k, s, max] = BODY_STEP[paso]; b[k] = +Math.min(max, (b[k] || 0) + s).toFixed(3); }
  return b;
}
const elige = (rng, pesos) => { let x = rng() * pesos.reduce((a, b) => a + b, 0); return pesos.findIndex(p => (x -= p) < 0); };

function armar(seat, seed, modo) {
  const rng = mulberry32(seed);
  Math.random = mulberry32(seed * 7 + 3);   // el azar de la física, fijo por carrera
  if (modo === 'fabrica') {
    const tr = new Track(Math.floor(rng() * 1e6), null, ['corta', 'media', 'larga'][seed % 3], Object.keys(MUNDOS)[seed % 6]), g = drawGates(6, rng);
    const hs = repartir(rng).slice(0, 5).map((x, i) => new Horse(tr, FABRICA[x.slot], { id: i, form: HP[x.pers] * (0.93 + rng() * 0.14), lane: laneOffset(g[i], 6) }));
    hs.push(new Horse(tr, seat.brain, { id: 5, form: seat.form * (0.93 + rng() * 0.14), lane: laneOffset(g[5], 6) }));
    return { tr, hs, me: hs[5], poderes: [] };
  }
  const mundos = Object.keys(MUNDOS);
  const tr = new Track(Math.floor(rng() * 1e6), null, TRACK_SIZES[Math.floor(rng() * 4)], mundos[Math.floor(rng() * mundos.length)]);
  const brains = rng() < 0.5 ? APRENDIDOS : FABRICA, edad = Math.floor(rng() * 7);   // en qué punto va la partida
  const entreno = () => Math.max(0, Math.min(6, edad + Math.floor(rng() * 3) - 1));
  const nPotros = elige(rng, [50, 25, 15, 10]);
  const lineup = [];
  for (let k = 0; k < nPotros; k++) {
    const real = POTROS_REALES.length && rng() < 0.7, p = real ? POTROS_REALES[Math.floor(rng() * POTROS_REALES.length)] : POTROS_FABRICA[Math.floor(rng() * POTROS_FABRICA.length)];
    const body = real ? p.body : cuerpo(PLAN_CASA[p.perfil === 'bravo' ? 'bravo' : 'corredor'], Math.floor(rng() * 4));
    lineup.push({ brain: p.brain, ...bodyOpts(body, POTROS[p.perfil].handicap) });
  }
  const casa = repartir(rng).sort(() => rng() - 0.5).slice(0, 6 - nPotros)
    .map(h => ({ brain: brains[h.slot], ...bodyOpts(cuerpo(PLAN_CASA[h.pers], entreno()), HP[h.pers] ?? 1) }));
  // Einstein entra en lugar del último de la casa, con su cuerpo entrenado igual que la casa
  casa[casa.length - 1] = { brain: seat.brain, yo: true, ...bodyOpts(cuerpo(PLAN_CASA.einstein, entreno()), seat.form) };
  const fila = [...casa, ...lineup].sort(() => rng() - 0.5), n = fila.length, g = drawGates(n, rng);
  const hs = fila.map((h, i) => new Horse(tr, h.brain, { id: i, form: (0.93 + rng() * 0.14) * h.form, agility: h.agility, power: h.power, lane: laneOffset(g[i], n) }));
  const me = hs[fila.findIndex(h => h.yo)];
  // Poderes de los jugadores: ninguno, pocos o muchos; los más baratos más seguido; los ataques van más al que va adelante
  const lam = [0, 3, 8][elige(rng, [30, 40, 30])], keys = Object.keys(POWERS), poderes = [];
  let t = 0;
  while (lam && (t += Math.round(-Math.log(rng() + 1e-9) * 60 * FPS / lam)) < 60 * FPS) poderes.push({ t: t + 2 * FPS, key: keys[elige(rng, keys.map(k => 1 / POWERS[k].cost))], r: rng() });
  if (rng() < 0.1) poderes.push({ t: Math.floor((3 + rng() * 40) * FPS), key: 'mafia', r: rng() });
  return { tr, hs, me, poderes };
}

function aplicar(hs, tr, p) {
  const vivos = hs.map((h, i) => i).filter(i => !hs[i].finished);
  if (!vivos.length) return;
  const debuff = p.key === 'mafia' || POWERS[p.key].debuff;
  // Orden por avance: el de adelante pesa 3 veces más como blanco de un ataque
  const orden = vivos.sort((a, b) => hs[b].total - hs[a].total), pesos = orden.map((_, k) => debuff ? 3 / (1 + k) : 1);
  let x = p.r * pesos.reduce((a, b) => a + b, 0), idx = orden[pesos.findIndex(w => (x -= w) < 0)];
  if (idx === undefined) idx = orden[0];
  if (p.key === 'mafia') { const h = hs[idx]; h.fx.freeze = Math.max(h.fx.freeze, Math.round(FPS * 2)); h.fx.blind = Math.max(h.fx.blind, Math.round(FPS * 3)); }
  else applyPower(hs, tr, idx, p.key);
}

// Corre una carrera con `cerebro` en el asiento de Einstein. form: hándicap del asiento (Einstein 1, como en el juego)
function carrera(cerebro, seed, { modo = 'juego', form = 1 } = {}) {
  const brain = cerebro === 'maestro' ? FABRICA['corredor.1'] : cerebro;
  const { tr, hs, me, poderes } = armar({ brain, form }, seed, modo);
  if (cerebro === 'maestro') me.piloto = h => maestro(h);
  let t = 0, k = 0;
  while (t < MAX_TICKS && !hs.every(h => h.finished)) {
    t++;
    while (k < poderes.length && poderes[k].t <= t) aplicar(hs, tr, poderes[k++]);
    stepRace(hs);
    for (const h of hs) if (!h.finished && h.laps >= tr.laps) { h.finished = true; h.finishTick = h.ticks; }
  }
  const rk = h => h.finished ? h.finishTick : 1e9 - h.total, place = hs.filter(o => rk(o) < rk(me)).length;
  return { n: hs.length, place, gana: +(place === 0), podio: +(place < 3), termina: +me.finished, mundo: tr.mundo, tam: tr.size,
    falls: me.falls, stumbles: me.stumbles, mudHits: me.mudHits, jumps: me.jumps, dodges: me.dodges, hitsGiven: me.hitsGiven, hitsTaken: me.hitsTaken };
}

module.exports = { carrera, MAX_TICKS, hayAprendidos: Object.keys(aprendido).length, potrosReales: POTROS_REALES.length };
