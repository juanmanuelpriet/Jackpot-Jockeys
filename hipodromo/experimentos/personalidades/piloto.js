// piloto.js — Caballo sin red: conoce toda la pista y las reglas. Apunta al punto más lejano al que llega en línea recta sin
// salirse ni pisar lo que frena o atrapa, y ensaya unos ticks hacia adelante para correr lo más rápido sin salirse.
const { OBSTACULOS } = require('./mundos');
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const MARGEN = +(process.env.P_M || 10), HORIZ = +(process.env.P_H || 14), ALCANCE = 110, PASO = 3, LADOS = [0, -14, 14, -28, 28, -38, 38];
const NIVELES = [1, .94, .88, .82, .76, .7, .62, .54, .46, .38];

function evita(o, h, salto) {
  const info = OBSTACULOS[o.type];
  if (o.kind === 'salto') return h.speed < (info.salto || salto) + 0.3;
  if (info.saltable) return h.speed < salto + 0.3;
  return true;
}
function libre(tr, x0, y0, x1, y1, malos) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(d / 12)), ux = (x1 - x0) / (d || 1), uy = (y1 - y0) / (d || 1);
  for (let i = 1; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    if (!tr.onTrack(x + uy * MARGEN, y - ux * MARGEN) || !tr.onTrack(x - uy * MARGEN, y + ux * MARGEN)) return false;
  }
  for (const o of malos) {
    const t = Math.max(0, Math.min(d, (o.x - x0) * ux + (o.y - y0) * uy));
    if ((x0 + ux * t - o.x) ** 2 + (y0 + uy * t - o.y) ** 2 < (o.r + MARGEN) ** 2) return false;
  }
  return true;
}
function apunta(tr, x, y, last, malos) {
  const path = tr.path, n = path.length;
  for (let k = ALCANCE; k >= 3; k -= PASO) {
    const i = (last + k) % n, p = path[i], q = path[(i + 1) % n], len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const nx = -(q[1] - p[1]) / len, ny = (q[0] - p[0]) / len;
    for (const off of LADOS) {
      const a = p[0] + nx * off, b = p[1] + ny * off;
      if (libre(tr, x, y, a, b, malos)) return [a, b, last + k];
    }
  }
  const p = path[(last + 3) % n];
  return [p[0], p[1], last + 3];
}
function mando(x, y, angle, heading, t, tr, w, wind, giro) {
  const dir = Math.atan2(t[1] - y - Math.sin(tr.windAngle) * wind, t[0] - x - Math.cos(tr.windAngle) * wind);
  const lag = w.agarre === 1 ? 0 : wrap(dir - heading) * (1 / w.agarre - 1) * 0.5;
  return Math.max(-1, Math.min(1, wrap(dir + Math.max(-.8, Math.min(.8, lag)) - angle) / giro));
}
// Ensayo: con esta velocidad, ¿sigue en la pista?
function ensaya(h, v, t0, tr, w, wind, giro) {
  let x = h.x, y = h.y, a = h.angle, hd = h.heading, s = h.speed, t = t0, ti = t0[2];
  const path = tr.path, n = path.length, vx = Math.cos(tr.windAngle) * wind, vy = Math.sin(tr.windAngle) * wind;
  for (let i = 0; i < HORIZ; i++) {
    if ((x - t[0]) ** 2 + (y - t[1]) ** 2 < (s * 3) ** 2) { ti += 8; const p = path[ti % n]; t = [p[0], p[1], ti]; }
    a += mando(x, y, a, hd, t, tr, w, wind, giro) * giro;
    s = w.inercia === 1 ? v : s + (v - s) * w.inercia;
    const da = wrap(a - hd); hd = w.agarre === 1 ? a : hd + da * w.agarre;
    x += Math.cos(hd) * s + vx; y += Math.sin(hd) * s + vy;
    if (!tr.onTrack(x, y)) return false;
  }
  return true;
}
function piloto(h) {
  const tr = h.track, w = tr.world, wind = tr.windAt(h.ticks), giro = 0.08 * (h.agility || 1);
  const malos = tr.obstacles.filter(o => (o.x - h.x) ** 2 + (o.y - h.y) ** 2 < 500 ** 2 && evita(o, h, w.salto));
  const t = apunta(tr, h.x, h.y, h.lastProgress, malos);
  const tope = 9 * h.form * w.vel * (process.env.JJ_AGUANTE === '1' ? 0.89 : 1);
  let quiere = tope * NIVELES[NIVELES.length - 1];
  for (const f of NIVELES) if (ensaya(h, tope * f, t, tr, w, wind, giro)) { quiere = tope * f; break; }
  return [mando(h.x, h.y, h.angle, h.heading, t, tr, w, wind, giro), Math.max(-1, Math.min(1, (quiere / (h.form * w.vel) - 3) / 3 - 1))];
}
// Personalidad: solo usa lo que la red también percibe (rival más cercano y puesto). Quien embiste va a buscar al rival que tiene
// a tiro con cierto acelerador mínimo, y el muy bravo ni mira si se sale (`fijo`); el corredor esquiva.
const ESTILOS = { corredor: { esquiva: .28 },
  picaro: { alcance: +(process.env.E_PA || .35), cono: .6, gas: .6 },
  bravo: { alcance: +(process.env.E_BA || .7), cono: 1.1, gas: .85 },
  muybravo: { alcance: 1, cono: 1.8, gas: 1, fijo: process.env.E_FIJO !== '0' } };
const tope1 = v => Math.max(-1, Math.min(1, v));
function conEstilo(pers) {
  const e = ESTILOS[pers];
  return h => {
    const base = piloto(h), [d, rel, , prot] = h.rival, ang = rel * Math.PI, giro = 0.08 * (h.agility || 1);
    if (e.esquiva) {
      if (d >= e.esquiva || Math.abs(ang) > .7) return base;
      return [tope1(base[0] - Math.sign(ang || 1) * .5), base[1]];
    }
    if (!prot && d < e.alcance && Math.abs(ang) <= e.cono) {
      const dist = d * 120, x = h.x + Math.cos(h.angle + ang) * dist, y = h.y + Math.sin(h.angle + ang) * dist, tr = h.track, w = tr.world;
      const malos = tr.obstacles.filter(o => (o.x - h.x) ** 2 + (o.y - h.y) ** 2 < 200 ** 2 && evita(o, h, w.salto));
      const ok = tr.onTrack(x, y) && malos.every(o => { const dd = Math.max(1, dist), ux = (x - h.x) / dd, uy = (y - h.y) / dd, t = Math.max(0, Math.min(dd, (o.x - h.x) * ux + (o.y - h.y) * uy)); return (h.x + ux * t - o.x) ** 2 + (h.y + uy * t - o.y) ** 2 >= (o.r + 8) ** 2; });
      if (ok || e.fijo) return [tope1(ang / giro), Math.max(base[1], e.gas)];
    }
    return base;
  };
}
module.exports = { piloto, conEstilo, ESTILOS };
