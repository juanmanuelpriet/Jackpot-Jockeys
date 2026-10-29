// cuotas.js — La casa de apuestas: cuotas fijas que salen de los resultados de la partida.
//
// 1. Cada caballo tiene una "forma" (rating) que empieza en 0: en la primera carrera todos son
//    iguales y manda el azar. Después de cada carrera sube o baja según el puesto en que llegó.
// 2. La probabilidad de ganar sale de esa forma (softmax). Las combinadas usan la fórmula de
//    Harville, la de los hipódromos: P(i 1º, j 2º) = p_i · p_j / (1 − p_i), y así para el 3º.
// 3. Cuota = factor de pago del tipo / probabilidad. En la carrera 1 el factor hace que "Que gane"
//    pague x2 en cualquier caballo; carrera a carrera sube hasta la cuota normal de la casa
//    (PAYOUT): la partida se pone más jugosa a medida que avanza.

const PAYOUT = 0.85;       // desde la carrera 5 la casa devuelve en promedio el 85 % de lo apostado
const RAMP_RACES = 4;      // carreras que tarda en llegar ahí
const MIN_ODDS = 1.05;
const MAX_ODDS = 5000;
// Factor de pago de la carrera 1 (todos iguales, 6 caballos): x2, x1.5, x1.2, x4, x8, x30
const START = { ganador: 1 / 3, place: 0.5, podio: 0.6, quiniela: 4 / 15, exacta: 8 / 30, trifecta: 0.25 };
// Cuánto cambia la forma según el puesto (1º, 2º, …) y cuánto se olvida cada carrera
const PLACE_DELTA = [0.6, 0.3, 0.1, -0.15, -0.35, -0.5];
const MEMORY = 0.92, MAX_RATING = 2.5;

// Probabilidad de ganar a partir de la forma de cada caballo
function probsFromRatings(ratings) {
  const e = ratings.map(r => Math.exp(r)), sum = e.reduce((a, b) => a + b, 0);
  return e.map(x => x / sum);
}

// Nueva forma de un caballo después de llegar en el puesto `place` (0 = ganó) de `n`
function updateRating(r, place, n) {
  const k = Math.round(place * (PLACE_DELTA.length - 1) / Math.max(1, n - 1));
  return Math.max(-MAX_RATING, Math.min(MAX_RATING, r * MEMORY + PLACE_DELTA[k]));
}

// Factores de pago de cada tipo en la carrera `race` (1, 2, …) con `n` caballos, con el bono del Gran Premio.
// START está pensado para 6 caballos; se escala para que "Que gane" pague x2 aunque entren potros.
function payFactors(race, bonus = 1, n = 6) {
  const t = Math.min(1, (race - 1) / RAMP_RACES);
  return Object.fromEntries(Object.entries(START).map(([k, s0]) => {
    const s = Math.min(PAYOUT, s0 * 6 / n);
    return [k, +((s + (PAYOUT - s) * t) * bonus).toFixed(4)];
  }));
}

// Probabilidad de que la llegada empiece con `sel` (en orden), según Harville
function orderedProb(p, sel) {
  let prob = 1, used = 0;
  for (const i of sel) { prob *= p[i] / (1 - used); used += p[i]; }
  return prob;
}

// Probabilidad de acertar cada tipo de apuesta con los caballos `sel`
function betProb(type, sel, p) {
  const n = p.length, others = i => [...Array(n).keys()].filter(x => x !== i);
  const i = sel[0];
  switch (type) {
    case 'ganador': return p[i];
    case 'place': return p[i] + others(i).reduce((a, j) => a + orderedProb(p, [j, i]), 0);
    case 'podio': {
      let prob = p[i];
      for (const j of others(i)) {
        prob += orderedProb(p, [j, i]);
        for (const k of others(i)) if (k !== j) prob += orderedProb(p, [j, k, i]);
      }
      return prob;
    }
    case 'quiniela': return orderedProb(p, [sel[0], sel[1]]) + orderedProb(p, [sel[1], sel[0]]);
    case 'exacta': return orderedProb(p, sel.slice(0, 2));
    case 'trifecta': return orderedProb(p, sel.slice(0, 3));
    default: return 0;
  }
}

// Cuota fija que ofrece la casa con los factores de pago `pay` (de payFactors)
function oddsFor(type, sel, p, pay) {
  const prob = betProb(type, sel, p);
  if (!(prob > 0)) return MAX_ODDS;
  return +Math.min(MAX_ODDS, Math.max(MIN_ODDS, pay[type] / prob)).toFixed(2);
}

module.exports = { probsFromRatings, updateRating, payFactors, betProb, oddsFor, orderedProb };
