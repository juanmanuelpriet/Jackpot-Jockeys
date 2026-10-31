// establo.js — Los caballos del hipódromo, sus cerebros y los poderes que pueden recibir.
// Lo comparten server.js (el juego) y torneo.js (la evaluación para el análisis).

const fs = require('fs');
const path = require('path');
const { FPS, SIM_SPEED } = require('./sim');
// Segundos reales que dura un efecto (la simulación del juego va más lenta que el reloj)
const secs = ticks => `${+(ticks / (FPS * SIM_SPEED)).toFixed(1)} s`.replace('.', ',');

// Corredores: rápidos y limpios. Bravos: entrenados para embestir a los demás,
// cada uno con distinta agresividad (premio por embestida durante el entrenamiento).
const HORSES = [
  { name: 'Don Galope', color: '#c8102e', perfil: 'corredor', estilo: 'corredor', pers: 'corredor', cerebro: ['caballos_corredor.json', 0] },
  { name: 'Herradura Loca', color: '#2f5fb3', perfil: 'bravo', estilo: 'muy bravo', pers: 'muybravo', cerebro: ['caballos_bravo_150.json', 0] },
  { name: 'Sir Relincho', color: '#e07a1f', perfil: 'corredor', estilo: 'corredor', pers: 'corredor', cerebro: ['caballos_corredor.json', 1] },
  { name: 'Patas de Trueno', color: '#1f9e86', perfil: 'bravo', estilo: 'bravo', pers: 'bravo', cerebro: ['caballos_bravo_100.json', 0] },
  { name: 'Pura Sangre Fría', color: '#8e3fb0', perfil: 'corredor', estilo: 'corredor', pers: 'corredor', cerebro: ['caballos_corredor.json', 2] },
  { name: 'Pancho Trotes', color: '#c9a227', perfil: 'bravo', estilo: 'pícaro', pers: 'picaro', cerebro: ['caballos_bravo_60.json', 0] },
];

// Las 4 personalidades, en palabras simples. Los números salen de 450 carreras simuladas con estos
// mismos cerebros: `podio` = % de veces entre los 3 primeros, `choques` = embestidas por carrera,
// `salidas` = veces que se sale por carrera y `gana` = % de victorias por tamaño de pista.
const PERSONALIDADES = {
  corredor: { icon: '💨', name: 'Corredor', tag: 'limpio y constante', line: 'Limpio y constante: el que más llega al podio. Flojo en pistas largas.', podio: 57, choques: 3.5, salidas: 0.9, gana: { corta: 22, media: 20, larga: 8 } },
  picaro: { icon: '🦊', name: 'Pícaro', tag: 'empuja a veces', line: 'Empuja a veces y es el que menos golpes recibe.', podio: 52, choques: 3.0, salidas: 1.5, gana: { corta: 14, media: 18, larga: 19 } },
  bravo: { icon: '😤', name: 'Bravo', tag: 'busca pelea', line: 'Busca pelea. Mejor en pistas largas.', podio: 44, choques: 5.1, salidas: 2.1, gana: { corta: 14, media: 16, larga: 21 } },
  muybravo: { icon: '🔥', name: 'Muy bravo', tag: 'todo o nada', line: 'Todo o nada: el que más choca. Casi no gana en pistas cortas y arrasa en las largas.', podio: 32, choques: 6.7, salidas: 2.9, gana: { corta: 5, media: 8, larga: 37 } },
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

// Hándicap por caballo (lo calcula calibrar.js); 1 = sin hándicap
function loadHandicap() {
  const p = path.join(__dirname, 'handicap.json');
  const h = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
  return HORSES.map(x => h[x.name] ?? 1);
}

// Cuánto mejor le va a cada personalidad en cada mundo (lo mide calibrar.js): mueve las cuotas
function loadWorldEdges() {
  const p = path.join(__dirname, 'cuotas_mundo.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
}

// Cada caballo carga su cerebro; si su archivo aún no existe usa los cerebros sin perfil
function loadBrains(log = console.log) {
  const read = f => {
    const p = path.join(__dirname, f);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  };
  const fallback = read('caballos.json') || [read('campeon_original.json')];
  return HORSES.map((h, i) => {
    const [file, idx] = h.cerebro;
    const list = read(file);
    if (!list) log(`⚠️  No existe ${file} para ${h.name}, usando un cerebro sin perfil (ver README: Entrenar)`);
    return list ? list[idx % list.length] : fallback[i % fallback.length];
  });
}

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

module.exports = { HORSES, PERSONALIDADES, POWERS, SKINS, randomHouseSkin, loadBrains, loadHandicap, loadWorldEdges, applyPower };
