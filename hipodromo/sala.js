// sala.js — Una sala de Jackpot Jockeys: una partida de N carreras con sus jugadores,
// apuestas, poderes, la mafia, las peñas (alianzas) y los caballos de los jugadores.

const crypto = require('crypto');
const { Track, Horse, stepRace, drawGates, laneOffset, FPS, SIM_SPEED, MUNDOS } = require('./sim');
const { HORSES, EINSTEIN, PERFILES, PERSONALIDADES, POWERS, POTROS, SKINS, repartir, randomHouseSkin, loadPerfiles, loadColtBrain, loadHandicapPers, loadWorldEdges, applyPower } = require('./establo');
const { say, quip } = require('./narrador');
const { TRAIN_GENERATIONS, bodyOpts } = require('./evolucion');
const { winFactor, recordRace, trainedEdge, payFactors, oddsFor, ODDS_CAP } = require('./cuotas');

// Qué se puede entrenar y cómo lo cuenta el narrador
const TRAIN_FOCUS = { velocidad: 'velocidad', agresion: 'agresión', control: 'control' };

const CFG = {
  grandPrixEvery: 8,      // la partida no se acaba: cada 8 carreras hay un Gran Premio
  readyCountdown: 5,      // la carrera arranca 5 s después de que todos digan "listo"
  resultSeconds: 25,
  maxRaceSeconds: 200,
  startCoins: 1000,
  powerCooldownMs: 4000,
  grandPrixBonus: 0.5,    // en el Gran Premio todas las cuotas suben 50 %
  playerHorsesPerRace: 3,
  maxHorses: 8,           // 6 al armar la carrera; hasta 8 si entran potros durante las apuestas
  einsteinChance: +(process.env.JJ_EINSTEIN ?? 0.5), // Einstein (en prueba) entra en la mitad de las carreras en lugar de uno de la casa; JJ_EINSTEIN=1 lo pone siempre
  // Mafia
  loanOptions: [200, 500],
  maxDebt: 2500,
  interest: 0.12,         // por carrera
  collectorCut: 0.5,      // parte de cada cobro que se lleva el cobrador
  mafiaFavorCost: 300,    // se suma a la deuda
  // Peñas
  maxAllianceSize: 3,
  giftPerRace: 300,
  allianceCommission: 0.1,
  betrayalCut: 0.2,
  comboWindowMs: 5000,
  // Caballos propios
  horsePrice: 400,
  trainPrice: 150,
  ownerBonus: 50,         // el dueño cobra 50 × la cuota de Ganador de su caballo (mín. 100)
  ownerCut: 0.2,          // y además 20 % de lo que gana la casa con las apuestas de esa carrera
};

const TRACK_SIZES = ['corta', 'media', 'media', 'larga'];
// Reacciones que los jugadores lanzan desde el celular a la pantalla grande
const REACTIONS = {
  risa: { icon: '😂', text: 'Jajaja' },
  fuego: { icon: '🔥', text: '¡Vamos!' },
  payaso: { icon: '🤡', text: 'Payaso' },
  plata: { icon: '💸', text: 'Mi plata…' },
  susto: { icon: '😱', text: '¡Nooo!' },
  llora: { icon: '😭', text: 'Llora' },
  rey: { icon: '👑', text: 'El rey' },
  caballo: { icon: '🐎', text: '¡Corre!' },
};
const REACTION_COOLDOWN_MS = 1500;

// Tipos de apuesta, como en un hipódromo. La casa ofrece cuotas fijas (cuotas.js): el boleto
// guarda la cuota del momento y, si acierta, cobra monto × cuota.
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const BET_TYPES = {
  ganador: { name: 'Que gane', picks: 1, desc: 'Tu caballo llega 1º', hit: (s, o) => s[0] === o[0] },
  place: { name: 'Top 2', picks: 1, desc: 'Tu caballo llega 1º o 2º', hit: (s, o) => o.slice(0, 2).includes(s[0]) },
  podio: { name: 'Podio', picks: 1, desc: 'Tu caballo llega entre los 3 primeros', hit: (s, o) => o.slice(0, 3).includes(s[0]) },
  quiniela: { name: 'Pareja', picks: 2, desc: 'Tus 2 caballos son 1º y 2º, en cualquier orden', hit: (s, o) => sameSet(s, o.slice(0, 2)) },
  exacta: { name: '1º y 2º', picks: 2, desc: '1º y 2º en el orden exacto', hit: (s, o) => s[0] === o[0] && s[1] === o[1] },
  trifecta: { name: '1º, 2º y 3º', picks: 3, desc: '1º, 2º y 3º en el orden exacto', hit: (s, o) => s.every((x, k) => x === o[k]) },
};
// Clave del boleto: en la quiniela el orden no importa
const ticketKey = (type, sel) => (type === 'quiniela' ? [...sel].sort((a, b) => a - b) : sel).join('-');
const PEÑA_NAMES = ['Cartel del Heno', 'Los Sin Freno', 'La Peña de la Zanahoria', 'Herradura Nostra', 'Los Trotamundos',
  'Club del Lazo', 'Sindicato del Galope', 'Los Relinchos Unidos', 'Hermandad del Barro', 'Los Cascos Ligeros'];
const PLAYER_COLORS = ['#e85d75', '#4fb3d9', '#9bc53d', '#e0e0d8', '#b07cff', '#ff9f43'];

const BRAINS = loadPerfiles();
let HANDICAP = loadHandicapPers();
const WORLD_EDGE = loadWorldEdges();
const WIN_RECORD = {}; // victorias reales y esperadas de cada línea (o potro) en el juego; las guarda server.js
const HOUSE_EDGE = {}; // cuánto mejor es cada línea de la casa tras aprender: baja sus cuotas
const HOUSE_BODY = {}; // lo que cada línea de la casa ha entrenado el cuerpo (cada pocas carreras, como los potros)
const houseEntry = h => {
  const { form, agility, power } = bodyOpts(HOUSE_BODY[h.slot], HANDICAP[h.pers] ?? 1);
  return { ...h, brain: BRAINS[h.slot], handicap: form, agility, power, edge: HOUSE_EDGE[h.slot] || BRAINS[h.slot]?.edge || 1, skin: randomHouseSkin() };
};
const recordKey = h => h.slot || h.name;
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
// Hándicap de partida para los potros de los jugadores, según el tipo de cerebro con el que nacen
const baseHandicap = perfil => POTROS[perfil].handicap;
// Un potro corre con el hándicap de su perfil y su cuerpo entrenado
const ownedBody = horse => {
  const { form, agility, power } = bodyOpts(horse.body, baseHandicap(horse.perfil));
  return { handicap: form, agility, power };
};

function roomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join('');
}

class Room {
  constructor(code, accounts, hooks) {
    this.code = code;
    this.hostKey = crypto.randomUUID();
    this.accounts = accounts;          // cuentas persistentes (nombre, caballo, trofeos)
    this.hooks = hooks;                // { save(), train(job), broadcast(room) }
    this.players = new Map();          // id → estado del jugador en esta partida
    this.alliances = new Map();        // id → { id, name, members: Set }
    this.screens = new Set();
    this.phones = new Map();           // res → playerId
    this.log = [];
    this.lastColor = 0;
    this.history = [];
    this.lastActive = Date.now();
    this.newMatch();
  }

  // ─── Utilidades ───────────────────────────────────

  addLog(text) {
    this.log.push({ t: Date.now(), text });
    if (this.log.length > 40) this.log.shift();
  }
  // Los comentarios "de color" se espacian para que se alcancen a leer
  narrate(kind, vars, important = true) {
    const now = Date.now();
    if (!important && now - this.lastColor < 2600) return;
    if (!important) this.lastColor = now;
    this.addLog(say(kind, vars));
  }
  connectedIds() { return new Set(this.phones.values()); }
  net(p) { return p.coins - p.debt; }
  allianceOf(id) { for (const a of this.alliances.values()) if (a.members.has(id)) return a; return null; }

  // ─── Partida ──────────────────────────────────────

  newMatch() {
    this.match = { num: (this.match?.num || 0) + 1, race: 0, grandPrixEvery: CFG.grandPrixEvery };
    this.recent = {};  // últimos puestos de cada caballo, para mostrarlos
    this.reparto = repartir();
    this.newDeal = true;
    this.alliances.clear();
    for (const p of this.players.values()) this.resetPlayer(p);
    this.newRace();
  }

  resetPlayer(p) {
    Object.assign(p, {
      coins: CFG.startCoins, debt: 0, tickets: [], cooldownUntil: 0, ready: false, gifted: 0, favorUsed: false,
      race: { bets: 0, powers: 0, favor: 0 }, lastRace: null,
      invites: [], noAllianceUntil: 0,
      stats: { spent: 0, borrowed: 0, bet: 0, wins: 0, best: 0, debuffs: 0, buffs: 0, combos: 0, betrayals: 0, maxDebt: 0, loans: 0, gifts: 0, ownerWins: 0 },
    });
  }

  newRace() {
    // Después de cada Gran Premio los caballos cambian de personalidad
    if (this.grandPrix) { this.reparto = repartir(); this.recent = {}; this.newDeal = true; }
    this.match.race++;
    this.grandPrix = this.match.race % CFG.grandPrixEvery === 0;
    const size = TRACK_SIZES[Math.floor(Math.random() * TRACK_SIZES.length)];
    // Cada carrera es en un mundo al azar, sin repetir el anterior
    // (JJ_MUNDO fija uno para probarlo)
    const worlds = process.env.JJ_MUNDO ? [process.env.JJ_MUNDO] : Object.keys(MUNDOS).filter(w => w !== this.track?.mundo);
    this.track = new Track(Math.floor(Math.random() * 1e6), null, size, worlds[Math.floor(Math.random() * worlds.length)]);
    this.trackSeed = this.track.seed;
    this.lineup = this.buildLineup();
    this.forms = this.lineup.map(() => +(0.93 + Math.random() * 0.14).toFixed(3));
    this.lineupVer = 0;
    this.placeHorses();
    this.powerSpend = 0;
    this.results = null;
    this.requestOdds();
    this.tick = 0;
    this.leader = null;
    this.recentPowers = [];
    for (const p of this.players.values()) {
      p.tickets = []; p.ready = false; p.gifted = 0; p.favorUsed = false;
      p.race = { bets: 0, powers: 0, favor: 0 }; p.lastRace = null;
    }
    this.phase = 'apuestas';
    this.phaseEnds = null; // las apuestas no tienen reloj: arranca cuando todos dicen "listo"
    const disguised = this.lineup.filter(h => !h.owner && h.skin !== 'normal');
    if (disguised.length) this.addLog(`Desfile de disfraces: ${disguised.map(h => `${h.name} de ${SKINS[h.skin].name}`).join(', ')}.`);
    if (this.grandPrix) this.narrate('gran_premio');
    else this.narrate('apuestas', { n: String(this.match.race), s: size });
    this.addLog(`${this.track.world.icon} Se corre en ${this.track.world.name}. ${this.track.world.desc}`);
    if (this.newDeal) {
      this.addLog(`🎲 Personalidades: ${this.reparto.map(h => `${h.name} ${PERSONALIDADES[h.pers].icon}`).join(', ')}.`);
      this.newDeal = false;
    }
  }

  // Cajones al azar y caballos en la línea de salida (antes de arrancar se puede repetir sin problema)
  placeHorses() {
    this.gates = drawGates(this.lineup.length);
    this.horses = this.lineup.map((h, i) => new Horse(this.track, h.brain, {
      id: i, form: this.forms[i] * h.handicap, agility: h.agility, power: h.power, lane: laneOffset(this.gates[i], this.lineup.length),
    }));
  }
  get raceKey() { return `${this.match.num}-${this.match.race}-${this.lineupVer}`; }

  ownedEntry(p, horse) {
    horse.lastRace = Date.now();
    return {
      name: horse.name, color: horse.color, perfil: horse.perfil, pers: horse.perfil === 'bravo' ? 'bravo' : 'corredor', estilo: `de ${p.name}`, owner: p.id, ownerName: p.name,
      brain: horse.brain, ...ownedBody(horse), edge: trainedEdge(horse.body), level: horse.level, skin: horse.skin || 'normal',
    };
  }

  // Si un jugador compra, inscribe o vuelve a conectar su potro mientras se apuesta, entra ya a esta
  // carrera al final de la fila (los demás caballos conservan su número y los boletos no cambian)
  joinLineup(p) {
    if (this.phase !== 'apuestas' || this.phaseEnds !== null) return false;
    const horse = this.accounts.get(p.id)?.horse;
    if (!horse || !horse.enrolled || horse.training || horse.sitOut === this.match.race || this.lineup.some(h => h.owner === p.id)) return false;
    if (this.lineup.filter(h => h.owner).length >= CFG.playerHorsesPerRace || this.lineup.length >= CFG.maxHorses) return false;
    this.lineup.push(this.ownedEntry(p, horse));
    this.forms.push(+(0.93 + Math.random() * 0.14).toFixed(3));
    this.lineupVer++;
    this.placeHorses();
    this.requestOdds();
    this.addLog(`${horse.name}, el potro de ${p.name}, entra a la carrera con el número ${this.lineup.length}.`);
    return true;
  }

  // Saca su potro de la carrera mientras se apuesta: se devuelven los boletos que lo llevan, los demás
  // boletos siguen valiendo con su nuevo número y un caballo de la casa llena el cupo si hace falta
  leaveLineup(p) {
    const i = this.lineup.findIndex(h => h.owner === p.id);
    if (i < 0) return;
    const [gone] = this.lineup.splice(i, 1);
    this.forms.splice(i, 1);
    if (this.lineup.length < 6) {
      this.lineup.push(houseEntry(this.reparto.find(h => !this.lineup.some(x => x.name === h.name))));
      this.forms.push(+(0.93 + Math.random() * 0.14).toFixed(3));
    }
    for (const q of this.players.values()) {
      for (const tk of q.tickets.filter(t => t.sel.includes(i))) {
        q.coins += tk.amount; q.stats.bet -= tk.amount; q.stats.spent -= tk.amount; q.race.bets -= tk.amount;
      }
      q.tickets = q.tickets.filter(t => !t.sel.includes(i));
      for (const tk of q.tickets) tk.sel = tk.sel.map(x => x > i ? x - 1 : x);
    }
    this.phaseEnds = null; // si había cuenta regresiva, vuelve a empezar con la fila nueva
    this.lineupVer++;
    this.placeHorses();
    this.requestOdds();
    this.addLog(`${gone.name} se va a entrenar y sale de la carrera. Se devuelven sus boletos.`);
  }

  // 6 caballos: hasta 3 de jugadores inscritos (los que llevan más tiempo sin correr primero)
  // y el resto de la casa, elegidos al azar
  buildLineup() {
    const online = this.connectedIds();
    const owned = [...this.players.values()]
      .map(p => ({ p, horse: this.accounts.get(p.id)?.horse }))
      .filter(({ p, horse }) => horse && horse.enrolled && !horse.training && horse.sitOut !== this.match.race && online.has(p.id))
      .sort((a, b) => (a.horse.lastRace || 0) - (b.horse.lastRace || 0))
      .slice(0, CFG.playerHorsesPerRace);
    const lineup = owned.map(({ p, horse }) => this.ownedEntry(p, horse));
    const house = this.reparto.map(houseEntry)
      .sort(() => Math.random() - 0.5)
      .slice(0, 6 - lineup.length);
    if (BRAINS.einstein && house.length && Math.random() < CFG.einsteinChance) house[house.length - 1] = houseEntry(EINSTEIN);
    return [...house, ...lineup].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Volumen apostado por tipo y por combinación (informativo: los pagos salen de las cuotas)
  pools() {
    const out = {};
    for (const [type, t] of Object.entries(BET_TYPES)) out[type] = { name: t.name, desc: t.desc, picks: t.picks, total: 0, keys: {} };
    for (const p of this.players.values()) for (const tk of p.tickets) {
      const pool = out[tk.type], key = ticketKey(tk.type, tk.sel);
      pool.total += tk.amount;
      pool.keys[key] = (pool.keys[key] || 0) + tk.amount;
    }
    return out;
  }
  pot() { return Object.values(this.pools()).reduce((a, p) => a + p.total, 0); }

  // ─── Cuotas de la casa ────────────────────────────

  // Cuotas: lo que se espera de cada caballo (lo que aprendió y cómo le va en este mundo), corregido con sus
  // victorias reales en el juego. La carrera 1 de la casa paga igual a todos
  requestOdds() {
    const byWorld = WORLD_EDGE[this.track.mundo]?.edge || {}, first = this.match.race <= 1;
    const norm = a => { const sum = a.reduce((x, y) => x + y, 0); return a.map(x => x / sum); };
    // Lo esperado sin historial: contra esto se comparan las victorias al terminar la carrera
    this.expected = norm(this.lineup.map(h => (h.edge || 1) * (byWorld[h.pers] || 1)));
    this.probs = first
      ? norm(this.lineup.map(h => h.owner ? h.edge || 1 : 1))
      : norm(this.expected.map((x, i) => x * winFactor(WIN_RECORD[recordKey(this.lineup[i])])));
    this.pay = payFactors(this.match.race, this.grandPrix ? 1 + CFG.grandPrixBonus : 1, this.lineup.length);
  }
  oddsOf(type, sel) { return oddsFor(type, sel, this.probs, this.pay); }
  oddsBoard() {
    if (!this.probs) return null;
    const one = type => this.lineup.map((_, i) => this.oddsOf(type, [i]));
    return { win: one('ganador') };
  }
  betOn(p) { return p.tickets.reduce((a, t) => a + t.amount, 0); }

  startRace() {
    this.phase = 'carrera';
    this.phaseEnds = Date.now() + CFG.maxRaceSeconds * 1000;
    this.narrate('salida');
  }

  standings() {
    return this.horses.map((h, i) => ({ i, h })).sort((a, b) => {
      if (a.h.finished && b.h.finished) return a.h.finishTick - b.h.finishTick;
      if (a.h.finished !== b.h.finished) return a.h.finished ? -1 : 1;
      return b.h.total - a.h.total;
    }).map(s => s.i);
  }

  // Cuánto pagaría cada boleto si la llegada fuera `order` (sin tocar saldos). La usan el pago
  // real y la proyección en vivo del celular, así que siempre coinciden.
  settle(order) {
    const payouts = [], byType = {};
    for (const [type, t] of Object.entries(BET_TYPES)) {
      for (const p of this.players.values()) for (const tk of p.tickets) {
        if (tk.type === type && t.hit(tk.sel, order)) payouts.push({ p, type, sel: tk.sel, stake: tk.amount, odds: tk.odds, win: Math.floor(tk.amount * tk.odds) });
      }
      // Lo que pagó la combinación ganadora de cada tipo (en Placé y Podio, cada caballo acertado)
      const winning = type === 'place' ? order.slice(0, 2).map(i => [i]) : type === 'podio' ? order.slice(0, 3).map(i => [i])
        : [order.slice(0, t.picks)];
      byType[type] = { name: t.name, combos: this.probs ? winning.map(sel => ({ sel, odds: this.oddsOf(type, sel) })) : [] };
    }
    return { payouts, byType };
  }

  finishRace() {
    const order = this.standings();
    const winner = order[0], W = this.lineup[winner];
    const staked = this.pot();
    const { payouts, byType } = this.settle(order);
    // Cuenta quién ganó: el que gana más de lo esperado pagará menos la próxima vez
    order.forEach((i, place) => {
      const name = this.lineup[i].name, key = recordKey(this.lineup[i]);
      WIN_RECORD[key] = recordRace(WIN_RECORD[key], place === 0, this.expected[i]);
      this.recent[name] = [place + 1, ...(this.recent[name] || [])].slice(0, 3);
    });
    this.hooks.saveWins?.();
    const ledger = new Map([...this.players.values()].map(p => [p, { won: 0, mafia: 0, commission: 0, owner: 0, ownerCut: 0 }]));
    // Pagar: primero pasa el cobrador de la mafia; los aliados cobran comisión (la paga la casa)
    for (const po of payouts) {
      const p = po.p;
      let net = po.win;
      if (p.debt > 0) {
        const cut = Math.min(p.debt, Math.floor(net * CFG.collectorCut));
        if (cut > 0) { p.debt -= cut; net -= cut; ledger.get(p).mafia += cut; this.narrate('cobrador', { p: p.name, n: cut }); }
      }
      p.coins += net; po.net = net;
      ledger.get(p).won += po.win;
      p.stats.wins++; p.stats.best = Math.max(p.stats.best, po.win);
      const a = this.allianceOf(p.id);
      if (a) for (const mid of a.members) {
        if (mid === p.id) continue;
        const m = this.players.get(mid);
        if (m) { const c = Math.floor(po.win * CFG.allianceCommission); m.coins += c; ledger.get(m).commission += c; }
      }
    }
    const paid = payouts.reduce((a, po) => a + po.win, 0);
    if (payouts.length) this.narrate('reparto', { h: W.name });
    else if (staked > 0) this.narrate('casa', { h: W.name });
    // Premio de propietario
    if (W.owner && this.players.has(W.owner)) {
      const o = this.players.get(W.owner);
      const bonus = Math.max(100, Math.floor(CFG.ownerBonus * (this.probs ? this.oddsOf('ganador', [winner]) : 2)));
      const cut = Math.floor(Math.max(0, staked - paid) * CFG.ownerCut);
      o.coins += bonus + cut; o.stats.ownerWins++; ledger.get(o).owner += bonus; ledger.get(o).ownerCut += cut;
      const acc = this.accounts.get(W.owner);
      if (acc?.horse) acc.horse.wins = (acc.horse.wins || 0) + 1;
      this.narrate('propietario', { p: o.name, h: W.name });
    }
    // Balance de la carrera de cada jugador: lo que puso contra lo que recibió
    for (const [p, l] of ledger) {
      const spent = p.race.bets + p.race.powers;
      const got = l.won - l.mafia + l.commission + l.owner + l.ownerCut;
      if (spent || got || p.race.favor) p.lastRace = { ...p.race, ...l, net: got - spent };
    }
    // Intereses de la mafia
    for (const p of this.players.values()) {
      if (p.debt > 0) p.debt = Math.ceil(p.debt * (1 + CFG.interest));
      const trained = this.accounts.get(p.id)?.horse;
      if (trained?.trainQueued) this.startTraining(p.id, trained);
      p.stats.maxDebt = Math.max(p.stats.maxDebt, p.debt);
    }
    const publicPayouts = payouts.sort((a, b) => b.win - a.win)
      .map(({ p, type, sel, stake, odds, win, net }) => ({ name: p.name, id: p.id, type, typeName: BET_TYPES[type].name, sel, stake, odds, win, net }));
    const times = order.map(i => this.horses[i].finished ? +(this.horses[i].finishTick / FPS).toFixed(2) : null);
    this.results = {
      order, times, winner, staked, paid, payouts: publicPayouts, byType,
      hits: this.horses.map(h => h.hitsGiven), grandPrix: this.grandPrix,
      quip: quip(times[1] != null && times[0] != null ? times[1] - times[0] : null, times[1] != null && times[0] != null ? times[1] - times[0] : 99),
    };
    this.history.unshift(W.name);
    this.history.length = Math.min(this.history.length, 10);
    this.phase = 'resultados'; this.phaseEnds = Date.now() + CFG.resultSeconds * 1000;
    this.hooks.save();
    this.teachHouse(order);
  }

  // Los caballos de la casa aprenden de la carrera: qué les falló y contra quién repasarla
  // (los que llegaron justo delante; si ganó, los que llegaron detrás)
  teachHouse(order) {
    if (!this.hooks.learn) return;
    const world = this.track.mundo;
    this.hooks.learn(this, order.flatMap((i, place) => {
      const { owner, name, slot, brain, handicap, agility, power, pers } = this.lineup[i], h = this.horses[i];
      if (owner) return [];
      // Einstein no aprende del juego (está en prueba), pero entrena el cuerpo igual que la casa: si no, la casa lo deja atrás
      if (pers === 'einstein') return [{ name, slot, pers, place, soloCuerpo: true }];
      const others = [...order.slice(0, place).reverse(), ...order.slice(place + 1)].slice(0, 3);
      return [{ name, slot, brain, form: handicap, agility, power, pers, place, world, rivals: others.filter(k => this.lineup[k].pers !== 'einstein').map(k => this.lineup[k].brain),
        report: { falls: h.falls, stumbles: h.stumbles, mudHits: h.mudHits, hitsTaken: h.hitsTaken } }];
    }));
  }

  // Podios en vivo (top 3 de cada categoría): se juega hasta aburrirse, así que se ven todo el tiempo
  podiums() {
    const ps = [...this.players.values()];
    const top = (f, min = 1) => ps.map(p => ({ name: p.name, value: f(p) })).filter(x => x.value >= min)
      .sort((a, b) => b.value - a.value).slice(0, 3);
    const trainer = p => {
      const h = this.accounts.get(p.id)?.horse;
      return h ? p.stats.ownerWins : -1;
    };
    return [
      { key: 'rico', icon: '💰', title: 'Más dinero', desc: 'fichas menos deuda', top: top(p => this.net(p), -Infinity) },
      { key: 'gasto', icon: '💸', title: 'Más gastador', desc: 'apuestas y poderes', top: top(p => p.stats.spent) },
      { key: 'mafia', icon: '🕴️', title: 'Amigo de la mafia', desc: 'préstamos y sabotajes', top: top(p => p.stats.borrowed) },
      { key: 'entrenador', icon: '🏋️', title: 'Mejor entrenador', desc: 'carreras que ganó su caballo', top: top(trainer, 0) },
    ];
  }

  // Botón del anfitrión: todos vuelven a las fichas iniciales (para cuando entra alguien nuevo). Solo las
  // fichas: se anulan los boletos de esta carrera, pero deudas, caballos, disfraces, peñas y podios quedan igual.
  resetCoins() {
    if (this.phase === 'carrera') return { error: 'Espera a que termine la carrera' };
    for (const p of this.players.values()) {
      p.coins = CFG.startCoins; p.tickets = []; p.ready = false;
      p.race = { bets: 0, powers: 0, favor: 0 };
    }
    this.phaseEnds = this.phase === 'apuestas' ? null : this.phaseEnds; // si había cuenta regresiva, se cancela
    this.addLog(`🔄 Fichas reiniciadas: todos vuelven a empezar con ${CFG.startCoins}.`);
    return {};
  }

  // ─── Bucle ────────────────────────────────────────

  step() {
    const now = Date.now();
    if (this.phase === 'apuestas') {
      // Arranca solo cuando todos los conectados dicen "listo"; si alguien se arrepiente, se cancela
      const online = [...this.connectedIds()].filter(id => this.players.has(id));
      const allReady = online.length > 0 && online.every(id => this.players.get(id).ready);
      if (allReady && this.phaseEnds === null) {
        this.phaseEnds = now + CFG.readyCountdown * 1000;
        this.narrate('listos');
      } else if (!allReady && this.phaseEnds !== null) {
        this.phaseEnds = null;
        this.addLog('Alguien todavía lo está pensando. Esperamos.');
      }
      if (this.phaseEnds === null) for (const id of online) this.joinLineup(this.players.get(id));
      if (this.phaseEnds !== null && now >= this.phaseEnds) this.startRace();
    } else if (this.phase === 'carrera') {
      this.tick++;
      const before = this.horses.map(h => [h.falls, h.stumbles, h.jumps]);
      for (const ev of stepRace(this.horses)) {
        this.narrate('embestida', { a: this.lineup[ev.attacker].name, v: this.lineup[ev.victim].name }, false);
      }
      this.horses.forEach((h, i) => {
        const name = this.lineup[i].name;
        if (h.falls > before[i][0]) this.narrate('salida_pista', { h: name }, false);
        else if (h.stumbles > before[i][1]) this.narrate('tropiezo', { h: name }, false);
        else if (h.jumps > before[i][2] && Math.random() < 0.3) this.narrate('salto', { h: name }, false);
        if (!h.finished && h.laps >= this.track.laps) {
          h.finished = true; h.finishTick = h.ticks;
          if (this.horses.filter(x => x.finished).length === 1) this.narrate('meta', { h: name });
        }
      });
      const leader = this.standings()[0];
      if (this.tick > FPS * 4 && leader !== this.leader && this.leader != null) this.narrate('punta', { h: this.lineup[leader].name }, false);
      this.leader = leader;
      if (this.horses.every(h => h.finished) || now >= this.phaseEnds) this.finishRace();
      return true; // hubo movimiento
    } else if (this.phase === 'resultados') {
      if (now >= this.phaseEnds) this.newRace();
    }
    return false;
  }

  positions() {
    return this.horses.map(h => [
      Math.round(h.x * 10) / 10, Math.round(h.y * 10) / 10, Math.round(h.angle * 100) / 100,
      Math.round(h.speed * 10) / 10,
      (h.fx.boost > 0 || h.fx.carrot > 0 ? 1 : 0) | (h.fx.blind > 0 ? 2 : 0) | (h.fx.freeze > 0 ? 4 : 0) |
      (h.fx.shield > 0 ? 8 : 0) | (h.fx.stun > 0 ? 16 : 0) | (h.fx.jump > 0 ? 32 : 0) | (h.finished ? 64 : 0) |
      (h.fx.rage > 0 ? 128 : 0) | (h.fx.hit > 0 ? 256 : 0) | (h.fx.carrot > 0 ? 512 : 0),
      h.sensors.map(s => Math.round(s * 100) / 100),
    ]);
  }

  // ─── Estado público ───────────────────────────────

  publicState() {
    const pools = this.pools(), total = Object.values(pools).reduce((a, p) => a + p.total, 0);
    const win = this.lineup.map((_, i) => pools.ganador.keys[String(i)] || 0);
    const board = this.oddsBoard();
    const order = this.phase === 'apuestas' ? null : this.standings();
    const online = this.connectedIds();
    return {
      type: 'state', sala: this.code, phase: this.phase,
      timeLeft: this.phaseEnds ? Math.max(0, Math.ceil((this.phaseEnds - Date.now()) / 1000)) : null,
      match: this.match, grandPrix: this.grandPrix, simHz: FPS * SIM_SPEED,
      readyCount: [...online].filter(id => this.players.get(id)?.ready).length,
      onlineCount: [...online].filter(id => this.players.has(id)).length,
      laps: this.track.laps, trackSize: this.track.size, mundo: this.track.mundo,
      pot: this.results ? this.results.staked : total, pools,
      probs: this.probs, oddsReady: !!this.probs, pay: this.pay, oddsCap: ODDS_CAP,
      horses: this.lineup.map((h, i) => ({
        name: h.name, color: h.color, perfil: h.perfil, pers: h.pers, estilo: h.estilo, ownerName: h.ownerName || null, level: h.level || null, skin: h.skin,
        form: this.forms[i], recent: this.recent[h.name] || [], gate: this.gates[i] + 1, hits: this.horses[i].hitsGiven, bets: win[i],
        odds: board ? board.win[i] : null,
        lap: Math.min(this.track.laps, Math.floor(this.horses[i].laps) + 1),
        pos: order ? order.indexOf(i) + 1 : null,
      })),
      results: this.results, podiums: this.podiums(), history: this.history,
      log: this.log.slice(-8),
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, coins: p.coins, debt: p.debt, net: this.net(p),
        bet: this.betOn(p), ready: p.ready, online: online.has(p.id),
        alliance: this.allianceOf(p.id)?.name || null,
      })).sort((a, b) => b.net - a.net),
      alliances: [...this.alliances.values()].map(a => ({
        id: a.id, name: a.name, members: [...a.members].map(id => this.players.get(id)?.name).filter(Boolean),
        net: [...a.members].reduce((s, id) => s + (this.players.has(id) ? this.net(this.players.get(id)) : 0), 0),
      })).sort((a, b) => b.net - a.net),
      reactions: REACTIONS,
      powers: Object.fromEntries(Object.entries(POWERS).map(([k, p]) => [k, { name: p.name, icon: p.icon, cost: p.cost, desc: p.desc, debuff: p.debuff }])),
      cfg: { loanOptions: CFG.loanOptions, maxDebt: CFG.maxDebt, interest: CFG.interest, mafiaFavorCost: CFG.mafiaFavorCost,
        skins: SKINS, horsePrice: CFG.horsePrice, trainPrice: CFG.trainPrice, trainGenerations: TRAIN_GENERATIONS, personalidades: PERSONALIDADES, mundos: Object.fromEntries(Object.entries(MUNDOS).map(([k, w]) => [k, { name: w.name, icon: w.icon, desc: w.desc, obstaculos: w.obstaculos.map(o => o[0]), mejor: WORLD_EDGE[k]?.mejor || null }])), collectorCut: CFG.collectorCut, ownerBonus: CFG.ownerBonus, playerHorsesPerRace: CFG.playerHorsesPerRace, giftPerRace: CFG.giftPerRace, maxAllianceSize: CFG.maxAllianceSize },
    };
  }

  meState(id) {
    const p = this.players.get(id);
    if (!p) return null;
    const a = this.allianceOf(id);
    const acc = this.accounts.get(id) || {};
    const horse = acc.horse ? {
      name: acc.horse.name, color: acc.horse.color, perfil: acc.horse.perfil, level: acc.horse.level, enrolled: acc.horse.enrolled,
      training: acc.horse.training || null, trainProgress: acc.horse.trainProgress || 0, trainQueued: !!acc.horse.trainQueued, sitsOut: acc.horse.sitOut === this.match.race + (this.phase === 'apuestas' ? 0 : 1), body: acc.horse.body || {}, wins: acc.horse.wins || 0, history: (acc.horse.history || []).slice(-5),
      skin: acc.horse.skin || 'normal',
      // Número en la carrera actual (o null si no corre en esta)
      inRace: (() => { const i = this.lineup.findIndex(h => h.owner === id); return i >= 0 ? i : null; })(),
    } : null;
    return {
      id, name: p.name, coins: p.coins, debt: p.debt, net: this.net(p), ready: p.ready,
      ...this.myBets(p),
      cooldown: Math.max(0, p.cooldownUntil - Date.now()), favorUsed: p.favorUsed, gifted: p.gifted,
      alliance: a ? { id: a.id, name: a.name, members: [...a.members].map(m => ({ id: m, name: this.players.get(m)?.name })) } : null,
      invites: p.invites.filter(i => this.alliances.has(i.alliance)).map(i => ({ alliance: i.alliance, name: this.alliances.get(i.alliance).name, from: i.from })),
      canAlly: Date.now() >= p.noAllianceUntil,
      horse, trophies: (acc.trophies || []).length, skins: acc.skins || ['normal'],
    };
  }

  // Boletos del jugador con lo que pagarían si aciertan, lo que lleva gastado en la carrera
  // y, durante la carrera, cuánto cobraría si terminara con las posiciones actuales.
  myBets(p) {
    const tickets = p.tickets.map(tk => ({ ...tk, ifHit: Math.floor(tk.amount * tk.odds) }));
    let live = null;
    if (this.phase === 'carrera' && p.tickets.length) {
      const mine = this.settle(this.standings()).payouts.filter(po => po.p === p);
      const gross = mine.reduce((a, po) => a + po.win, 0);
      const mafia = p.debt > 0 ? Math.min(p.debt, mine.reduce((a, po) => a + Math.floor(po.win * CFG.collectorCut), 0)) : 0;
      live = { gross, mafia, hits: mine.map(po => ({ type: po.type, sel: po.sel, win: po.win })) };
    }
    return { tickets, race: p.race, live, lastRace: p.lastRace };
  }

  // ─── Acciones de jugadores ────────────────────────

  join(p) {
    if (!this.players.has(p.id)) {
      const player = { id: p.id, name: p.name };
      this.resetPlayer(player);
      this.players.set(p.id, player);
      this.addLog(`${p.name} llegó con ${CFG.startCoins} fichas y mucha fe.`);
    } else this.players.get(p.id).name = p.name;
    return this.players.get(p.id);
  }

  // Un boleto: tipo de apuesta, caballos elegidos (en orden) y monto.
  // Acepta también { horse } para la apuesta simple a Ganador.
  bet(p, { type = 'ganador', sel, horse, amount }) {
    if (this.phase !== 'apuestas') return { error: 'Las apuestas están cerradas' };
    const t = BET_TYPES[type];
    if (!t) return { error: 'Tipo de apuesta inválido' };
    sel = (Array.isArray(sel) ? sel : [horse]).map(x => parseInt(x, 10));
    amount = parseInt(amount, 10);
    if (sel.length !== t.picks || sel.some(x => !(x >= 0 && x < this.lineup.length)) || new Set(sel).size !== sel.length) {
      return { error: `${t.name}: elige ${t.picks === 1 ? '1 caballo' : `${t.picks} caballos distintos`}` };
    }
    if (!(amount > 0)) return { error: 'Monto inválido' };
    if (amount > p.coins) return { error: 'No tienes suficientes fichas. La mafia presta…' };
    if (!this.probs) return { error: 'La casa está calculando las cuotas, un segundo…' };
    p.coins -= amount;
    p.stats.bet += amount; p.stats.spent += amount;
    p.race.bets += amount;
    const odds = this.oddsOf(type, sel), key = ticketKey(type, sel);
    const same = p.tickets.find(tk => tk.type === type && ticketKey(type, tk.sel) === key && tk.odds === odds);
    if (same) same.amount += amount; else p.tickets.push({ type, sel, amount, odds });
    const names = sel.map(i => this.lineup[i].name).join(type === 'quiniela' ? ' y ' : ' → ');
    this.addLog(`${p.name} juega ${amount} a ${t.name}: ${names} (x${odds}).`);
    return {};
  }

  // Quita un boleto y devuelve lo apostado. Sin número, quita el último
  unbet(p, { ticket } = {}) {
    if (this.phase !== 'apuestas') return { error: 'Las apuestas están cerradas' };
    const i = ticket == null ? p.tickets.length - 1 : parseInt(ticket, 10), tk = p.tickets[i];
    if (!tk) return { error: 'No hay nada que deshacer' };
    p.tickets.splice(i, 1);
    p.coins += tk.amount; p.stats.bet -= tk.amount; p.stats.spent -= tk.amount; p.race.bets -= tk.amount;
    return {};
  }

  ready(p, { ready }) {
    if (this.phase !== 'apuestas') return { error: 'Ya arrancó' };
    p.ready = ready !== false;
    return {};
  }

  power(p, { power, horse }) {
    const pw = POWERS[power];
    if (!pw) return { error: 'Poder inválido' };
    if (this.phase !== 'carrera') return { error: 'Solo durante la carrera' };
    horse = parseInt(horse, 10);
    const h = this.horses[horse];
    if (!h) return { error: 'Caballo inválido' };
    if (h.finished) return { error: 'Ese caballo ya llegó a la meta' };
    if (Date.now() < p.cooldownUntil) return { error: 'Espera un momento…' };
    if (p.coins < pw.cost) return { error: 'No tienes suficientes fichas' };
    p.coins -= pw.cost;
    p.race.powers += pw.cost; p.stats.spent += pw.cost;
    this.powerSpend += pw.cost; // lo gastado en poderes engorda el pozo
    p.cooldownUntil = Date.now() + CFG.powerCooldownMs;
    p.stats[pw.debuff ? 'debuffs' : 'buffs']++;
    const out = applyPower(this.horses, this.track, horse, power);
    const name = this.lineup[horse].name;
    if (out.blocked) { this.narrate('bloqueado', { p: p.name, h: name }); return { obstacle: null }; }
    this.narrate(power, { p: p.name, h: name });
    this.checkCombo(p, horse, power, pw);
    return { obstacle: out.obstacle || null };
  }

  // Combo de peña: dos aliados distintos usan el mismo tipo (ataque o ayuda) sobre el mismo caballo
  checkCombo(p, horse, power, pw) {
    const now = Date.now(), a = this.allianceOf(p.id);
    this.recentPowers = this.recentPowers.filter(r => now - r.t < CFG.comboWindowMs);
    if (a && pw.fx) {
      const partner = this.recentPowers.find(r => r.horse === horse && r.debuff === pw.debuff && r.player !== p.id && a.members.has(r.player));
      if (partner) {
        const h = this.horses[horse];
        h.fx[pw.fx] = Math.round(h.fx[pw.fx] * (pw.debuff ? 2 : 1.5));
        p.stats.combos++;
        this.narrate('combo', { n: a.name, h: this.lineup[horse].name });
      }
    }
    this.recentPowers.push({ t: now, horse, debuff: pw.debuff, player: p.id });
  }

  // ─── La mafia ─────────────────────────────────────

  loan(p, { amount }) {
    amount = parseInt(amount, 10);
    if (!CFG.loanOptions.includes(amount)) return { error: 'Monto inválido' };
    if (p.debt + amount > CFG.maxDebt) return { error: 'Don Caballone dice que ya debes demasiado' };
    p.debt += amount; p.coins += amount; p.stats.loans++; p.stats.borrowed += amount;
    p.stats.maxDebt = Math.max(p.stats.maxDebt, p.debt);
    this.narrate('prestamo', { p: p.name, n: amount });
    return {};
  }

  repay(p, { amount }) {
    amount = Math.min(parseInt(amount, 10) || 0, p.debt, p.coins);
    if (amount <= 0) return { error: 'Nada que pagar' };
    p.coins -= amount; p.debt -= amount;
    this.narrate('pago_mafia', { p: p.name, n: amount });
    return {};
  }

  // Sabotaje de la mafia: congela 2 s y venda 3 s a un caballo (ignora escudos). No cuesta fichas: se suma a la deuda
  mafiaFavor(p, { horse }) {
    if (this.phase !== 'carrera') return { error: 'Solo durante la carrera' };
    if (p.favorUsed) return { error: 'Un sabotaje por carrera. Don Caballone tiene agenda' };
    if (p.debt + CFG.mafiaFavorCost > CFG.maxDebt) return { error: 'Ya le debes demasiado a la mafia' };
    horse = parseInt(horse, 10);
    const h = this.horses[horse];
    if (!h || h.finished) return { error: 'Caballo inválido' };
    p.debt += CFG.mafiaFavorCost; p.favorUsed = true; p.stats.debuffs++; p.stats.borrowed += CFG.mafiaFavorCost;
    p.race.favor += CFG.mafiaFavorCost;
    p.stats.maxDebt = Math.max(p.stats.maxDebt, p.debt);
    h.fx.freeze = Math.max(h.fx.freeze, Math.round(FPS * 2));
    h.fx.blind = Math.max(h.fx.blind, Math.round(FPS * 3));
    this.narrate('mafia_favor', { p: p.name, h: this.lineup[horse].name });
    return {};
  }

  // ─── Peñas ────────────────────────────────────────

  createAlliance(p) {
    if (this.allianceOf(p.id)) return { error: 'Ya estás en una peña' };
    if (Date.now() < p.noAllianceUntil) return { error: 'Después de traicionar nadie confía en ti… por ahora' };
    const used = new Set([...this.alliances.values()].map(a => a.name));
    const name = PEÑA_NAMES.find(n => !used.has(n)) || `Peña ${this.alliances.size + 1}`;
    const a = { id: crypto.randomUUID(), name, members: new Set([p.id]), since: this.match.race };
    this.alliances.set(a.id, a);
    this.narrate('peña_nueva', { p: p.name, n: name });
    return {};
  }

  invite(p, { to }) {
    const a = this.allianceOf(p.id);
    if (!a) return { error: 'Primero funda una peña' };
    if (a.members.size >= CFG.maxAllianceSize) return { error: 'La peña está llena' };
    const t = this.players.get(to);
    if (!t || t.id === p.id) return { error: 'Jugador inválido' };
    if (this.allianceOf(t.id)) return { error: `${t.name} ya tiene peña` };
    if (!t.invites.some(i => i.alliance === a.id)) t.invites.push({ alliance: a.id, from: p.name });
    return {};
  }

  answerInvite(p, { alliance, accept }) {
    p.invites = p.invites.filter(i => i.alliance !== alliance);
    const a = this.alliances.get(alliance);
    if (!accept || !a) return {};
    if (this.allianceOf(p.id)) return { error: 'Ya estás en una peña' };
    if (Date.now() < p.noAllianceUntil) return { error: 'Después de traicionar nadie confía en ti… por ahora' };
    if (a.members.size >= CFG.maxAllianceSize) return { error: 'La peña se llenó' };
    a.members.add(p.id);
    this.narrate('peña_union', { p: p.name, n: a.name });
    return {};
  }

  leaveAlliance(p) {
    const a = this.allianceOf(p.id);
    if (!a) return {};
    a.members.delete(p.id);
    if (!a.members.size) this.alliances.delete(a.id);
    this.addLog(`${p.name} deja «${a.name}». Sin rencores… creemos.`);
    return {};
  }

  gift(p, { to, amount }) {
    const a = this.allianceOf(p.id);
    const t = this.players.get(to);
    amount = parseInt(amount, 10);
    if (!a || !t || !a.members.has(t.id) || t.id === p.id) return { error: 'Solo puedes pasar fichas a tu peña' };
    if (!(amount > 0) || amount > p.coins) return { error: 'Monto inválido' };
    if (p.gifted + amount > CFG.giftPerRace) return { error: `Máximo ${CFG.giftPerRace} por carrera` };
    p.coins -= amount; t.coins += amount; p.gifted += amount; p.stats.gifts += amount;
    this.narrate('regalo', { p: p.name, h: t.name, n: amount });
    return {};
  }

  betray(p) {
    const a = this.allianceOf(p.id);
    if (!a || a.members.size < 2) return { error: 'Necesitas aliados para traicionarlos' };
    if (this.match.race - a.since < 1) return { error: 'Espera al menos una carrera: la traición se cocina a fuego lento' };
    let loot = 0;
    for (const mid of a.members) {
      if (mid === p.id) continue;
      const m = this.players.get(mid);
      if (!m) continue;
      const take = Math.floor(Math.max(0, m.coins) * CFG.betrayalCut);
      m.coins -= take; loot += take;
    }
    p.coins += loot; p.stats.betrayals++;
    p.noAllianceUntil = Date.now() + 1000 * 60 * 3;
    this.alliances.delete(a.id);
    this.narrate('traicion', { p: p.name, n: a.name, h: loot });
    return {};
  }

  // ─── Reacciones ───────────────────────────────────

  react(p, { kind }) {
    const r = REACTIONS[kind];
    if (!r) return { error: 'Reacción inválida' };
    const now = Date.now();
    if (now - (p.lastReact || 0) < REACTION_COOLDOWN_MS) return { error: 'Más despacio…' };
    p.lastReact = now;
    return { reaction: { name: p.name, icon: r.icon, text: r.text } };
  }

  // ─── Caballos propios ─────────────────────────────

  buyHorse(p, { name, perfil }) {
    const acc = this.accounts.get(p.id);
    if (acc.horse) return { error: 'Ya tienes un caballo' };
    name = String(name || '').trim().slice(0, 18);
    if (!name) return { error: 'Ponle nombre a tu potro' };
    if (HORSES.some(h => h.name.toLowerCase() === name.toLowerCase())) return { error: 'Ese nombre ya es de la casa' };
    perfil = perfil === 'bravo' ? 'bravo' : 'corredor';
    if (p.coins < CFG.horsePrice) return { error: `Un potro cuesta ${CFG.horsePrice} fichas` };
    p.coins -= CFG.horsePrice;
    const used = new Set([...this.accounts.values()].map(a => a.horse?.color));
    acc.horse = {
      name, perfil, brain: loadColtBrain(perfil), level: 1, enrolled: true, wins: 0, history: [],
      color: PLAYER_COLORS.find(c => !used.has(c)) || PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)],
    };
    this.narrate('potro', { p: p.name, h: name });
    this.joinLineup(p);
    this.hooks.save();
    return {};
  }

  // ─── Tienda de disfraces ──────────────────────────

  buySkin(p, { skin }) {
    const acc = this.accounts.get(p.id), sk = SKINS[skin];
    if (!sk) return { error: 'Ese disfraz no existe' };
    if (!acc.horse) return { error: 'Primero compra un potro para disfrazarlo' };
    acc.skins = acc.skins || ['normal'];
    if (acc.skins.includes(skin)) return this.equipSkin(p, { skin });
    if (p.coins < sk.price) return { error: `Cuesta ${sk.price} fichas` };
    p.coins -= sk.price;
    acc.skins.push(skin);
    this.addLog(`${p.name} compró el disfraz ${sk.name}. La dignidad equina, por los suelos.`);
    return this.equipSkin(p, { skin });
  }

  equipSkin(p, { skin }) {
    const acc = this.accounts.get(p.id);
    if (!acc.horse) return { error: 'Primero compra un potro para disfrazarlo' };
    if (!(acc.skins || ['normal']).includes(skin)) return { error: 'Todavía no tienes ese disfraz' };
    acc.horse.skin = skin;
    // Si su caballo está en esta carrera, se cambia ya mismo
    const i = this.lineup.findIndex(h => h.owner === p.id);
    if (i >= 0 && this.phase === 'apuestas') this.lineup[i].skin = skin;
    this.hooks.save();
    return {};
  }

  enroll(p, { enrolled }) {
    const acc = this.accounts.get(p.id);
    if (!acc.horse) return { error: 'No tienes caballo' };
    acc.horse.enrolled = !!enrolled;
    this.joinLineup(p);
    this.hooks.save();
    return {};
  }

  train(p, { focus }) {
    const acc = this.accounts.get(p.id);
    if (!acc.horse) return { error: 'No tienes caballo' };
    if (acc.horse.training) return { error: 'Ya está entrenando' };
    if (!TRAIN_FOCUS[focus]) return { error: 'Entrenamiento inválido' };
    if (p.coins < CFG.trainPrice) return { error: `Entrenar cuesta ${CFG.trainPrice} fichas` };
    p.coins -= CFG.trainPrice;
    acc.horse.training = focus;
    acc.horse.trainProgress = 0;
    this.narrate('entreno', { p: p.name, h: acc.horse.name, n: TRAIN_FOCUS[focus] });
    // Cada entrenamiento le cuesta una carrera. Mientras se apuesta sale de esta; si ya está corriendo,
    // empieza al terminar y se salta la siguiente, aunque acabe de entrenar antes de que arranque
    acc.horse.sitOut = this.phase === 'apuestas' ? this.match.race : this.match.race + 1;
    if (this.phase === 'apuestas') this.leaveLineup(p);
    if (this.phase === 'carrera' && this.lineup.some(h => h.owner === p.id)) acc.horse.trainQueued = true;
    else this.startTraining(p.id, acc.horse);
    return {};
  }

  startTraining(accountId, horse) {
    horse.trainQueued = false;
    this.hooks.train({ accountId, room: this, focus: horse.training, brain: horse.brain, body: horse.body, form: baseHandicap(horse.perfil) });
  }

  trainingProgress(accountId, done) {
    const horse = this.accounts.get(accountId)?.horse;
    if (horse?.training) horse.trainProgress = done;
  }

  // Llamado cuando termina el entrenamiento en segundo plano. El cerebro nuevo solo se queda si pasó
  // el examen (evolucion.js); si no, sigue con el de antes y se devuelven las fichas. `result` es
  // null si el entrenamiento falló por un error: se devuelven las fichas y no hay descanso.
  trainingDone(accountId, result) {
    const acc = this.accounts.get(accountId);
    if (!acc?.horse) return;
    const horse = acc.horse, p = this.players.get(accountId), focus = horse.training;
    horse.training = null;
    horse.trainProgress = 0;
    if (!result || !result.improved) { if (p) p.coins += CFG.trainPrice; }
    if (!result) horse.sitOut = null;
    if (result) {
      horse.history = [...(horse.history || []), { focus, ...result.summary, improved: result.improved }].slice(-10);
      if (result.improved) {
        horse.brain = result.brain;
        horse.body = result.body;
        horse.level++;
        this.narrate('entreno_fin', { h: horse.name, n: horse.level });
      } else this.addLog(`${horse.name} entrenó ${TRAIN_FOCUS[focus]} pero no mejoró. Se devuelven las fichas.`);
    }
    this.hooks.save();
  }
}

module.exports = { Room, roomCode, CFG, BET_TYPES, setHandicap: h => { HANDICAP = h; },
  WIN_RECORD, houseBrains: () => PERFILES.map(p => BRAINS[p.slot]), houseForms: () => PERFILES.map(p => bodyOpts(HOUSE_BODY[p.slot], HANDICAP[p.pers] ?? 1).form),
  houseTraits: () => PERFILES.map(p => { const { agility, power } = bodyOpts(HOUSE_BODY[p.slot]); return { agility, power }; }),
  setHouseBody: (slot, body) => { HOUSE_BODY[slot] = body; },
  setHouseBrain: (slot, brain) => { BRAINS[slot] = brain; },
  setHouseEdge: (slot, edge) => { HOUSE_EDGE[slot] = edge; } };
