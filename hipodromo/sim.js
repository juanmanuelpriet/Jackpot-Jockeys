// sim.js — Simulación de la carrera: pista, obstáculos, caballos, choques y red neuronal.
// Es un port del simulador F1 en Python (track.py / car.py / brain.py) con las
// mismas físicas, para que los cerebros entrenados se comporten igual.

const { MUNDOS, OBSTACULOS, PELIGRO, PELIGRO_CICLO_APAGADO, CICLO_AVISO } = require('./mundos');

const SENSOR_LENGTH = 180;
const TRACK_HALF_WIDTH = 50;
const SENSOR_ANGLES = [-Math.PI / 2.5, -Math.PI / 5, 0, Math.PI / 5, Math.PI / 2.5];
const GRID = 2;          // resolución (px) de la máscara de pista
const RIVAL_RANGE = 120; // alcance del "olfato" para detectar al rival más cercano
const HIT_DIST = 18;     // distancia a la que dos caballos chocan
const FPS = 30;          // ticks de simulación por segundo de juego
// En el juego la simulación corre más lenta que el tiempo real para dar tiempo a pensar
// (la física por tick no cambia, así que las redes se comportan igual)
const SIM_SPEED = 0.6;

// Tamaños de pista: mundo más grande y cuadrícula con más celdas = vuelta más larga
const SIZES = {
  corta: { W: 1200, H: 800, cols: 5, rows: 3, laps: 2 },
  media: { W: 1600, H: 1000, cols: 6, rows: 4, laps: 2 },
  larga: { W: 2000, H: 1300, cols: 7, rows: 4, laps: 2 },
};
const PATH_SPACING = 8;   // px entre puntos del trazado (uniforme)
const MIN_RADIUS = 55;    // radio de curva mínimo aceptado
const MIN_CLEARANCE = TRACK_HALF_WIDTH * 2 + 55; // separación mínima entre tramos distintos

// ─── Utilidades ─────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Red neuronal (18 → 8 → 3 → 3 → 2, tanh) ────────
// La red no tiene ninguna regla de "embestir": solo decide giro y acelerador
// a partir de lo que percibe. Entradas:
//   0-4  sensores de distancia a bordes y vallas (5 rayos en abanico)
//   5    distancia al rival más cercano          6  rumbo hacia ese rival
//   7    velocidad relativa del rival            8  ¿el rival está protegido? (escudo/furia)
//   9    ¿tengo furia?                          10  ¿tengo turbo?
//   11   distancia al barro que tengo adelante  12  mi puesto en la carrera (0 = primero)
//   13   lado de ese barro (-1 izquierda, +1 derecha, 0 si no hay)
//   14   qué tan grave es lo que tiene adelante     15  agarre del suelo
//   16   viento de lado (-1 izquierda, +1 derecha)  17  gravedad (qué tanta velocidad pide un salto)
// "Barro" son todos los obstáculos que se pisan: charcos, hielo, cráteres, lava, géiseres…
const NUM_INPUTS = 22;
const HIDDEN_1 = 8;
const INPUT_NAMES = ['sensor_-72', 'sensor_-36', 'sensor_0', 'sensor_+36', 'sensor_+72',
  'rival_dist', 'rival_rumbo', 'rival_vel_rel', 'rival_protegido', 'mi_furia', 'mi_turbo', 'barro_adelante', 'mi_puesto', 'barro_lado',
  'peligro', 'agarre', 'viento_lado', 'gravedad', 'obstaculo_adelante', 'obstaculo_lado', 'se_puede_saltar', 'mi_velocidad'];

// Paso de la GRU: `mem` es lo que recuerda de los ticks anteriores y se actualiza aquí
function gruStep(l, x, mem, off = 0) {
  const u = l.b.length / 3, n = l.W.length - u, sig = v => 1 / (1 + Math.exp(-v));
  while (mem.length < off + u) mem.push(0);
  const z = new Array(u), r = new Array(u), out = new Array(u);
  for (let j = 0; j < u; j++) {
    let a = l.b[j], c = l.b[j + u];
    for (let i = 0; i < n; i++) { a += x[i] * l.W[i][j]; c += x[i] * l.W[i][j + u]; }
    for (let k = 0; k < u; k++) { a += mem[off + k] * l.W[n + k][j]; c += mem[off + k] * l.W[n + k][j + u]; }
    z[j] = sig(a); r[j] = sig(c);
  }
  for (let j = 0; j < u; j++) {
    let s = l.b[j + 2 * u];
    for (let i = 0; i < n; i++) s += x[i] * l.W[i][j + 2 * u];
    for (let k = 0; k < u; k++) s += r[k] * mem[off + k] * l.W[n + k][j + 2 * u];
    out[j] = (1 - z[j]) * mem[off + j] + z[j] * Math.tanh(s);
  }
  for (let j = 0; j < u; j++) mem[off + j] = out[j];
  return out;
}

// Dos tipos de cerebro: la casa usa GRU (con memoria) y los potros, el perceptrón
function predict(brain, input, mem = []) {
  let x = input, off = 0;
  for (const layer of brain) {
    if (layer.gru) { // Varias GRU seguidas comparten `mem`, cada una en su tramo
      x = gruStep(layer, x, mem, off);
      off += layer.b.length / 3;
      continue;
    }
    const out = new Array(layer.b.length);
    for (let j = 0; j < layer.b.length; j++) {
      let s = layer.b[j];
      for (let i = 0; i < x.length; i++) s += x[i] * layer.W[i][j];
      out[j] = Math.tanh(s);
    }
    x = out;
  }
  return x;
}

// ─── Einstein: ve la pista, recuerda y decide ────────
// Su vista es una cuadrícula de VISTA×VISTA celdas alrededor de él, girada hacia donde mira (filas: de atrás
// hacia adelante; columnas: de izquierda a derecha). Cuatro capas:
//   0 pista (1 pista, 0 fuera, 0.5 donde no alcanza a ver)
//   1 lo que se salta o bloquea (0.5 se salta, 0.75 pide más velocidad, 1 sólido, 0.25 se pisa pero no se salta)
//   2 lo que se pisa, con su peligro (ver PELIGRO)        3 rivales
// La red: dos convoluciones 3×3 con pooling 2×2, una capa densa que resume la vista, dos GRU y una capa densa que decide.
const VISTA = 16, CELDA = 12, ATRAS = 2;
const ESCALARES = [8, 9, 10, 12, 15, 16, 17, 21]; // de inputs(): rival protegido, furia, turbo, puesto, agarre, viento, gravedad, velocidad

function visionGrid(h, others = []) {
  const g = new Float32Array(4 * VISTA * VISTA), tr = h.track, n2 = VISTA * VISTA;
  if (h.fx.blind > 0) { for (let i = 0; i < g.length; i++) g[i] = Math.random() * 0.5; return g; }
  const c = Math.cos(h.angle), s = Math.sin(h.angle), reach = SENSOR_LENGTH * tr.world.vision;
  const cerca = tr.obstacles.filter(o => (o.x - h.x) ** 2 + (o.y - h.y) ** 2 < 280 * 280);
  for (let r = 0; r < VISTA; r++) {
    const f = (r - ATRAS + 0.5) * CELDA;
    for (let k = 0; k < VISTA; k++) {
      const l = (k - VISTA / 2 + 0.5) * CELDA, i = r * VISTA + k;
      if (Math.hypot(f, l) > reach) { g[i] = 0.5; continue; }
      const x = h.x + c * f - s * l, y = h.y + s * f + c * l;
      g[i] = tr.onTrack(x, y) ? 1 : 0;
      for (const o of cerca) {
        if ((x - o.x) ** 2 + (y - o.y) ** 2 >= o.r * o.r) continue;
        const info = OBSTACULOS[o.type];
        if (o.kind === 'solido') g[n2 + i] = 1;
        else if (o.kind === 'salto') g[n2 + i] = Math.max(g[n2 + i], info.salto ? 0.75 : 0.5);
        else {
          if (info.atrapa) g[n2 + i] = Math.max(g[n2 + i], 0.25);
          const p = o.kind === 'ciclo' && !h._cycleOn(o, CICLO_AVISO) ? PELIGRO_CICLO_APAGADO : PELIGRO[o.kind];
          g[2 * n2 + i] = Math.max(g[2 * n2 + i], p);
        }
      }
    }
  }
  for (const o of others) {
    if (o === h || o.finished) continue;
    const dx = o.x - h.x, dy = o.y - h.y, f = dx * c + dy * s, l = -dx * s + dy * c;
    const r = Math.floor(f / CELDA + ATRAS), k = Math.floor(l / CELDA + VISTA / 2);
    if (r >= 0 && r < VISTA && k >= 0 && k < VISTA && Math.hypot(f, l) <= reach) g[3 * n2 + r * VISTA + k] = 1;
  }
  return g;
}

// Convolución 3×3 con relleno de ceros y ReLU, seguida de un pooling 2×2 que se queda con el máximo
function convPool(x, cin, size, l) {
  const cout = l.b.length, half = size / 2, y = new Float32Array(cout * half * half);
  for (let co = 0; co < cout; co++) {
    for (let r = 0; r < size; r += 2) for (let k = 0; k < size; k += 2) {
      let best = 0;
      for (let dr = 0; dr < 2; dr++) for (let dk = 0; dk < 2; dk++) {
        let a = l.b[co];
        for (let ci = 0; ci < cin; ci++) {
          const wb = (co * cin + ci) * 9, xb = ci * size * size;
          for (let ky = 0; ky < 3; ky++) {
            const yy = r + dr + ky - 1;
            if (yy < 0 || yy >= size) continue;
            for (let kx = 0; kx < 3; kx++) {
              const xx = k + dk + kx - 1;
              if (xx >= 0 && xx < size) a += l.W[wb + ky * 3 + kx] * x[xb + yy * size + xx];
            }
          }
        }
        if (a > best) best = a; // ReLU y máximo a la vez: el máximo de valores con piso 0
      }
      y[co * half * half + (r / 2) * half + k / 2] = best;
    }
  }
  return y;
}

const dense = (x, l, act = Math.tanh) => l.b.map((b, j) => { let s = b; for (let i = 0; i < x.length; i++) s += x[i] * l.W[i][j]; return act(s); });

// Un paso de Einstein: lo que ve y unos pocos datos propios → giro y acelerador. `mem` guarda las dos GRU seguidas
function einsteinStep(brain, grid, scalars, mem) {
  let x = grid, size = VISTA, cin = 4;
  for (const l of brain.conv) { x = convPool(x, cin, size, l); cin = l.b.length; size /= 2; }
  x = [...dense(x, brain.proy), ...scalars];
  let off = 0;
  for (const l of brain.gru) { x = gruStep(l, x, mem, off); off += l.b.length / 3; }
  for (const l of brain.densa) x = dense(x, l);
  return x;
}

function cloneBrain(brain) {
  return brain.map(l => ({ ...l, W: l.W.map(r => r.slice()), b: l.b.slice() }));
}

// Los cerebros viejos (5 o 7 entradas, 5 neuronas ocultas) se amplían con pesos en
// cero: se comportan idéntico hasta que la evolución aprende a usar lo nuevo.
function upgradeBrain(brain) {
  const b = cloneBrain(brain);
  if (b[0].gru) return b;
  // Neuronas ocultas nuevas: sin conexiones de entrada ni de salida
  while (b[0].b.length < HIDDEN_1) {
    for (const row of b[0].W) row.push(0);
    b[0].b.push(0);
    b[1].W.push(new Array(b[1].b.length).fill(0));
  }
  while (b[0].W.length < NUM_INPUTS) b[0].W.push(new Array(b[0].b.length).fill(0));
  return b;
}

function mutateBrain(brain, rate, rng) {
  const gauss = () => {
    const u = 1 - rng(), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const b = cloneBrain(brain);
  // Una GRU tiene 25 veces más pesos y se rompe con mutaciones normales (medido: aprende 5 de 6 lecciones con 0.05 y 1 de 6 con 1)
  if (b[0].gru) rate *= 0.05;
  for (const l of b) {
    for (const row of l.W) for (let j = 0; j < row.length; j++) row[j] += gauss() * rate;
    for (let j = 0; j < l.b.length; j++) l.b[j] += gauss() * rate;
  }
  return b;
}

// ─── Pista ──────────────────────────────────────────

// Remuestrea un contorno cerrado con puntos equiespaciados
function resample(points, spacing) {
  const n = points.length, out = [];
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = carry;
    while (d < len) {
      const t = d / len;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += spacing;
    }
    carry = d - len;
  }
  return out;
}

// Una pista "bonita": curvas suaves y ningún tramo pegado a otro
function trackQuality(path) {
  const n = path.length;
  // Radio de curvatura con puntos separados ~5 posiciones
  const k = 5;
  for (let i = 0; i < n; i++) {
    const a = path[(i - k + n) % n], b = path[i], c = path[(i + k) % n];
    const a1 = Math.atan2(b[1] - a[1], b[0] - a[0]), a2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    const turn = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
    if (turn > 0 && (k * PATH_SPACING) / turn < MIN_RADIUS) return false;
  }
  // Separación entre tramos lejanos en el recorrido
  const skip = Math.ceil((MIN_CLEARANCE * 2.2) / PATH_SPACING);
  for (let i = 0; i < n; i += 2) {
    for (let j = i + skip; j < n; j += 2) {
      if (n - (j - i) < skip) break;
      const dx = path[i][0] - path[j][0], dy = path[i][1] - path[j][1];
      if (dx * dx + dy * dy < MIN_CLEARANCE * MIN_CLEARANCE) return false;
    }
  }
  return true;
}

class Track {
  // numObstacles = null → se calcula según el largo de la pista
  constructor(seed, numObstacles = null, size = 'corta', mundo = 'hipodromo') {
    this.seed = seed;
    this.mundo = MUNDOS[mundo] ? mundo : 'hipodromo';
    this.world = MUNDOS[this.mundo];
    this.size = SIZES[size] ? size : 'corta';
    const cfg = SIZES[this.size];
    this.W = cfg.W; this.H = cfg.H; this.laps = cfg.laps;
    // Se prueban semillas consecutivas hasta encontrar una pista que pase el control de calidad
    let s = seed;
    for (let tries = 0; ; tries++, s++) {
      this.path = this._generate(mulberry32(s), cfg);
      if (trackQuality(this.path) || tries > 300) break;
    }
    this.width = TRACK_HALF_WIDTH;
    this.length = 0;
    for (let i = 0; i < this.path.length; i++) {
      const a = this.path[i], b = this.path[(i + 1) % this.path.length];
      this.length += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    this._buildMask();
    if (numObstacles == null) numObstacles = Math.round(this.length / 380);
    this._placeObstacles(mulberry32(seed * 7 + 3), numObstacles);
    // El viento sopla siempre en la misma dirección, con fuerza que sube y baja
    const wr = mulberry32(seed * 13 + 5);
    this.windAngle = wr() * Math.PI * 2;
    this.windPhase = wr() * Math.PI * 2;
  }

  // Fuerza del viento en un tick (px por tick, con signo)
  windAt(tick) {
    return this.world.viento ? this.world.viento * Math.sin(tick / 48 + this.windPhase) : 0;
  }

  // Circuito tipo juego de mesa: se hace crecer una figura de celdas en una cuadrícula
  // (sin huecos ni celdas unidas solo por la esquina), su contorno da rectas y giros
  // de 90°, y cada esquina se redondea con un arco. La meta va en la recta más larga.
  _generate(rng, cfg) {
    const { W, H, cols, rows } = cfg;
    const margin = 110;
    // Columnas y filas de anchos distintos: rectas de largos variados
    const cuts = (count, total) => {
      const sizes = Array.from({ length: count }, () => 0.82 + rng() * 0.36);
      const sum = sizes.reduce((a, b) => a + b, 0);
      const out = [margin];
      for (const z of sizes) out.push(out[out.length - 1] + z / sum * total);
      return out;
    };
    const xs = cuts(cols, W - margin * 2), ys = cuts(rows, H - margin * 2);
    const minCell = Math.min(...xs.slice(1).map((v, i) => v - xs[i]), ...ys.slice(1).map((v, i) => v - ys[i]));
    const key = (x, y) => y * cols + x;
    const has = new Set();
    const inside = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
    const filled = (x, y) => inside(x, y) && has.has(key(x, y));

    const valid = () => {
      // Sin celdas que solo se toquen por una esquina
      for (let y = -1; y < rows; y++) for (let x = -1; x < cols; x++) {
        const a = filled(x, y), b = filled(x + 1, y), c = filled(x, y + 1), d = filled(x + 1, y + 1);
        if ((a && d && !b && !c) || (b && c && !a && !d)) return false;
      }
      // Sin huecos: todo lo vacío debe conectar con el exterior
      const seen = new Set(), stack = [[-1, -1]];
      while (stack.length) {
        const [x, y] = stack.pop(), k = `${x},${y}`;
        if (seen.has(k) || x < -1 || y < -1 || x > cols || y > rows || filled(x, y)) continue;
        seen.add(k);
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!filled(x, y) && !seen.has(`${x},${y}`)) return false;
      return true;
    };

    const target = Math.round(cols * rows * (0.55 + rng() * 0.25));
    has.add(key(Math.floor(rng() * cols), Math.floor(rng() * rows)));
    for (let guard = 0; has.size < target && guard < 5000; guard++) {
      const cells = [...has];
      const c = cells[Math.floor(rng() * cells.length)];
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rng() * 4)];
      const x = (c % cols) + dx, y = Math.floor(c / cols) + dy;
      if (!inside(x, y) || filled(x, y)) continue;
      has.add(key(x, y));
      if (!valid()) has.delete(key(x, y));
    }

    // Contorno: aristas dirigidas de cada celda hacia vecinos vacíos (sentido horario)
    const next = new Map();
    for (const c of has) {
      const x = c % cols, y = Math.floor(c / cols);
      if (!filled(x, y - 1)) next.set(`${x},${y}`, [x + 1, y]);
      if (!filled(x + 1, y)) next.set(`${x + 1},${y}`, [x + 1, y + 1]);
      if (!filled(x, y + 1)) next.set(`${x + 1},${y + 1}`, [x, y + 1]);
      if (!filled(x - 1, y)) next.set(`${x},${y + 1}`, [x, y]);
    }
    const startKey = next.keys().next().value;
    let loop = [startKey.split(',').map(Number)];
    for (let cur = next.get(startKey); `${cur[0]},${cur[1]}` !== startKey; cur = next.get(`${cur[0]},${cur[1]}`)) loop.push(cur);
    // Quedarse solo con las esquinas
    const n0 = loop.length;
    let corners = loop.filter((p, i) => {
      const a = loop[(i - 1 + n0) % n0], b = loop[(i + 1) % n0];
      return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
    }).map(([gx, gy]) => [xs[gx], ys[gy]]);

    // Algunas esquinas se cortan en diagonal (45°): curvas abiertas además de las cerradas
    const cut = minCell * 0.42;
    corners = corners.flatMap((V, i) => {
      if (rng() > 0.35) return [V];
      const m = corners.length, P = corners[(i - 1 + m) % m], N = corners[(i + 1) % m];
      const lp = Math.hypot(P[0] - V[0], P[1] - V[1]), ln = Math.hypot(N[0] - V[0], N[1] - V[1]);
      if (lp < cut * 2.4 || ln < cut * 2.4) return [V];
      return [[V[0] + (P[0] - V[0]) / lp * cut, V[1] + (P[1] - V[1]) / lp * cut],
              [V[0] + (N[0] - V[0]) / ln * cut, V[1] + (N[1] - V[1]) / ln * cut]];
    });

    // Redondear cada esquina con un arco tangente (sirve para 90° y para 45°)
    const pts = [];
    const m = corners.length;
    for (let i = 0; i < m; i++) {
      const P = corners[(i - 1 + m) % m], V = corners[i], N = corners[(i + 1) % m];
      const lp = Math.hypot(P[0] - V[0], P[1] - V[1]), ln = Math.hypot(N[0] - V[0], N[1] - V[1]);
      const u1 = [(P[0] - V[0]) / lp, (P[1] - V[1]) / lp], u2 = [(N[0] - V[0]) / ln, (N[1] - V[1]) / ln];
      const theta = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]))); // ángulo interior
      // Radio grande, pero sin pasarse de la mitad de los tramos vecinos
      const tanHalf = Math.tan(theta / 2);
      const R = Math.min(minCell * 0.42 * (theta > 2 ? 2.2 : 1), Math.min(lp, ln) * 0.48 * tanHalf);
      const d = R / tanHalf;                       // distancia del vértice a los puntos de tangencia
      const bis = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(bis[0], bis[1]);
      const C = [V[0] + bis[0] / bl * R / Math.sin(theta / 2), V[1] + bis[1] / bl * R / Math.sin(theta / 2)];
      const T1 = [V[0] + u1[0] * d, V[1] + u1[1] * d], T2 = [V[0] + u2[0] * d, V[1] + u2[1] * d];
      const a1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]), a2 = Math.atan2(T2[1] - C[1], T2[0] - C[0]);
      const sweep = Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1));
      for (let k = 0; k <= 12; k++) {
        const a = a1 + sweep * k / 12;
        pts.push([C[0] + Math.cos(a) * R, C[1] + Math.sin(a) * R]);
      }
    }

    // La salida y la meta en la mitad de la recta más larga, en sentido aleatorio
    let path = resample(pts, PATH_SPACING);
    if (rng() < 0.5) path.reverse();
    const n = path.length;
    let best = 0, bestLen = 0;
    for (let i = 0; i < n; ) {
      let j = i;
      const dir = p => Math.atan2(path[(p + 1) % n][1] - path[p][1], path[(p + 1) % n][0] - path[p][0]);
      while (j < i + n && Math.abs(Math.sin(dir(j % n) - dir(i % n))) < 0.01) j++;
      if (j - i > bestLen) { bestLen = j - i; best = (i + Math.floor((j - i) / 2)) % n; }
      i = Math.max(j, i + 1);
    }
    return path.slice(best).concat(path.slice(0, best));
  }

  // Máscara de "dentro de la pista" para que los sensores sean rápidos
  _buildMask() {
    const gw = this.W / GRID, gh = this.H / GRID;
    this.gw = gw; this.gh = gh;
    this.mask = new Uint8Array(gw * gh);
    const r = this.width / GRID, r2 = r * r;
    const n = this.path.length;
    // Densificamos el camino para que los círculos se solapen bien
    for (let i = 0; i < n; i++) {
      const a = this.path[i], b = this.path[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const sub = Math.max(1, Math.ceil(len / 3));
      for (let k = 0; k < sub; k++) {
        const px = (a[0] + (b[0] - a[0]) * k / sub) / GRID;
        const py = (a[1] + (b[1] - a[1]) * k / sub) / GRID;
        for (let y = Math.floor(py - r); y <= Math.ceil(py + r); y++) {
          if (y < 0 || y >= gh) continue;
          for (let x = Math.floor(px - r); x <= Math.ceil(px + r); x++) {
            if (x < 0 || x >= gw) continue;
            const dx = x - px, dy = y - py;
            if (dx * dx + dy * dy < r2) this.mask[y * gw + x] = 1;
          }
        }
      }
    }
  }

  _placeObstacles(rng, count) {
    this.obstacles = [];
    const n = this.path.length;
    if (count === 0) return;
    // Repartimos los obstáculos a lo largo de la vuelta, lejos de la salida
    const span = n * 0.85;
    for (let k = 0; k < count; k++) {
      const idx = Math.floor(n * 0.1 + (span / count) * (k + 0.2 + rng() * 0.6)) % n;
      let pick = rng(), type = this.world.obstaculos[0][0];
      for (const [t, p] of this.world.obstaculos) { type = t; if ((pick -= p) < 0) break; }
      // Lo sólido ocupa un lado de la pista: hay hueco para esquivarlo. Lo que quema, muerde o atrapa
      // también, para que el centro de la pista siempre sea seguro al volver
      const side = rng() < 0.5 ? -1 : 1, kind = OBSTACULOS[type].kind;
      const off = kind === 'salto' || kind === 'solido' ? side * (12 + rng() * 14)
        : kind === 'quema' || kind === 'ciclo' || kind === 'hoyo' ? side * (24 + rng() * 12) : (rng() - 0.5) * 40;
      const o = this.addObstacle(type, idx, off);
      if (kind === 'ciclo') o.fase = Math.floor(rng() * OBSTACULOS[type].periodo);
    }
  }

  addObstacle(type, idx, off = 0) {
    const n = this.path.length;
    idx = ((idx % n) + n) % n;
    const p = this.path[idx], q = this.path[(idx + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const o = {
      type, idx,
      x: p[0] + nx * off, y: p[1] + ny * off,
      r: OBSTACULOS[type].r, kind: OBSTACULOS[type].kind,
      angle: Math.atan2(ny, nx),
    };
    this.obstacles.push(o);
    return o;
  }

  onTrack(x, y) {
    const gx = Math.floor(x / GRID), gy = Math.floor(y / GRID);
    if (gx < 0 || gy < 0 || gx >= this.gw || gy >= this.gh) return false;
    return this.mask[gy * this.gw + gx] === 1;
  }

  // Los sensores ven bordes y lo sólido (lo que se pisa no se ve)
  blocked(x, y) {
    if (!this.onTrack(x, y)) return true;
    for (const o of this.obstacles) {
      if (o.kind !== 'salto' && o.kind !== 'solido') continue;
      const dx = x - o.x, dy = y - o.y;
      if (dx * dx + dy * dy < o.r * o.r) return true;
    }
    return false;
  }

  castRay(x, y, angle) {
    const c = Math.cos(angle), s = Math.sin(angle), reach = SENSOR_LENGTH * this.world.vision;
    for (let d = 0; d < reach; d += 5) {
      if (this.blocked(x + c * d, y + s * d)) return d;
    }
    return reach;
  }

  progress(x, y, last) {
    const n = this.path.length;
    const range = Math.max(1, Math.floor(n * 0.15));
    let best = last ?? 0, bestD = Infinity;
    const check = i => {
      const p = this.path[i];
      const d = (x - p[0]) ** 2 + (y - p[1]) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    };
    if (last == null) for (let i = 0; i < n; i++) check(i);
    else for (let o = -range; o <= range; o++) check(((last + o) % n + n) % n);
    return best;
  }

  toJSON() {
    return {
      path: this.path.map(p => [Math.round(p[0]), Math.round(p[1])]),
      width: this.width, obstacles: this.obstacles, mundo: this.mundo, windAngle: this.windAngle,
      W: this.W, H: this.H, size: this.size, laps: this.laps, length: Math.round(this.length),
    };
  }
}

// ─── Caballo ────────────────────────────────────────

class Horse {
  constructor(track, brain, opts = {}) {
    this.track = track;
    this.brain = brain && brain.einstein ? brain : upgradeBrain(brain);
    this.id = opts.id ?? 0;
    this.form = opts.form ?? 1; // "forma del día": multiplica la velocidad
    this.agility = opts.agility ?? 1; // cuánto gira: lo sube el entrenamiento de control
    this.power = opts.power ?? 1;     // fuerza al chocar: la sube el entrenamiento de choques
    const lane = opts.lane ?? 0;
    const p0 = track.path[0], p1 = track.path[1];
    this.angle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    // Parrilla de salida: carriles laterales
    this.x = p0[0] - Math.sin(this.angle) * lane;
    this.y = p0[1] + Math.cos(this.angle) * lane;
    this.speed = 0;
    this.sensors = [1, 1, 1, 1, 1];
    this.rival = [1, 0, 0, 0];
    this.place = 0;      // 0 = va primero (lo actualiza stepRace)
    this.mud = 1;
    this.mudSide = 0;    // de qué lado está el barro que tiene adelante
    this.danger = 0;     // qué tan grave es
    this.ahead = [1, 0, 0]; // cualquier obstáculo adelante: distancia, lado y si se puede saltar
    this.mudHits = 0;    // obstáculos pisados
    this.inMud = null;
    this.heading = this.angle; // hacia dónde avanza de verdad: en suelo resbaloso va detrás de la cabeza
    this.lastBite = null; // último géiser o caimán que lo atrapó
    this.lastProgress = track.progress(this.x, this.y);
    this.maxProgress = this.lastProgress;
    this.total = 0;
    this.stuck = 0;
    this.ticks = 0;
    this.finished = false;
    this.finishTick = null;
    this.falls = 0;      // salidas de pista
    this.stumbles = 0;   // choques con vallas
    this.jumps = 0;      // obstáculos saltados
    this.dodges = 0;     // obstáculos esquivados: pasó cerca sin pisarlos ni saltarlos
    this.near = new Map();
    this.hitsGiven = 0;  // embestidas a otros caballos
    this.hitsTaken = 0;
    this.hitCd = 0;
    // efectos (en ticks)
    this.fx = { boost: 0, blind: 0, freeze: 0, shield: 0, stun: 0, jump: 0, rage: 0, hit: 0, carrot: 0 };
    this.lastHit = null;
    this.mem = []; // memoria de la GRU
  }

  get laps() { return this.total / this.track.path.length; }

  _senseRival(others) {
    let best = null, bestD = RIVAL_RANGE;
    for (const o of others) {
      if (o === this || o.finished) continue;
      const d = Math.hypot(o.x - this.x, o.y - this.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (!best) { this.rival = [1, 0, 0, 0]; return; }
    let rel = Math.atan2(best.y - this.y, best.x - this.x) - this.angle;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const protectedRival = best.fx.shield > 0 || best.fx.rage > 0 ? 1 : 0;
    this.rival = [bestD / RIVAL_RANGE, rel / Math.PI, (best.speed - this.speed) / 9, protectedRival];
  }

  // Si un obstáculo con ciclo está activo o a punto de activarse
  _cycleOn(o, margin = 0) {
    const c = OBSTACULOS[o.type], t = (this.ticks + (o.fase || 0)) % c.periodo;
    return t < c.activo || t >= c.periodo - margin;
  }

  // Distancia y lado del obstáculo pisable más cercano dentro de un cono de ±30° hacia adelante
  _senseMud() {
    let best = SENSOR_LENGTH;
    this.mudSide = 0;
    this.danger = 0;
    for (const o of this.track.obstacles) {
      if (o.kind === 'salto' || o.kind === 'solido') continue;
      const dx = o.x - this.x, dy = o.y - this.y;
      const d = Math.hypot(dx, dy) - o.r;
      if (d >= best) continue;
      let rel = Math.atan2(dy, dx) - this.angle;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      if (Math.abs(rel) < Math.PI / 6 || d < 0) {
        best = Math.max(0, d);
        this.mudSide = Math.max(-1, Math.min(1, rel / (Math.PI / 6)));
        this.danger = o.kind === 'ciclo' && !this._cycleOn(o, CICLO_AVISO) ? PELIGRO_CICLO_APAGADO : PELIGRO[o.kind];
      }
    }
    return best / SENSOR_LENGTH;
  }

  // Viento respecto a la cabeza del caballo: positivo si lo empuja a su derecha
  _windSide() {
    const w = this.track.windAt(this.ticks);
    return w ? Math.max(-1, Math.min(1, w * Math.sin(this.track.windAngle - this.angle) / this.track.world.viento)) : 0;
  }

  // El obstáculo pisable que tiene debajo (los que se pisan no afectan en el aire, salvo la arena y la ciénaga)
  _patchAt() {
    for (const o of this.track.obstacles) {
      if (o.kind === 'salto' || o.kind === 'solido') continue;
      if ((this.x - o.x) ** 2 + (this.y - o.y) ** 2 >= o.r * o.r) continue;
      if (this.fx.jump > 0 && !OBSTACULOS[o.type].atrapa) continue;
      if (o.kind === 'ciclo' && !this._cycleOn(o)) continue;
      return o;
    }
    return null;
  }

  // Lo más cercano en el cono de ±30°, sea lo que sea, y qué le pasaría al llegar con la velocidad que lleva:
  //   1 lo pasa (lo salta, o es un ciclo apagado)   -0.5 se salta, pero va lento   -1 no se salta   0 no hay nada
  _senseAhead() {
    let best = SENSOR_LENGTH;
    this.ahead = [1, 0, 0];
    for (const o of this.track.obstacles) {
      const dx = o.x - this.x, dy = o.y - this.y, d = Math.hypot(dx, dy) - o.r;
      if (d >= best) continue;
      let rel = Math.atan2(dy, dx) - this.angle;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      if (Math.abs(rel) >= Math.PI / 6 && d >= 0) continue;
      best = Math.max(0, d);
      const info = OBSTACULOS[o.type], fast = this.speed >= (info.salto || this.track.world.salto);
      const pass = info.atrapa ? (o.kind === 'ciclo' && !this._cycleOn(o, CICLO_AVISO) ? 1 : -1)
        : o.kind === 'solido' ? -1 : (fast ? 1 : -0.5);
      this.ahead = [best / SENSOR_LENGTH, Math.max(-1, Math.min(1, rel / (Math.PI / 6))), pass];
    }
  }

  inputs(numHorses) {
    return [...this.sensors, ...this.rival,
      this.fx.rage > 0 ? 1 : 0, this.fx.boost > 0 ? 1 : 0,
      this.mud, numHorses > 1 ? this.place / (numHorses - 1) : 0, this.mudSide,
      this.danger, this.track.world.agarre, this._windSide(), this.track.world.salto / 6.5,
      ...this.ahead, this.speed / 9];
  }

  update(others = []) {
    if (this.finished) return;
    this.ticks++;
    const fx = this.fx;
    for (const k in fx) if (fx[k] > 0) fx[k]--;
    if (this.hitCd > 0) this.hitCd--;

    if (fx.freeze > 0 || fx.stun > 0) { this.speed = 0; return; }

    const blind = fx.blind > 0;
    for (let i = 0; i < 5; i++) {
      this.sensors[i] = blind
        ? Math.random() * 0.3
        : this.track.castRay(this.x, this.y, this.angle + SENSOR_ANGLES[i]) / SENSOR_LENGTH;
    }
    if (blind) {
      this.rival = [Math.random(), Math.random() * 2 - 1, Math.random() - 0.5, Math.round(Math.random())];
      this.mud = Math.random();
      this.mudSide = Math.random() * 2 - 1;
      this.danger = Math.random();
      this.ahead = [Math.random(), Math.random() * 2 - 1, Math.random() * 2 - 1];
    } else {
      this._senseRival(others);
      this.mud = this._senseMud();
      this._senseAhead();
    }

    // `piloto` lo usan los experimentos para que conduzca un maestro
    const [steer, gas] = this.piloto ? this.piloto(this, others)
      : this.brain.einstein ? einsteinStep(this.brain, visionGrid(this, others), (x => ESCALARES.map(i => x[i]))(this.inputs(others.length)), this.mem)
      : predict(this.brain, this.inputs(others.length), this.mem);
    this.steer = steer; this.gas = gas;

    const world = this.track.world, puddle = this._patchAt(), info = puddle && OBSTACULOS[puddle.type];
    const entered = puddle && puddle !== this.inMud;
    if (entered) this.mudHits++;
    this.inMud = puddle;
    if (puddle && puddle.kind === 'quema' && entered) {
      // Lava: el jinete lo saca y vuelve al centro, sin que lo queme otra vez al aterrizar
      this._resetToPath(Math.round(FPS * 1.2));
      fx.jump = Math.round(FPS * 2);
      this.falls++;
      return;
    }
    if (puddle && puddle.kind === 'hoyo' && entered) { fx.stun = Math.round(FPS * info.aturde); this.stumbles++; this.speed = 0; return; }
    if (puddle && puddle.kind === 'ciclo' && puddle !== this.lastBite) {
      this.lastBite = puddle;
      fx.stun = Math.round(FPS * info.aturde); fx.hit = 12; fx.jump = 0; this.stumbles++; this.speed = 0;
      return;
    }
    if (this.lastBite && (this.x - this.lastBite.x) ** 2 + (this.y - this.lastBite.y) ** 2 > 60 * 60) this.lastBite = null;

    this.angle += steer * 0.08 * this.agility * (puddle && puddle.kind === 'resbalon' ? info.giro : 1);
    if (puddle && puddle.kind === 'desvio') this.angle += info.giro * (puddle.x > this.x ? 1 : -1);
    let target = (3 + (gas + 1) * 3) * this.form * world.vel;
    if (fx.boost > 0) target *= 1.5;
    if (fx.rage > 0) target *= 1.15;
    if (fx.carrot > 0) target *= 1.35;
    this.speed = world.inercia === 1 ? target : this.speed + (target - this.speed) * world.inercia;
    if (puddle && info.freno) {
      if (world.inercia === 1) this.speed *= info.freno; else this.speed *= 1 - (1 - info.freno) * 0.15;
    }

    // Suelo resbaloso: avanza hacia donde venía y poco a poco hacia donde mira
    let da = this.angle - this.heading;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    this.heading = world.agarre === 1 ? this.angle : this.heading + da * world.agarre;
    const wind = this.track.windAt(this.ticks);
    const nx = this.x + Math.cos(this.heading) * this.speed + Math.cos(this.track.windAngle) * wind;
    const ny = this.y + Math.sin(this.heading) * this.speed + Math.sin(this.track.windAngle) * wind;

    // Vallas: con buena velocidad se saltan, si no, el caballo tropieza
    if (fx.jump === 0) {
      for (const o of this.track.obstacles) {
        const { saltable, salto } = OBSTACULOS[o.type];
        if ((o.kind !== 'salto' && o.kind !== 'solido' && !saltable) || o === this.lastHit) continue;
        if ((nx - o.x) ** 2 + (ny - o.y) ** 2 < (o.r + 6) ** 2) {
          this.lastHit = o;
          // Lo que se pisa: con buena velocidad lo salta; si no, lo pisa
          if (saltable) { if (this.speed >= (salto || world.salto) || fx.carrot > 0) { fx.jump = world.aire; this.jumps++; break; } continue; }
          // Con zanahoria el jinete lleva las riendas: siempre salta
          const need = OBSTACULOS[o.type].salto || world.salto;
          if ((o.kind === 'salto' && this.speed >= need) || fx.carrot > 0) { fx.jump = world.aire; this.jumps++; }
          else { fx.stun = Math.round(FPS * 0.8); this.stumbles++; return; }
          break;
        }
      }
    }
    if (this.lastHit && (this.x - this.lastHit.x) ** 2 + (this.y - this.lastHit.y) ** 2 > 60 * 60) this.lastHit = null;

    // Con zanahoria el jinete no deja que se salga: lo endereza hacia el trazado
    if (fx.carrot > 0 && !this.track.onTrack(nx, ny)) {
      const n = this.track.path.length, q = this.track.path[(this.lastProgress + 6) % n];
      this.angle = Math.atan2(q[1] - this.y, q[0] - this.x);
      return;
    }

    this.x = nx; this.y = ny;

    if (!this.track.onTrack(this.x, this.y)) {
      // Se sale de la pista: el jinete lo devuelve al centro, pero pierde tiempo
      this._resetToPath(Math.round(FPS * 1.2));
      this.falls++;
      return;
    }

    const n = this.track.path.length;
    const prog = this.track.progress(this.x, this.y, this.lastProgress);
    this.lastProgress = prog;
    const diff = (prog - this.maxProgress + n) % n;
    if (diff > 0 && diff < n * 0.5) {
      this.maxProgress = prog;
      this.total += diff;
      this.stuck = 0;
    } else if (++this.stuck > FPS * 4) {
      this._resetToPath(FPS);
    }
    this._countDodges();
  }

  // Esquivar vale lo mismo que saltar: cuenta los obstáculos que pasó de cerca sin tocarlos ni saltarlos
  _countDodges() {
    for (const o of this.track.obstacles) {
      const d2 = (this.x - o.x) ** 2 + (this.y - o.y) ** 2;
      if (d2 < (o.r + 30) ** 2) {
        this.near.set(o, this.near.get(o) !== false && this.fx.jump === 0 && d2 >= (o.r + 6) ** 2);
      } else if (this.near.has(o) && d2 > (o.r + 60) ** 2) {
        if (this.near.get(o)) this.dodges++;
        this.near.delete(o);
      }
    }
  }

  _resetToPath(stunTicks) {
    const n = this.track.path.length;
    const i = this.maxProgress;
    const p = this.track.path[i], q = this.track.path[(i + 2) % n];
    this.x = p[0]; this.y = p[1];
    this.angle = Math.atan2(q[1] - p[1], q[0] - p[0]);
    this.heading = this.angle;
    this.lastProgress = i;
    this.stuck = 0;
    this.near.clear();
    this.fx.stun = stunTicks;
  }
}

// ─── Choques entre caballos ─────────────────────────
// El que va "de frente" hacia el otro y más rápido lo embiste: la víctima queda
// aturdida y desviada. Devuelve la lista de embestidas para narrarlas.

function resolveCollisions(horses) {
  const events = [];
  for (let i = 0; i < horses.length; i++) {
    const a = horses[i];
    if (a.finished || a.fx.jump > 0) continue;
    for (let j = i + 1; j < horses.length; j++) {
      const b = horses[j];
      if (b.finished || b.fx.jump > 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= HIT_DIST || d === 0) continue;
      const ux = dx / d, uy = dy / d;
      // Empuje de cada uno en dirección del otro
      const pa = a.speed * a.power * (Math.cos(a.angle) * ux + Math.sin(a.angle) * uy);
      const pb = b.speed * b.power * -(Math.cos(b.angle) * ux + Math.sin(b.angle) * uy);
      // Separarlos para que no se queden encimados
      const push = (HIT_DIST - d) / 2;
      a.x -= ux * push; a.y -= uy * push;
      b.x += ux * push; b.y += uy * push;

      const [att, vic, power, dir] = pa >= pb ? [a, b, pa, 1] : [b, a, pb, -1];
      if (power < 1.5 || att.hitCd > 0 || vic.fx.stun > 0) continue;
      att.hitCd = Math.round(FPS * 0.8 / att.power);
      if (vic.fx.rage > 0 || vic.fx.shield > 0) continue;
      const stun = Math.round(FPS * (att.fx.rage > 0 ? 1.2 : 0.6));
      vic.fx.stun = Math.max(vic.fx.stun, stun);
      vic.fx.hit = 12;
      vic.angle += (Math.random() - 0.5) * 0.8;
      vic.x += ux * dir * 6; vic.y += uy * dir * 6;
      // Impulso: el que embiste sale disparado medio segundo
      att.fx.boost = Math.max(att.fx.boost, Math.round(FPS * 0.5));
      att.hitsGiven++; vic.hitsTaken++;
      events.push({ attacker: att.id, victim: vic.id });
    }
  }
  return events;
}

// Sorteo de cajones: carril de salida al azar para cada caballo (0 = el de adentro)
function drawGates(n, rnd = Math.random) {
  const lanes = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [lanes[i], lanes[j]] = [lanes[j], lanes[i]]; }
  return lanes;
}
const laneOffset = (lane, n) => (lane - (n - 1) / 2) * 12;

// Un tick de carrera completo: actualizar puestos, mover a todos y resolver choques
function stepRace(horses) {
  const order = horses.slice().sort((a, b) =>
    (a.finished !== b.finished) ? (a.finished ? -1 : 1) : a.finished ? a.finishTick - b.finishTick : b.total - a.total);
  order.forEach((h, i) => { h.place = i; });
  for (const h of horses) h.update(horses);
  return resolveCollisions(horses);
}

if (typeof module !== 'undefined') {
  module.exports = {
    Track, Horse, predict, INPUT_NAMES, cloneBrain, upgradeBrain, mutateBrain, mulberry32, visionGrid, einsteinStep, VISTA, ESCALARES,
    resolveCollisions, stepRace, drawGates, laneOffset, FPS, SIM_SPEED, SIZES, MUNDOS, OBSTACULOS,
  };
}
