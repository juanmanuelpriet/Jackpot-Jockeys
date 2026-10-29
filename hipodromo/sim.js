// sim.js — Simulación de la carrera: pista, obstáculos, caballos y red neuronal.
// Es un port del simulador F1 en Python (track.py / car.py / brain.py) con las
// mismas físicas, para que los cerebros entrenados se comporten igual.

const WIDTH = 1200, HEIGHT = 800;
const SENSOR_LENGTH = 180;
const TRACK_HALF_WIDTH = 50;
const SENSOR_ANGLES = [-Math.PI / 2.5, -Math.PI / 5, 0, Math.PI / 5, Math.PI / 2.5];
const GRID = 2; // resolución (px) de la máscara de pista

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

function segIntersect(A, B, C, D) {
  const ccw = (A, B, C) => (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0]);
  return ccw(A, C, D) !== ccw(B, C, D) && ccw(A, B, C) !== ccw(A, B, D);
}

// ─── Red neuronal (5 → 5 → 3 → 3 → 2, tanh) ─────────

function predict(brain, input) {
  let x = input;
  for (const layer of brain) {
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

function cloneBrain(brain) {
  return brain.map(l => ({ W: l.W.map(r => r.slice()), b: l.b.slice() }));
}

function mutateBrain(brain, rate, rng) {
  const gauss = () => {
    const u = 1 - rng(), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const b = cloneBrain(brain);
  for (const l of b) {
    for (const row of l.W) for (let j = 0; j < row.length; j++) row[j] += gauss() * rate;
    for (let j = 0; j < l.b.length; j++) l.b[j] += gauss() * rate;
  }
  return b;
}

// ─── Pista ──────────────────────────────────────────

function catmullRom(P0, P1, P2, P3, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / n, t2 = t * t, t3 = t2 * t;
    const f = k => 0.5 * ((2 * P1[k]) + (-P0[k] + P2[k]) * t +
      (2 * P0[k] - 5 * P1[k] + 4 * P2[k] - P3[k]) * t2 +
      (-P0[k] + 3 * P1[k] - 3 * P2[k] + P3[k]) * t3);
    pts.push([f(0), f(1)]);
  }
  return pts;
}

function selfIntersecting(points) {
  const n = points.length, step = 5;
  for (let i = 0; i < n - step; i += step) {
    for (let j = i + step * 2; j < n; j += step) {
      if ((j + step) % n === i) continue;
      if (segIntersect(points[i], points[i + step], points[j], points[(j + step) % n])) return true;
    }
  }
  return false;
}

class Track {
  constructor(seed, numObstacles = 8) {
    this.seed = seed;
    let s = seed;
    while (true) {
      this.path = this._generate(mulberry32(s));
      if (!selfIntersecting(this.path)) break;
      s++;
    }
    this.width = TRACK_HALF_WIDTH;
    this._buildMask();
    this._placeObstacles(mulberry32(seed * 7 + 3), numObstacles);
  }

  _generate(rng) {
    const uni = (a, b) => a + rng() * (b - a);
    const randint = (a, b) => a + Math.floor(rng() * (b - a + 1));
    const cx = WIDTH / 2, cy = HEIGHT / 2;
    const N = randint(12, 18);
    const steps = Array.from({ length: N }, () => uni(0.1, 1.2));
    const total = steps.reduce((a, b) => a + b, 0);
    const thetas = [];
    let acc = 0;
    for (const st of steps) { thetas.push(acc); acc += (st / total) * 2 * Math.PI; }

    const amps = [0, 1, 2].map(i => Math.min(WIDTH, HEIGHT) * 0.15 * 0.5 ** i);
    const freqs = [0, 1, 2].map(i => randint(1, 3) * 2 ** i);
    const phases = [0, 1, 2].map(() => uni(0, 2 * Math.PI));
    const baseR = Math.min(WIDTH, HEIGHT) * 0.32;

    const base = thetas.map(th => {
      let r = baseR;
      for (let i = 0; i < 3; i++) r += amps[i] * Math.sin(freqs[i] * th + phases[i]);
      return [
        Math.max(80, Math.min(WIDTH - 80, cx + r * 1.35 * Math.cos(th))),
        Math.max(80, Math.min(HEIGHT - 80, cy + r * 0.85 * Math.sin(th))),
      ];
    });
    const path = [];
    const M = base.length;
    for (let i = 0; i < M; i++) {
      path.push(...catmullRom(base[(i - 1 + M) % M], base[i], base[(i + 1) % M], base[(i + 2) % M], 25));
    }
    return path;
  }

  // Máscara de "dentro de la pista" para que los sensores sean rápidos
  _buildMask() {
    const gw = WIDTH / GRID, gh = HEIGHT / GRID;
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
      const p = this.path[idx], q = this.path[(idx + 1) % n];
      const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const type = rng() < 0.65 ? 'valla' : 'barro';
      // Las vallas ocupan un lado de la pista: hay hueco para esquivarlas o se saltan
      const side = rng() < 0.5 ? -1 : 1;
      const off = type === 'valla' ? side * (12 + rng() * 14) : (rng() - 0.5) * 40;
      this.obstacles.push({
        type, idx,
        x: p[0] + nx * off, y: p[1] + ny * off,
        r: type === 'valla' ? 14 : 22,
        angle: Math.atan2(ny, nx),
      });
    }
  }

  onTrack(x, y) {
    const gx = Math.floor(x / GRID), gy = Math.floor(y / GRID);
    if (gx < 0 || gy < 0 || gx >= WIDTH / GRID || gy >= HEIGHT / GRID) return false;
    return this.mask[gy * (WIDTH / GRID) + gx] === 1;
  }

  // Los sensores ven bordes y vallas (el barro no se ve)
  blocked(x, y) {
    if (!this.onTrack(x, y)) return true;
    for (const o of this.obstacles) {
      if (o.type !== 'valla') continue;
      const dx = x - o.x, dy = y - o.y;
      if (dx * dx + dy * dy < o.r * o.r) return true;
    }
    return false;
  }

  castRay(x, y, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    for (let d = 0; d < SENSOR_LENGTH; d += 5) {
      if (this.blocked(x + c * d, y + s * d)) return d;
    }
    return SENSOR_LENGTH;
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
    return { path: this.path.map(p => [Math.round(p[0]), Math.round(p[1])]), width: this.width, obstacles: this.obstacles };
  }
}

// ─── Caballo ────────────────────────────────────────

const FPS = 30; // ticks de simulación por segundo

class Horse {
  constructor(track, brain, opts = {}) {
    this.track = track;
    this.brain = brain;
    this.id = opts.id ?? 0;
    this.form = opts.form ?? 1; // "forma del día": multiplica la velocidad
    const lane = opts.lane ?? 0;
    const p0 = track.path[0], p1 = track.path[1];
    this.angle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    // Parrilla de salida: carriles laterales
    this.x = p0[0] - Math.sin(this.angle) * lane;
    this.y = p0[1] + Math.cos(this.angle) * lane;
    this.speed = 0;
    this.sensors = [1, 1, 1, 1, 1];
    this.lastProgress = track.progress(this.x, this.y);
    this.maxProgress = this.lastProgress;
    this.total = 0;
    this.stuck = 0;
    this.ticks = 0;
    this.finished = false;
    this.finishTick = null;
    this.falls = 0;      // salidas de pista
    this.stumbles = 0;   // choques con vallas
    this.jumps = 0;      // vallas saltadas
    // efectos (en ticks)
    this.fx = { boost: 0, blind: 0, freeze: 0, shield: 0, stun: 0, jump: 0 };
    this.lastHit = null;
  }

  get laps() { return this.total / this.track.path.length; }

  update() {
    if (this.finished) return;
    this.ticks++;
    const fx = this.fx;
    for (const k in fx) if (fx[k] > 0) fx[k]--;

    if (fx.freeze > 0 || fx.stun > 0) { this.speed = 0; return; }

    for (let i = 0; i < 5; i++) {
      this.sensors[i] = fx.blind > 0
        ? Math.random() * 0.3
        : this.track.castRay(this.x, this.y, this.angle + SENSOR_ANGLES[i]) / SENSOR_LENGTH;
    }
    const [steer, gas] = predict(this.brain, this.sensors);
    this.steer = steer; this.gas = gas;

    this.angle += steer * 0.08;
    this.speed = (3 + (gas + 1) * 3) * this.form;
    if (fx.boost > 0) this.speed *= 1.5;

    // Barro: frena mientras se pisa
    for (const o of this.track.obstacles) {
      if (o.type === 'barro' && (this.x - o.x) ** 2 + (this.y - o.y) ** 2 < o.r * o.r) {
        this.speed *= 0.55;
        break;
      }
    }

    const nx = this.x + Math.cos(this.angle) * this.speed;
    const ny = this.y + Math.sin(this.angle) * this.speed;

    // Vallas: con buena velocidad se saltan, si no, el caballo tropieza
    if (fx.jump === 0) {
      for (const o of this.track.obstacles) {
        if (o.type !== 'valla' || o === this.lastHit) continue;
        if ((nx - o.x) ** 2 + (ny - o.y) ** 2 < (o.r + 6) ** 2) {
          this.lastHit = o;
          if (this.speed >= 6.5) { fx.jump = 10; this.jumps++; }
          else { fx.stun = Math.round(FPS * 0.8); this.stumbles++; return; }
          break;
        }
      }
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
      if (this.lastHit && this.track.obstacles.indexOf(this.lastHit) >= 0 &&
          Math.abs(prog - this.lastHit.idx) > 15) this.lastHit = null;
    } else if (++this.stuck > FPS * 4) {
      this._resetToPath(FPS);
    }
  }

  _resetToPath(stunTicks) {
    const n = this.track.path.length;
    const i = this.maxProgress;
    const p = this.track.path[i], q = this.track.path[(i + 2) % n];
    this.x = p[0]; this.y = p[1];
    this.angle = Math.atan2(q[1] - p[1], q[0] - p[0]);
    this.lastProgress = i;
    this.stuck = 0;
    this.fx.stun = stunTicks;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { Track, Horse, predict, cloneBrain, mutateBrain, mulberry32, FPS, WIDTH, HEIGHT };
}
