// cuotas.js — La casa de apuestas: cuotas fijas que salen de los resultados de la partida.
//
// 1. Punto de partida: cuánto gana cada personalidad en cada mundo según simulaciones (cuotas_mundo.json).
// 2. Las victorias reales corrigen ese punto de partida: se comparan las carreras que ganó cada caballo en el
//    juego con las que se esperaban de él (winFactor). Al principio pesa poco, porque pocas carreras son azar,
//    y lo viejo se va olvidando, porque los caballos aprenden.
// 3. Las combinadas usan la fórmula de Harville, la de los hipódromos: P(i 1º, j 2º) = p_i · p_j / (1 − p_i),
//    y así para el 3º.
// 4. Cuota = factor de pago del tipo / probabilidad. En la carrera 1 el factor hace que "Que gane"
//    pague x2 en cualquier caballo; carrera a carrera sube hasta la cuota normal de la casa
//    (PAYOUT): la partida se pone más jugosa a medida que avanza.
// 5. Ninguna cuota supera ODDS_CAP veces lo que pagaría si todos fueran iguales: el que casi nunca gana
//    no puede pagar tanto que apostarle siempre le gane a la casa.

const PAYOUT = 0.80;       // desde la carrera 5 la casa devuelve como mucho ~80-87 % de lo apostado
const ODDS_CAP = 1.2;      // ninguna cuota paga más de 1.2 × la cuota con todos iguales
const RAMP_RACES = 4;      // carreras que tarda en llegar ahí
const MIN_ODDS = 1.05;
const MAX_ODDS = 5000;
// Factor de pago de la carrera 1 (todos iguales, 6 caballos): x2, x1.5, x1.2, x4, x8, x30
const START = { ganador: 1 / 3, place: 0.5, podio: 0.6, quiniela: 4 / 15, exacta: 8 / 30, trifecta: 0.25 };
const WIN_PRIOR = 5;       // victorias que debe acumular un caballo para que su historial pese tanto como la simulación
const WIN_MEMORY = 0.98;   // lo que se conserva del historial por carrera: pesan las últimas ~50

// Cuánto más (o menos) gana un caballo de lo esperado. `rec` = { wins, expected }; sin historial vale 1
const winFactor = (rec = {}) => ((rec.wins || 0) + WIN_PRIOR) / ((rec.expected || 0) + WIN_PRIOR);

// Historial de un caballo después de una carrera en la que se esperaba que ganara con probabilidad `expected`
const recordRace = (rec = {}, won, expected) => ({
  wins: (rec.wins || 0) * WIN_MEMORY + (won ? 1 : 0),
  expected: (rec.expected || 0) * WIN_MEMORY + expected,
});

// Ventaja que da un cuerpo entrenado: multiplica su probabilidad antes de normalizar. La casa conoce lo
// entrenado, porque en simulación un potro al tope gana ~60 % de las carreras y sin esto pagaría de más.
function trainedEdge(body = {}) {
  return Math.exp(20 * (body.speed || 0) + 4 * (body.agility || 0));
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
  const even = pay[type] / betProb(type, sel, p.map(() => 1 / p.length)); // si todos fueran iguales
  return +Math.min(MAX_ODDS, Math.max(MIN_ODDS, Math.min(pay[type] / prob, even * ODDS_CAP))).toFixed(2);
}

module.exports = { winFactor, recordRace, trainedEdge, payFactors, betProb, oddsFor, orderedProb, ODDS_CAP };
