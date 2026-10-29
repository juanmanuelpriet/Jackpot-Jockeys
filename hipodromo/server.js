// server.js — Jackpot Jockeys: carreras de caballos con redes neuronales, multijugador.
// Cada pantalla grande crea una sala con código; los jugadores entran desde el celular.
// Sin dependencias: node server.js   (PUBLIC_URL=https://... para jugar por internet)

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const { FPS, SIM_SPEED } = require('./sim');
const { HORSES, loadHandicap } = require('./establo');
const { Room, roomCode, setHandicap } = require('./sala');
const ws = require('./websocket');

const PORT = parseInt(process.env.PORT || '3000', 10);
// Dentro de la app de escritorio las cuentas se guardan en la carpeta de datos del usuario
const ACCOUNTS_FILE = path.join(process.env.JJ_DATA_DIR || __dirname, 'jugadores.json');
const ROOM_IDLE_MS = 30 * 60 * 1000;

// ─── Cuentas (persisten entre partidas: nombre, caballo propio y trofeos) ───

const accounts = new Map();
try {
  for (const a of JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'))) {
    accounts.set(a.id, { id: a.id, name: a.name, horse: a.horse || null, trophies: a.trophies || [], skins: a.skins || ['normal'] });
  }
} catch { /* primera vez */ }

let saveTimer = null;
function saveAccounts() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const list = [...accounts.values()].map(a => ({ ...a, horse: a.horse ? { ...a.horse, training: null } : null }));
    fs.writeFile(ACCOUNTS_FILE, JSON.stringify(list), () => {});
  }, 300);
}

// ─── Entrenamiento de caballos de jugadores en hilos aparte ───

const corredores = JSON.parse(fs.readFileSync(path.join(__dirname, 'caballos_corredor.json'), 'utf8'));
function startTraining({ accountId, room, focus, brain, form }) {
  const h = loadHandicap();
  const vals = HORSES.map((x, i) => [x, h[i]]).filter(([x]) => x.perfil === 'corredor').map(([, v]) => v);
  const rivalForm = vals.reduce((a, b) => a + b, 0) / vals.length;
  const worker = new Worker(path.join(__dirname, 'entrenador.js'), { workerData: { brain, focus, form, rivals: corredores, rivalForm } });
  worker.once('message', ({ brain: trained, summary }) => room.trainingDone(accountId, trained, summary));
  worker.once('error', err => {
    console.error('Error entrenando:', err);
    const acc = accounts.get(accountId);
    if (acc?.horse) acc.horse.training = null;
  });
}

// ─── Salas ───

const rooms = new Map();
const hooks = { save: saveAccounts, train: startTraining };

function createRoom() {
  let code;
  do code = roomCode(); while (rooms.has(code));
  const room = new Room(code, accounts, hooks);
  rooms.set(code, room);
  return room;
}

function lanIP() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return 'localhost';
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
function broadcastScreens(room, obj) { const text = JSON.stringify(obj); for (const c of room.screens) c.send(text); }

// Registra una conexión de pantalla o de celular en su sala
function attach(room, conn, params) {
  if (params.get('role') === 'screen') {
    room.screens.add(conn);
    conn.onClose(() => room.screens.delete(conn));
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
function broadcastState(room) {
  const st = room.publicState();
  st.raceKey = room.raceKey;
  st.build = BUILD;
  for (const r of room.screens) send(r, st);
  for (const [r, id] of room.phones) send(r, { ...st, me: room.meState(id) });
}

// ─── Acciones ───

const ROOM_ACTIONS = ['react', 'bet', 'ready', 'power', 'loan', 'repay', 'mafiaFavor', 'createAlliance', 'invite', 'answerInvite',
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

  const page = PAGES[url.pathname];
  if (page) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(page);
    return;
  }
  res.writeHead(404); res.end('No encontrado');
});

// ─── Bucles ───

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.step()) broadcastScreens(room, { type: 'pos', h: room.positions() });
  }
}, 1000 / (FPS * SIM_SPEED));

let tick = 0;
setInterval(() => {
  tick++;
  for (const [code, room] of rooms) {
    const empty = !room.screens.size && !room.phones.size;
    if (empty && Date.now() - room.lastActive > ROOM_IDLE_MS) { rooms.delete(code); continue; }
    if (!empty) broadcastState(room);
  }
  // El hándicap se puede recalibrar sin reiniciar el servidor
  if (tick % 150 === 0) setHandicap(loadHandicap());
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
