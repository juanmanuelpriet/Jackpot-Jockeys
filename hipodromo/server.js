// server.js — Jackpot Jockeys: carreras de caballos con redes neuronales, multijugador.
// Una pantalla grande muestra la carrera; cada jugador apuesta y lanza poderes desde su celular.
// Sin dependencias: node server.js

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Track, Horse, stepRace, drawGates, laneOffset, FPS } = require('./sim');
const { HORSES, POWERS, loadBrains, loadHandicap, applyPower } = require('./establo');
const { say, quip } = require('./narrador');

const PORT = parseInt(process.env.PORT || '3000', 10);
const BET_SECONDS = 30;
const RESULT_SECONDS = 12;
const MAX_RACE_SECONDS = 120;
const START_COINS = 1000;
const RESCUE_COINS = 200;
const POWER_COOLDOWN_MS = 4000;
const PLAYERS_FILE = path.join(__dirname, 'jugadores.json');

const TRACK_SIZES = ['corta', 'media', 'media', 'larga'];


// ─── Cerebros ───────────────────────────────────────

const BRAINS = loadBrains();
const HANDICAP = loadHandicap();

// ─── Estado del juego ───────────────────────────────

const players = new Map();
try {
  for (const p of JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'))) {
    players.set(p.id, { ...p, bets: {}, cooldownUntil: 0 });
  }
} catch { /* primera vez */ }

function savePlayers() {
  const list = [...players.values()].map(({ id, name, coins, wins }) => ({ id, name, coins, wins }));
  fs.writeFile(PLAYERS_FILE, JSON.stringify(list), () => {});
}

const game = {
  phase: 'apuestas',
  phaseEnds: null,      // null = esperando jugadores
  raceNum: 0,
  track: null,
  horses: [],
  forms: [],
  carry: 0,             // pozo acumulado de carreras sin ganador
  powerSpend: 0,
  results: null,
  history: [],          // ganadores anteriores
  log: [],
  tick: 0,
};

function addLog(text) {
  game.log.push({ t: Date.now(), text });
  if (game.log.length > 30) game.log.shift();
}

// Comentarios del narrador: los de color se espacian para que se alcancen a leer
let lastColor = 0;
function narrate(kind, vars, important = true) {
  const now = Date.now();
  if (!important && now - lastColor < 2600) return;
  if (!important) lastColor = now;
  addLog(say(kind, vars));
}

function newRace() {
  game.raceNum++;
  const size = TRACK_SIZES[Math.floor(Math.random() * TRACK_SIZES.length)];
  game.track = new Track(Math.floor(Math.random() * 1e6), null, size);
  game.forms = HORSES.map(() => +(0.93 + Math.random() * 0.14).toFixed(3));
  // Sorteo de cajones: cada carrera los caballos salen de carriles distintos
  game.gates = drawGates(HORSES.length);
  game.horses = HORSES.map((_, i) => new Horse(game.track, BRAINS[i % BRAINS.length], {
    id: i, form: game.forms[i] * HANDICAP[i], lane: laneOffset(game.gates[i], HORSES.length),
  }));
  game.powerSpend = 0;
  game.results = null;
  game.tick = 0;
  for (const p of players.values()) {
    p.bets = {};
    if (p.coins < 50) { p.coins += RESCUE_COINS; addLog(`${p.name} recibe ${RESCUE_COINS} fichas de rescate. La casa es generosa (a veces).`); }
  }
  game.phase = 'apuestas';
  game.phaseEnds = players.size > 0 ? Date.now() + BET_SECONDS * 1000 : null;
  game.leader = null;
  narrate('apuestas', { n: game.raceNum, s: size });
}

function betTotals() {
  const per = HORSES.map(() => 0);
  for (const p of players.values()) for (const [h, a] of Object.entries(p.bets)) per[h] += a;
  return per;
}

function pot() {
  return betTotals().reduce((a, b) => a + b, 0) + game.powerSpend + game.carry;
}

function startRace() {
  game.phase = 'carrera';
  game.phaseEnds = Date.now() + MAX_RACE_SECONDS * 1000;
  narrate('salida');
}

function standings() {
  return game.horses
    .map((h, i) => ({ i, finished: h.finished, finishTick: h.finishTick, total: h.total }))
    .sort((a, b) => {
      if (a.finished && b.finished) return a.finishTick - b.finishTick;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.total - a.total;
    })
    .map(s => s.i);
}

function finishRace() {
  const order = standings();
  const winner = order[0];
  const totals = betTotals();
  const prize = pot();
  const payouts = [];
  if (totals[winner] > 0) {
    for (const p of players.values()) {
      const stake = p.bets[winner] || 0;
      if (!stake) continue;
      const win = Math.floor(prize * stake / totals[winner]);
      p.coins += win;
      p.wins = (p.wins || 0) + 1;
      payouts.push({ name: p.name, id: p.id, stake, win });
    }
    game.carry = 0;
    narrate('reparto', { h: HORSES[winner].name });
  } else {
    game.carry = prize;
    if (prize > 0) narrate('jackpot', { h: HORSES[winner].name });
  }
  payouts.sort((a, b) => b.win - a.win);
  game.results = {
    order,
    times: order.map(i => game.horses[i].finished ? +(game.horses[i].finishTick / FPS).toFixed(2) : null),
    winner, prize, payouts, jackpot: totals[winner] > 0 ? 0 : prize,
    hits: game.horses.map(h => h.hitsGiven),
  };
  const t = game.results.times;
  game.results.quip = quip(t[1] != null && t[0] != null ? t[1] - t[0] : null, t[1] != null && t[0] != null ? t[1] - t[0] : 99);
  game.history.unshift(winner);
  game.history.length = Math.min(game.history.length, 10);
  game.phase = 'resultados';
  game.phaseEnds = Date.now() + RESULT_SECONDS * 1000;
  savePlayers();
}

// ─── Bucle de simulación ────────────────────────────

function step() {
  const now = Date.now();
  if (game.phase === 'apuestas') {
    if (game.phaseEnds === null && players.size > 0) game.phaseEnds = now + BET_SECONDS * 1000;
    if (game.phaseEnds !== null && now >= game.phaseEnds) startRace();
  } else if (game.phase === 'carrera') {
    game.tick++;
    const before = game.horses.map(h => [h.falls, h.stumbles, h.jumps]);
    for (const ev of stepRace(game.horses)) {
      narrate('embestida', { a: HORSES[ev.attacker].name, v: HORSES[ev.victim].name }, false);
    }
    game.horses.forEach((h, i) => {
      const name = HORSES[i].name;
      if (h.falls > before[i][0]) narrate('salida_pista', { h: name }, false);
      else if (h.stumbles > before[i][1]) narrate('tropiezo', { h: name }, false);
      else if (h.jumps > before[i][2] && Math.random() < 0.3) narrate('salto', { h: name }, false);
    });
    // Cambio de líder (después de los primeros segundos)
    const leader = standings()[0];
    if (game.tick > FPS * 4 && leader !== game.leader && game.leader != null) narrate('punta', { h: HORSES[leader].name }, false);
    game.leader = leader;
    for (const h of game.horses) {
      if (h.finished) continue;
      if (h.laps >= game.track.laps) {
        h.finished = true;
        h.finishTick = h.ticks;
        const place = game.horses.filter(x => x.finished).length;
        if (place === 1) narrate('meta', { h: HORSES[h.id].name });
      }
    }
    if (game.horses.every(h => h.finished) || now >= game.phaseEnds) finishRace();
    broadcastScreens({ type: 'pos', h: horsePositions() });
  } else if (game.phase === 'resultados') {
    if (now >= game.phaseEnds) newRace();
  }
}

function horsePositions() {
  return game.horses.map(h => [
    Math.round(h.x * 10) / 10, Math.round(h.y * 10) / 10, Math.round(h.angle * 100) / 100,
    Math.round(h.speed * 10) / 10,
    (h.fx.boost > 0 ? 1 : 0) | (h.fx.blind > 0 ? 2 : 0) | (h.fx.freeze > 0 ? 4 : 0) |
    (h.fx.shield > 0 ? 8 : 0) | (h.fx.stun > 0 ? 16 : 0) | (h.fx.jump > 0 ? 32 : 0) | (h.finished ? 64 : 0) |
    (h.fx.rage > 0 ? 128 : 0) | (h.fx.hit > 0 ? 256 : 0),
    h.sensors.map(s => Math.round(s * 100) / 100),
  ]);
}

// ─── Estado público ─────────────────────────────────

function publicState() {
  const totals = betTotals();
  const total = totals.reduce((a, b) => a + b, 0) + game.powerSpend + game.carry;
  const order = game.phase === 'apuestas' ? null : standings();
  return {
    type: 'state',
    phase: game.phase,
    timeLeft: game.phaseEnds ? Math.max(0, Math.ceil((game.phaseEnds - Date.now()) / 1000)) : null,
    raceNum: game.raceNum,
    laps: game.track.laps,
    trackSize: game.track.size,
    trackLength: Math.round(game.track.length),
    pot: total,
    carry: game.carry,
    horses: HORSES.map((h, i) => ({
      name: h.name, color: h.color, perfil: h.perfil, estilo: h.estilo, gate: game.gates[i] + 1, form: game.forms[i],
      hits: game.horses[i].hitsGiven,
      bets: totals[i],
      odds: totals[i] > 0 ? +(total / totals[i]).toFixed(2) : null,
      lap: Math.min(game.track.laps, Math.floor(game.horses[i].laps) + 1),
      pos: order ? order.indexOf(i) + 1 : null,
      wins: game.history.filter(w => w === i).length,
    })),
    results: game.results,
    history: game.history,
    log: game.log.slice(-8),
    players: [...players.values()]
      .map(p => ({ name: p.name, coins: p.coins, bet: Object.values(p.bets).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.coins - a.coins),
    powers: Object.fromEntries(Object.entries(POWERS).map(([k, p]) => [k, { name: p.name, cost: p.cost, desc: p.desc, debuff: p.debuff, icon: p.icon }])),
  };
}

// ─── Server-Sent Events ─────────────────────────────

const screens = new Set();
const phones = new Map(); // res → playerId

function send(res, obj) { res.write(`data: ${JSON.stringify(obj)}\n\n`); }
function broadcastScreens(obj) { for (const r of screens) send(r, obj); }
function broadcastState() {
  const st = publicState();
  for (const r of screens) send(r, st);
  for (const [r, id] of phones) {
    const p = players.get(id);
    send(r, { ...st, me: p ? { id: p.id, name: p.name, coins: p.coins, bets: p.bets, cooldown: Math.max(0, p.cooldownUntil - Date.now()) } : null });
  }
}

// ─── Acciones de jugadores ──────────────────────────

const actions = {
  join({ id, name }) {
    name = String(name || '').trim().slice(0, 16);
    let p = id && players.get(id);
    if (p) { if (name) p.name = name; return { me: p }; }
    if (!name) return { error: 'Escribe tu nombre' };
    p = { id: crypto.randomUUID(), name, coins: START_COINS, wins: 0, bets: {}, cooldownUntil: 0 };
    players.set(p.id, p);
    addLog(`${name} llegó al hipódromo con 1000 fichas y mucha fe.`);
    savePlayers();
    return { me: p };
  },

  bet({ id, horse, amount }) {
    const p = players.get(id);
    if (!p) return { error: 'Jugador no encontrado' };
    if (game.phase !== 'apuestas') return { error: 'Las apuestas están cerradas' };
    horse = parseInt(horse, 10); amount = parseInt(amount, 10);
    if (!(horse >= 0 && horse < HORSES.length)) return { error: 'Caballo inválido' };
    if (!(amount > 0)) return { error: 'Monto inválido' };
    if (amount > p.coins) return { error: 'No tienes suficientes fichas' };
    p.coins -= amount;
    p.bets[horse] = (p.bets[horse] || 0) + amount;
    addLog(`${p.name} apuesta ${amount} a ${HORSES[horse].name}.`);
    return { me: p };
  },

  power({ id, power, horse }) {
    const p = players.get(id);
    const pw = POWERS[power];
    if (!p) return { error: 'Jugador no encontrado' };
    if (!pw) return { error: 'Poder inválido' };
    if (game.phase !== 'carrera') return { error: 'Solo durante la carrera' };
    horse = parseInt(horse, 10);
    const h = game.horses[horse];
    if (!h) return { error: 'Caballo inválido' };
    if (h.finished) return { error: 'Ese caballo ya llegó a la meta' };
    if (Date.now() < p.cooldownUntil) return { error: 'Espera un momento…' };
    if (p.coins < pw.cost) return { error: 'No tienes suficientes fichas' };
    p.coins -= pw.cost;
    game.powerSpend += pw.cost; // lo gastado en poderes engorda el pozo
    p.cooldownUntil = Date.now() + POWER_COOLDOWN_MS;
    const out = applyPower(game.horses, game.track, horse, power);
    narrate(out.blocked ? 'bloqueado' : power, { p: p.name, h: HORSES[horse].name });
    if (out.obstacle) broadcastScreens({ type: 'obst', o: out.obstacle });
    broadcastScreens({ type: 'fx', horse, power });
    return { me: p };
  },

  start(_, req) {
    if (game.phase === 'apuestas') {
      console.log(`Arranque manual de la carrera ${game.raceNum} desde ${req.socket.remoteAddress} (${req.headers['user-agent'] || '?'})`);
      startRace();
    }
    return {};
  },
};

// ─── HTTP ───────────────────────────────────────────

function lanIP() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return 'localhost';
}

const STATIC = {
  '/': 'pantalla.html',
  '/pantalla': 'pantalla.html',
  '/cel': 'cel.html',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 1000\n\n');
    if (url.searchParams.get('role') === 'screen') {
      screens.add(res);
      req.on('close', () => screens.delete(res));
    } else {
      phones.set(res, url.searchParams.get('id'));
      req.on('close', () => phones.delete(res));
    }
    broadcastState();
    return;
  }

  if (url.pathname === '/api/track') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ raceNum: game.raceNum, track: game.track, horses: HORSES, gates: game.gates, joinUrl: `http://${lanIP()}:${PORT}/cel` }));
    return;
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    const action = actions[url.pathname.slice(5)];
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy(); });
    req.on('end', () => {
      let out;
      try { out = action ? action(JSON.parse(body || '{}'), req) : { error: 'Acción desconocida' }; }
      catch { out = { error: 'Petición inválida' }; }
      if (out.me) out.me = { id: out.me.id, name: out.me.name, coins: out.me.coins, bets: out.me.bets };
      res.writeHead(out.error ? 400 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
      broadcastState();
    });
    return;
  }

  const file = STATIC[url.pathname];
  if (file) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(__dirname, 'public', file)).pipe(res);
    return;
  }
  res.writeHead(404); res.end('No encontrado');
});

newRace();
setInterval(step, 1000 / FPS);
setInterval(broadcastState, 400);

server.listen(PORT, () => {
  console.log(`\n🏇 Jackpot Jockeys listo`);
  console.log(`   Pantalla grande: http://localhost:${PORT}`);
  console.log(`   Celulares:       http://${lanIP()}:${PORT}/cel  (misma red WiFi)\n`);
});
