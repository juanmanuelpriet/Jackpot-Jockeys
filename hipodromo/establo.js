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
  { name: 'Backprop', color: '#c8102e', perfil: 'corredor', estilo: 'corredor', cerebro: ['caballos_corredor.json', 0] },
  { name: 'Overfitting', color: '#2f5fb3', perfil: 'bravo', estilo: 'muy bravo', cerebro: ['caballos_bravo_150.json', 0] },
  { name: 'Gradiente', color: '#e07a1f', perfil: 'corredor', estilo: 'corredor', cerebro: ['caballos_corredor.json', 1] },
  { name: 'Dropout', color: '#1f9e86', perfil: 'bravo', estilo: 'bravo', cerebro: ['caballos_bravo_100.json', 0] },
  { name: 'Tanh Tanh', color: '#8e3fb0', perfil: 'corredor', estilo: 'corredor', cerebro: ['caballos_corredor.json', 2] },
  { name: 'Bug en Producción', color: '#c9a227', perfil: 'bravo', estilo: 'pícaro', cerebro: ['caballos_bravo_60.json', 0] },
];

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

module.exports = { HORSES, POWERS, loadBrains, loadHandicap, applyPower };
