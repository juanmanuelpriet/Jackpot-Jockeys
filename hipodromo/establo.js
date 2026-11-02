// establo.js — Los caballos del hipódromo, sus cerebros y los poderes que pueden recibir.
// Lo comparten server.js (el juego) y torneo.js (la evaluación para el análisis).

const fs = require('fs');
const path = require('path');
const { FPS, SIM_SPEED } = require('./sim');
// Segundos reales que dura un efecto (la simulación del juego va más lenta que el reloj)
const secs = ticks => `${+(ticks / (FPS * SIM_SPEED)).toFixed(1)} s`.replace('.', ',');

// Cada personalidad tiene dos líneas de cerebros (GRU que imitan a una heurística con esa personalidad, ver
// experimentos/personalidades). Lo que se aprende y las victorias quedan en la línea, no en el caballo que corría.
const ESTILOS = { corredor: 'corredor', picaro: 'pícaro', bravo: 'bravo', muybravo: 'muy bravo' };
const PERFILES = Object.keys(ESTILOS).flatMap(pers => [1, 2].map(k => ({
  slot: `${pers}.${k}`, pers, perfil: pers === 'corredor' ? 'corredor' : 'bravo', estilo: ESTILOS[pers],
})));
const perfil = slot => PERFILES.find(p => p.slot === slot);

// El reparto de cada caballo es al azar en el juego (`repartir`). Este, fijo, es el que usan las herramientas como torneo.js
const HORSES = [
  { name: 'Don Galope', color: '#c8102e', ...perfil('corredor.1') },
  { name: 'Herradura Loca', color: '#2f5fb3', ...perfil('muybravo.1') },
  { name: 'Sir Relincho', color: '#e07a1f', ...perfil('corredor.2') },
  { name: 'Patas de Trueno', color: '#1f9e86', ...perfil('bravo.1') },
  { name: 'Pura Sangre Fría', color: '#8e3fb0', ...perfil('bravo.2') },
  { name: 'Pancho Trotes', color: '#c9a227', ...perfil('picaro.1') },
];

// Reparte las líneas entre los caballos: seis de ocho, así que como mucho hay dos de cada personalidad
function repartir(rng = Math.random) {
  const lines = PERFILES.slice();
  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }
  return HORSES.map((h, i) => ({ ...h, ...lines[i] }));
}

// Las 4 personalidades, en palabras simples. Los números salen de 600 carreras simuladas por personalidad con estos
// mismos cerebros: `podio` = % de veces entre los 3 primeros, `choques` = embestidas por carrera,
// `salidas` = veces que se sale por carrera y `gana` = % de victorias por tamaño de pista.
const PERSONALIDADES = {
  corredor: { icon: '💨', name: 'Corredor', tag: 'limpio y constante', line: 'Limpio y constante: el que más llega al podio. Algo más flojo en pistas largas.', podio: 64, choques: 1.6, salidas: 0.3, gana: { corta: 23, media: 21, larga: 18 } },
  picaro: { icon: '🦊', name: 'Pícaro', tag: 'empuja a veces', line: 'Empuja a veces y casi no se sale, pero recibe muchos golpes. Rinde más en pistas cortas.', podio: 59, choques: 1.6, salidas: 0.3, gana: { corta: 20, media: 18, larga: 13 } },
  bravo: { icon: '😤', name: 'Bravo', tag: 'busca pelea', line: 'Busca pelea y rinde parejo en cualquier pista.', podio: 47, choques: 2.2, salidas: 0.9, gana: { corta: 15, media: 17, larga: 13 } },
  muybravo: { icon: '🔥', name: 'Muy bravo', tag: 'todo o nada', line: 'Todo o nada: el que más choca y más se sale. Gana poco en pistas cortas y mucho en las largas.', podio: 30, choques: 3.6, salidas: 3.4, gana: { corta: 8, media: 10, larga: 23 } },
};

// Disfraces: ridículos a propósito. Los de la casa salen al azar cada carrera; los jugadores
// los compran para su potro en la tienda del celular. Solo cambian el dibujo, no la carrera.
const SKINS = {
  normal: { name: 'Clásico', icon: '🐎', price: 0, desc: 'Un caballo. De los de siempre.' },
  trex: { name: 'T-Rex', icon: '🦖', price: 300, desc: 'Bracitos cortos, ambición enorme.' },
  robot: { name: 'Robot', icon: '🤖', price: 300, desc: 'Funciona con redes neuronales… y tornillos.' },
  payaso: { name: 'Payaso', icon: '🤡', price: 250, desc: 'Nariz roja, peluca arcoíris, cero vergüenza.' },
  unicornio: { name: 'Unicornio', icon: '🦄', price: 400, desc: 'Brilla. Eso no lo hace más rápido.' },
  vaca: { name: 'Vaca', icon: '🐄', price: 200, desc: 'Muuuy competitiva.' },
  pato: { name: 'Pato de hule', icon: '🦆', price: 200, desc: 'Flota. Corre. Hace cuac.' },
  cebra: { name: 'Cebra', icon: '🦓', price: 150, desc: 'Un caballo en pijama.' },
  pizza: { name: 'Pizza', icon: '🍕', price: 350, desc: 'Llega caliente o es gratis.' },
  fantasma: { name: 'Fantasma', icon: '👻', price: 350, desc: 'Nadie lo vio venir. Literal.' },
};
const HOUSE_SKIN_CHANCE = 0.4;
const randomHouseSkin = () => {
  if (Math.random() > HOUSE_SKIN_CHANCE) return 'normal';
  const ids = Object.keys(SKINS).filter(k => k !== 'normal');
  return ids[Math.floor(Math.random() * ids.length)];
};

const POWERS = {
  zanahoria: { name: 'Zanahoria', icon: '🥕', cost: 70, desc: `El jinete toma las riendas ${secs(FPS * 4)}: +35% vel., salta todo y no se sale`, fx: 'carrot', ticks: FPS * 4, debuff: false },
  escudo: { name: 'Escudo', icon: '🛡️', cost: 60, desc: `Inmune a ataques ${secs(FPS * 6)}`, fx: 'shield', ticks: FPS * 6, debuff: false },
  vendas: { name: 'Vendas', icon: '🙈', cost: 100, desc: `Ciega sus sensores ${secs(FPS * 2.5)}`, fx: 'blind', ticks: Math.round(FPS * 2.5), debuff: true },
  lazo: { name: 'Lazo', icon: '🪢', cost: 120, desc: `Lo frena en seco ${secs(FPS * 1.5)}`, fx: 'freeze', ticks: Math.round(FPS * 1.5), debuff: true },
  furia: { name: 'Furia', icon: '😤', cost: 90, desc: `+15% vel., sus choques aturden el doble ${secs(FPS * 5)}`, fx: 'rage', ticks: FPS * 5, debuff: false },
  charco: { name: 'Charco', icon: '💩', cost: 45, desc: 'Tira barro justo delante de él', debuff: true },
  rayo: { name: 'Rayo', icon: '⚡', cost: 250, desc: `Aturde ${secs(FPS)} a TODOS menos a él`, debuff: false },
};

// Los potros nacen con perceptrones (199 pesos): la evolución del entrenamiento los mejora, y a una GRU la rompe.
// Su hándicap es fijo porque salió de calibrar esas redes, no las de la casa.
const POTROS = { corredor: { cerebro: ['caballos_corredor.json', 0], handicap: 0.985 }, bravo: { cerebro: ['caballos_bravo_100.json', 0], handicap: 1.1 } };
const loadColtBrain = perfil => {
  const [file, idx] = POTROS[perfil].cerebro;
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'))[idx];
};

// Velocidad de cada personalidad (handicap.json); 1 = sin hándicap
function loadHandicapPers() {
  const p = path.join(__dirname, 'handicap.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
}
const loadHandicap = (lineup = HORSES) => { const h = loadHandicapPers(); return lineup.map(x => h[x.pers] ?? 1); };

// Cuánto mejor le va a cada personalidad en cada mundo (lo mide calibrar.js): mueve las cuotas
function loadWorldEdges() {
  const p = path.join(__dirname, 'cuotas_mundo.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
}

// Los cerebros de cada línea (id → cerebro)
function loadPerfiles() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'perfiles_gru.json'), 'utf8'));
}
const loadBrains = (lineup = HORSES) => { const b = loadPerfiles(); return lineup.map(x => b[x.slot]); };

// Aplica un poder al caballo idx. Devuelve 'bloqueado' si el escudo lo detuvo,
// o el obstáculo creado en el caso del charco.
function applyPower(horses, track, idx, key) {
  const pw = POWERS[key], h = horses[idx];
  if (pw.debuff && h.fx.shield > 0) return { blocked: true };
  if (key === 'charco') {
    return { obstacle: track.addObstacle('barro', h.maxProgress + 12, (Math.random() - 0.5) * 20) };
  }
  if (key === 'rayo') {
    for (const other of horses) {
      if (other !== h && !other.finished && other.fx.shield === 0) other.fx.stun = Math.max(other.fx.stun, FPS);
    }
    return {};
  }
  h.fx[pw.fx] = pw.ticks;
  return {};
}

module.exports = { HORSES, PERFILES, PERSONALIDADES, POWERS, POTROS, SKINS, repartir, randomHouseSkin, loadBrains, loadPerfiles, loadColtBrain, loadHandicap, loadHandicapPers, loadWorldEdges, applyPower };
