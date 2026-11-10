// server.js — Jackpot Jockeys: carreras de caballos con redes neuronales, multijugador.
// Cada pantalla grande crea una sala con código; los jugadores entran desde el celular.
// Sin dependencias: node server.js   (PUBLIC_URL=https://... para jugar por internet)

const http = require('http');
const fs = require('fs');
const zlib = require('zlib');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const { FPS, SIM_SPEED } = require('./sim');
const { analiza } = require('./vista');
const { HORSES, PERFILES, PERSONALIDADES, PLAN_CASA, BODY_STEP, RACES_PER_TRAINING, loadHandicapPers } = require('./establo');
const { Room, roomCode, setHandicap, setHouseBrain, setHouseEdge, setHouseBody, houseBrains, houseForms, houseTraits, WIN_RECORD } = require('./sala');
const ws = require('./websocket');

const PORT = parseInt(process.env.PORT || '3000', 10);
// Dentro de la app de escritorio las cuentas se guardan en la carpeta de datos del usuario
const ACCOUNTS_FILE = path.join(process.env.JJ_DATA_DIR || __dirname, 'jugadores.json');
const ROOM_IDLE_MS = 30 * 60 * 1000;

// ─── Cuentas (persisten entre partidas: nombre, caballo propio y trofeos) ───

const accounts = new Map();
try {
  for (const a of JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'))) {
    if (!a || !a.id) continue; // una entrada dañada no debe borrar las demás cuentas
    accounts.set(a.id, { id: a.id, name: a.name, horse: a.horse || null, trophies: a.trophies || [], skins: a.skins || ['normal'] });
  }
} catch { /* primera vez */ }

let saveTimer = null;
function saveAccounts() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const list = [...accounts.values()].map(a => ({ ...a, horse: a.horse ? { ...a.horse, training: null, trainQueued: false, sitOut: null } : null }));
    fs.writeFile(ACCOUNTS_FILE, JSON.stringify(list), () => {});
  }, 300);
}

// ─── Entrenamiento de caballos de jugadores en hilos aparte ───

// Practica contra un rival de cada estilo, como en el juego
const readBrains = f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const corredores = readBrains('caballos_corredor.json');
const trainingRivals = [corredores[0], readBrains('caballos_bravo_100.json')[0], corredores[1]];
function startTraining({ accountId, room, focus, brain, body, form }) {
  const worker = new Worker(path.join(__dirname, 'entrenador.js'), { workerData: { brain, body, focus, form, rivals: trainingRivals } });
  worker.on('message', m => {
    if (m.result) room.trainingDone(accountId, m.result);
    else room.trainingProgress(accountId, m.progress);
  });
  worker.once('error', err => {
    console.error('Error entrenando:', err);
    room.trainingDone(accountId, null);
  });
}

// ─── Los caballos de la casa aprenden de cada carrera, de uno en uno y en hilos aparte ───
// Lo aprendido se guarda aparte: los cerebros de fábrica no cambian y borrar el archivo los restaura.
// Se guarda por línea de personalidad, no por caballo. El archivo cambia de nombre con cada generación de redes: lo aprendido por las anteriores no les sirve.

const LEARNED_FILE = path.join(process.env.JJ_DATA_DIR || __dirname, 'perfiles_aprendidos.json');
let learned = {};
try { learned = JSON.parse(fs.readFileSync(LEARNED_FILE, 'utf8')); } catch { /* aún no han aprendido */ }
for (const [slot, l] of Object.entries(learned)) {
  if (l.brain) setHouseBrain(slot, l.brain);
  if (l.edge) setHouseEdge(slot, l.edge);
  if (l.body) setHouseBody(slot, l.body);
}
const saveLearned = () => fs.writeFile(LEARNED_FILE, JSON.stringify(learned), () => {});
const EDGE_RACES = 600;

let lessons = [], learning = false, edgesStale = false;
// Como los potros, cada línea de la casa entrena el cuerpo cada pocas carreras siguiendo el plan de su personalidad
// (experimentos/casa/cuerpo.js): el cerebro no cambia, así que no pierde su forma de correr.
function trainHouseBodies(room, entries) {
  for (const { slot, pers } of entries) {
    const l = learned[slot] = { ...learned[slot] }, plan = PLAN_CASA[pers] || [];
    l.races = (l.races || 0) + 1;
    const done = l.trainings || 0;
    if (l.races % RACES_PER_TRAINING || done >= plan.length) continue;
    const [trait, step, max] = BODY_STEP[plan[done]];
    l.body = { ...l.body, [trait]: +Math.min(max, (l.body?.[trait] || 0) + step).toFixed(3) };
    l.trainings = done + 1;
    setHouseBody(slot, l.body);
    edgesStale = true;
    const p = PERSONALIDADES[pers];
    room.addLog(`🏋️ La casa entrenó ${{ agresion: 'agresión' }[plan[done]] || plan[done]} a su línea ${p.icon} ${p.name} (${l.trainings}/${plan.length}).`);
  }
  saveLearned();
}

function learnFromRace(room, entries) {
  trainHouseBodies(room, entries);
  // La lección más nueva de cada línea; primero las que peor llegaron
  entries = entries.filter(e => !e.soloCuerpo);
  lessons = [...lessons.filter(l => !entries.some(e => e.slot === l.slot)), ...entries.map(e => ({ ...e, room }))].sort((a, b) => b.place - a.place);
  nextLesson();
}
function runLearner(workerData, onResult) {
  learning = true;
  const worker = new Worker(path.join(__dirname, 'aprendiz.js'), { workerData });
  const done = () => { learning = false; nextLesson(); };
  worker.once('message', r => { onResult(r); done(); });
  worker.once('error', err => { console.error('Error aprendiendo:', err); done(); });
}
function nextLesson() {
  if (learning) return;
  if (!lessons.length) {
    // Terminadas las lecciones, las cuotas se ponen al día con lo que aprendieron
    if (!edgesStale) return;
    edgesStale = false;
    return runLearner({ edgesOf: houseBrains(), forms: houseForms(), traits: houseTraits(), races: EDGE_RACES }, edges => {
      PERFILES.forEach(({ slot }, i) => {
        learned[slot] = { ...learned[slot], edge: edges[i] };
        setHouseEdge(slot, edges[i]);
      });
      saveLearned();
    });
  }
  const { room, name, slot, place, ...lesson } = lessons.shift();
  runLearner({ ...lesson, brain: learned[slot]?.brain || lesson.brain }, r => {
    if (!r.improved) return;
    learned[slot] = { ...learned[slot], brain: r.brain, lessons: (learned[slot]?.lessons || 0) + 1 };
    setHouseBrain(slot, r.brain);
    edgesStale = true;
    saveLearned();
    const p = PERSONALIDADES[lesson.pers];
    room.addLog(`🧠 La carrera de ${name} mejoró el perfil ${p.icon} ${p.name} (lección ${learned[slot].lessons}).`);
  });
}

// ─── Salas ───

const rooms = new Map();
// Victorias reales de cada línea y de cada potro: con ellas se ajustan las cuotas de una partida a otra
const WINS_FILE = path.join(process.env.JJ_DATA_DIR || __dirname, 'victorias.json');
try { Object.assign(WIN_RECORD, JSON.parse(fs.readFileSync(WINS_FILE, 'utf8'))); } catch { /* aún no hay carreras */ }
for (const h of HORSES) delete WIN_RECORD[h.name]; // historial de cuando se contaba por caballo de la casa
const saveWins = () => fs.writeFile(WINS_FILE, JSON.stringify(WIN_RECORD), () => {});

const hooks = { save: saveAccounts, train: startTraining, learn: learnFromRace, saveWins };

// ─── Jugar por internet: la pantalla abre o cierra el túnel, y cada pantalla ve en vivo cómo va y el QR nuevo ───
const tunel = require('./tunel');
tunel.puerto(PORT);
const internetMsg = room => {
  const st = tunel.estado();
  return { type: 'internet', ...st, joinUrl: `${st.fase === 'listo' ? st.url : `http://${lanIP()}:${PORT}`}/cel?sala=${room.code}` };
};
tunel.escuchar(() => { for (const room of rooms.values()) broadcastScreens(room, internetMsg(room)); });

function createRoom() {
  let code;
  do code = roomCode(); while (rooms.has(code));
  const room = new Room(code, accounts, hooks);
  rooms.set(code, room);
  return room;
}

// Dirección de esta computadora en la red local (la que va en el QR). Se prefieren las de una red casera
// y se evitan los adaptadores virtuales (Hyper-V, WSL, VirtualBox, VMware…), comunes en Windows.
function lanIP() {
  const virtual = /vethernet|virtualbox|vmware|wsl|hyper-v|docker|vbox|utun|bridge|loopback/i;
  const found = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) found.push({ name, ip: a.address });
  }
  const home = ip => /^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3;
  found.sort((a, b) => (virtual.test(a.name) - virtual.test(b.name)) || home(a.ip) - home(b.ip));
  return found.length ? found[0].ip : 'localhost';
}

function publicBase(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  // Detrás de un túnel o proxy, el Host recibido ya es el público
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  if (host && !/^(localhost|127\.|\[::1\])/.test(host)) return `${req.headers['x-forwarded-proto'] || 'http'}://${host}`;
  return `http://${lanIP()}:${PORT}`;
}

// ─── Server-Sent Events ───

// Cada conexión (WebSocket o, de respaldo, Server-Sent Events) es un objeto con send(texto)
function send(conn, obj) { conn.send(JSON.stringify(obj)); }
// Lo que ve Einstein (su cuadrícula, sus 8 números y su decisión) y su Grad-CAM del momento, 10 veces por segundo
function mandaVista(room) {
  const i = room.lineup.findIndex(h => h.pers === 'einstein'), h = room.horses[i];
  if (!h || room.phase !== 'carrera') return;
  h.vigia = true;
  if (!h.visto || room.tick % 3) return;
  const { grid, sc, mem } = h.visto, A = analiza(h.brain, grid, sc, mem), q = a => Array.from(a, v => Math.round(v * 100));
  h.visto = null;
  broadcastScreens(room, { type: 'vista', i, g: q(grid), giro: q(A.giro), gas: q(A.gas), mem: q(h.mem), sc: sc.map(v => +v.toFixed(2)), y: A.y.map(v => +v.toFixed(2)) });
}
function broadcastScreens(room, obj) { const text = JSON.stringify(obj); for (const c of room.screens) c.send(text); }

// Registra una conexión de pantalla o de celular en su sala
function attach(room, conn, params) {
  if (params.get('role') === 'screen') {
    room.screens.add(conn);
    conn.onClose(() => room.screens.delete(conn));
    send(conn, internetMsg(room));
  } else {
    room.phones.set(conn, params.get('id'));
    conn.onClose(() => room.phones.delete(conn));
    // Las acciones del celular viajan por la misma conexión: responde al instante, sin abrir
    // una petición nueva (mucho más rápido, sobre todo por internet)
    if (conn.onMessage) conn.onMessage(text => {
      let msg;
      try { msg = JSON.parse(text); } catch { return; }
      let out;
      try { out = handleAction(String(msg.action || ''), { ...msg, sala: room.code, id: params.get('id') }); }
      catch (e) { console.error(e); out = { error: 'Petición inválida' }; }
      conn.send(JSON.stringify({ type: 'reply', rid: msg.rid, ...out }));
    });
  }
  room.lastActive = Date.now();
  broadcastState(room);
}
// Datos que casi nunca cambian (precios, poderes, disfraces, reacciones): van solo la primera vez o
// cuando cambian, no en cada actualización. Así cada mensaje pesa bastante menos por datos móviles.
const STATIC_KEYS = ['cfg', 'powers', 'reactions'];

// Envía el estado a una conexión, sin la parte fija si ya la tiene y sin repetir un mensaje idéntico
function sendState(conn, st, staticText) {
  const msg = { ...st };
  if (conn.staticText === staticText) for (const k of STATIC_KEYS) delete msg[k];
  const text = JSON.stringify(msg);
  if (text === conn.lastText) return;
  conn.staticText = staticText; conn.lastText = text;
  conn.send(text);
}

// Pantallas 4 veces por segundo; celulares la mitad (y siempre justo después de una acción)
function broadcastState(room, phones = true) {
  const st = room.publicState();
  st.raceKey = room.raceKey;
  st.build = BUILD;
  const staticText = JSON.stringify(STATIC_KEYS.map(k => st[k]));
  for (const r of room.screens) sendState(r, st, staticText);
  if (phones) for (const [r, id] of room.phones) sendState(r, { ...st, me: room.meState(id) }, staticText);
}

// ─── Acciones ───

const ROOM_ACTIONS = ['react', 'bet', 'unbet', 'ready', 'power', 'loan', 'repay', 'mafiaFavor', 'createAlliance', 'invite', 'answerInvite',
  'leaveAlliance', 'gift', 'betray', 'buyHorse', 'enroll', 'train', 'buySkin', 'equipSkin'];

function handleAction(name, body) {
  if (name === 'sala') {
    const room = createRoom();
    return { sala: room.code, hostKey: room.hostKey };
  }
  const room = rooms.get(String(body.sala || '').toUpperCase());
  if (!room) return { error: 'Esa sala no existe. Revisa el código en la pantalla' };
  room.lastActive = Date.now();

  if (name === 'start') {
    if (body.hostKey !== room.hostKey) return { error: 'Solo la pantalla de la sala puede arrancar' };
    if (room.phase === 'apuestas') room.startRace();
    return {};
  }
  if (name === 'internet') {
    if (body.hostKey !== room.hostKey) return { error: 'Solo la pantalla de la sala puede abrir el juego a internet' };
    return body.on ? tunel.abrir() && tunel.estado() : tunel.cerrar();
  }
  if (name === 'vista') { // Tecla L: la pantalla ve lo que ve Einstein y dónde mira
    if (body.hostKey !== room.hostKey) return { error: 'Solo la pantalla de la sala puede ver lo que ve Einstein' };
    room.vista = !!body.on;
    if (!room.vista) for (const h of room.horses || []) { h.vigia = false; h.visto = null; }
    return {};
  }
  if (name === 'memoria') { // Tecla M: la memoria de cada caballo que la tiene
    if (body.hostKey !== room.hostKey) return { error: 'Solo la pantalla de la sala puede ver la memoria' };
    room.memoria = !!body.on;
    return {};
  }
  if (name === 'resetCoins') {
    if (body.hostKey !== room.hostKey) return { error: 'Solo la pantalla de la sala puede reiniciar las fichas' };
    const out = room.resetCoins();
    setImmediate(() => broadcastState(room));
    return out;
  }
  if (name === 'join') {
    const nm = String(body.name || '').trim().slice(0, 16);
    let acc = body.id && accounts.get(body.id);
    if (!acc) {
      if (!nm) return { error: 'Escribe tu nombre' };
      acc = { id: crypto.randomUUID(), name: nm, horse: null, trophies: [], skins: ['normal'] };
      accounts.set(acc.id, acc);
    } else if (nm) acc.name = nm;
    room.join({ id: acc.id, name: acc.name });
    saveAccounts();
    return { id: acc.id };
  }
  if (!ROOM_ACTIONS.includes(name)) return { error: 'Acción desconocida' };
  const p = room.players.get(body.id);
  if (!p) return { error: 'No estás en esta sala' };
  const out = room[name](p, body) || {};
  if (out.obstacle) broadcastScreens(room, { type: 'obst', o: out.obstacle });
  if (out.reaction) { broadcastScreens(room, { type: 'react', ...out.reaction }); delete out.reaction; return out; }
  delete out.obstacle;
  setImmediate(() => broadcastState(room));
  return out;
}

// ─── HTTP ───

const STATIC = { '/': 'pantalla.html', '/pantalla': 'pantalla.html', '/cel': 'cel.html' };
// Las páginas se leen al arrancar: así siempre van con el código de este servidor, aunque se actualicen
// los archivos con el juego abierto. BUILD cambia con cada arranque y las pantallas se recargan solas
// si el servidor se reinició con otra versión.
const BUILD = String(Date.now());
const PAGES = Object.fromEntries(Object.entries(STATIC).map(([route, file]) =>
  [route, fs.readFileSync(path.join(__dirname, 'public', file), 'utf8').replace('__BUILD__', BUILD)]));
// Comprimidas una sola vez: la página del celular baja de ~56 KB a ~17 KB
const PAGES_GZ = Object.fromEntries(Object.entries(PAGES).map(([route, html]) => [route, zlib.gzipSync(html, { level: 9 })]));

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const roomParam = () => rooms.get(String(url.searchParams.get('sala') || '').toUpperCase());

  // Respaldo con Server-Sent Events (el juego usa WebSocket en /ws)
  if (url.pathname === '/events') {
    const room = roomParam();
    if (!room) { res.writeHead(404); res.end(); return; }
    // no-transform evita que proxies como Cloudflare compriman y retengan el flujo (los caballos irían a saltos)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write(`:${' '.repeat(2048)}\nretry: 1000\n\n`); // relleno inicial para que el primer mensaje no espere
    const closers = [];
    req.on('close', () => closers.forEach(f => f()));
    attach(room, { send: t => res.write(`data: ${t}\n\n`), onClose: f => closers.push(f) }, url.searchParams);
    return;
  }

  if (url.pathname === '/api/track') {
    const room = roomParam();
    if (!room) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"sala"}'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      raceKey: room.raceKey, track: room.track, gates: room.gates,
      horses: room.lineup.map(h => ({ name: h.name, color: h.color, skin: h.skin })),
      joinUrl: `${publicBase(req)}/cel?sala=${room.code}`,
    }));
    return;
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy(); });
    req.on('end', () => {
      let out;
      try { out = handleAction(url.pathname.slice(5), JSON.parse(body || '{}')); }
      catch (e) { console.error(e); out = { error: 'Petición inválida' }; }
      res.writeHead(out.error ? 400 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
    return;
  }

  // El video tutorial se sirve por partes para no cargarlo entero en memoria
  if (url.pathname === '/tutorial.webm') {
    const file = path.join(__dirname, 'public', 'tutorial.webm');
    fs.stat(file, (err, st) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      const start = m ? +m[1] : 0, end = m && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      res.writeHead(m ? 206 : 200, { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
        ...(m ? { 'Content-Range': `bytes ${start}-${end}/${st.size}` } : {}) });
      fs.createReadStream(file, { start, end }).pipe(res);
    });
    return;
  }

  const page = PAGES[url.pathname];
  if (page) {
    const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Accept-Encoding',
      ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
    res.end(gz ? PAGES_GZ[url.pathname] : page);
    return;
  }
  res.writeHead(404); res.end('No encontrado');
});

// ─── Bucles ───

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.step()) {
      broadcastScreens(room, { type: 'pos', h: room.positions(), t: room.tick });
      if (room.vista) mandaVista(room);
      if (room.memoria && room.phase === 'carrera' && room.tick % 3 === 0)
        broadcastScreens(room, { type: 'memoria', m: room.horses.map(h => Array.from(h.mem || [], v => Math.round(v * 100))) });
    }
  }
}, 1000 / (FPS * SIM_SPEED));

let tick = 0;
setInterval(() => {
  tick++;
  for (const [code, room] of rooms) {
    const empty = !room.screens.size && !room.phones.size;
    if (empty && Date.now() - room.lastActive > ROOM_IDLE_MS) { rooms.delete(code); continue; }
    if (!empty) broadcastState(room, tick % 2 === 0);
  }
  // El hándicap se puede recalibrar sin reiniciar el servidor
  if (tick % 150 === 0) setHandicap(loadHandicapPers());
}, 250);

// WebSocket: la vía principal para empujar el estado y las posiciones de la carrera
server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://x');
  const room = url.pathname === '/ws' && rooms.get(String(url.searchParams.get('sala') || '').toUpperCase());
  if (!room) { socket.end('HTTP/1.1 404 Not Found\r\n\r\n'); return; }
  const conn = ws.accept(req, socket);
  if (conn) attach(room, conn, url.searchParams);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error(`\n⚠️  El puerto ${PORT} ya está en uso (¿quedó otro Jackpot Jockeys abierto?). Ciérralo o usa otro: PORT=${PORT + 1} node server.js\n`);
  else console.error(err);
  process.exitCode = 1;
});

module.exports = { server };

server.listen(PORT, () => {
  console.log(`\n🏇 Jackpot Jockeys listo`);
  console.log(`   Pantalla grande: http://localhost:${PORT}  (crea una sala con código)`);
  console.log(`   Celulares:       ${process.env.PUBLIC_URL || `http://${lanIP()}:${PORT}`}/cel  (misma WiFi, o PUBLIC_URL / npm run compartir)\n`);
});
