// cuotas.js — La casa de apuestas: probabilidades y cuotas fijas, como en un hipódromo.
//
// 1. Antes de cada carrera se simula la misma carrera muchas veces (misma pista, cajones,
//    forma del día y redes neuronales, con un poco de ruido) para estimar la probabilidad de
//    que gane cada caballo. Corre en un hilo aparte (cuotasWorker.js) para no frenar el juego.
// 2. Las probabilidades de las combinadas salen de la fórmula de Harville, la que usan los
//    hipódromos: P(i 1º, j 2º) = p_i · p_j / (1 − p_i), y así para el 3º.
// 3. Cuota = (1 − margen de la casa) / probabilidad. Lo que ves en el boleto es lo que cobras.

const MARGIN = 0.10;       // la casa se queda en promedio el 10 % de lo apostado
const MIN_ODDS = 1.05;
const MAX_ODDS = 5000;

// Probabilidad de ganar a partir de las victorias simuladas, suavizada para que nadie quede en 0
function winProbs(wins, sims) {
  const n = wins.length;
  return wins.map(w => 0.92 * (w + 0.5) / (sims + 0.5 * n) + 0.08 / n);
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

// Cuota fija que ofrece la casa (bonus = 1.5 en el Gran Premio)
function oddsFor(type, sel, p, bonus = 1) {
  const prob = betProb(type, sel, p);
  if (!(prob > 0)) return MAX_ODDS;
  const raw = (1 - MARGIN) / prob;
  return +Math.min(MAX_ODDS, Math.max(MIN_ODDS, raw * bonus)).toFixed(2);
}

module.exports = { winProbs, betProb, oddsFor, orderedProb, MARGIN };
