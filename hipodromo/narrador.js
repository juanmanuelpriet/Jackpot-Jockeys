// narrador.js — Frases del narrador. {h} caballo, {a} atacante, {v} víctima,
// {p} jugador, {n} número, {s} tamaño de pista.

const LINES = {
  apuestas: [
    'Carrera {n} en pista {s}. Las redes neuronales calientan. Las billeteras también.',
    'Abiertas las apuestas de la carrera {n}. Recuerden: el caballo no sabe que existe el dinero.',
    'Carrera {n}. Seis cerebros artificiales, cero sentido común. Apuesten con responsabilidad.',
    'Carrera {n} en pista {s}. Los caballos repasan sus pesos sinápticos.',
  ],
  salida: [
    '¡Se abren los cajones! Arrancan.',
    '¡Y salen! Seis redes neuronales y una sola meta.',
    '¡Arrancan! Que el gradiente los acompañe.',
  ],
  embestida: [
    '{a} le pasa por encima a {v}. Eso no fue estrategia, fue un divorcio.',
    '{a} embiste a {v}. Los jueces lo revisan… y no les importa.',
    '{v} recibe un empujón de {a}. Ni en hora pico.',
    '{a} saluda a {v} con el hombro. Muy cordial.',
    '{a} decidió que {v} estaba en su carril. {v} no opina igual.',
    'Choque entre {a} y {v}. La red de {a} aprendió esto a propósito.',
  ],
  salida_pista: [
    '{h} decidió que la pista era una sugerencia.',
    '{h} se fue a saludar a la tribuna.',
    '{h} toma un atajo por el pasto. No cuenta, campeón.',
    '{h} se sale. Alguien revise esos pesos.',
  ],
  tropiezo: [
    '{h} se lleva la valla puesta. Valla 1, {h} 0.',
    '{h} tropieza. Se le olvidó que existían las vallas.',
    '{h} frena en seco frente a la valla. Duda existencial.',
  ],
  salto: [
    '{h} vuela la valla con elegancia de comercial de perfume.',
    'Qué salto de {h}. Ni la gravedad se lo esperaba.',
  ],
  punta: [
    '{h} toma la punta. Alguien entrenó bien a esta red.',
    'Nuevo líder: {h}. Las apuestas tiemblan.',
    '{h} pasa al frente. Puro descenso de gradiente.',
  ],
  zanahoria: ['{p} le da una zanahoria a {h}. Dopaje vegetal, totalmente legal.', '{p} motiva a {h} con una zanahoria. Funciona con caballos y con pasantes.'],
  escudo: ['{p} le pone escudo a {h}. Intocable por seis segundos.', '{h} recibe escudo de {p}. Ahora sí, que vengan.'],
  vendas: ['{p} le tapa los ojos a {h}. Ahora corre por pura fe.', '{p} venda a {h}. Sus sensores ven puro ruido.'],
  lazo: ['{p} laza a {h}. Esto ya es rodeo.', '{h} queda lazado por {p}. Yiii-ja.'],
  furia: ['{h} entra en modo furia gracias a {p}. Que alguien llame a su terapeuta.', '{p} enfurece a {h}. Apártense.'],
  charco: ['{p} le tira barro a {h}. Clásico.', 'Charco cortesía de {p} justo frente a {h}.'],
  rayo: ['¡RAYO de {p}! Todos congelados menos {h}.', '{p} lanza un rayo. Física cuántica equina a favor de {h}.'],
  bloqueado: ['El escudo de {h} rebota lo de {p}. Plata perdida.', '{p} intentó sabotear a {h}, pero el escudo dijo que no.'],
  meta: ['¡{h} cruza primero la meta!', '¡{h} gana! Las redes neuronales también tienen días buenos.'],
  jackpot: ['Nadie le apostó a {h}. El jackpot crece y la casa sonríe.', 'Ganó {h} y nadie le creyó. Jackpot acumulado.'],
  reparto: ['Ganó {h}. Hay cobro para los que creyeron.', '{h} paga. Alguien hoy invita la cena.'],
};

// Frase final para la tarjeta de resultados
const QUIPS = {
  foto: ['Foto finish. Lo definió un píxel.', 'Por una nariz. Literalmente.'],
  paliza: ['Ganó con tanta ventaja que le dio tiempo de almorzar.', 'Los demás todavía están buscando la meta.'],
  normal: ['Victoria limpia. Bueno, casi limpia.', 'Entrenamiento, suerte y un poco de caos.', 'Ni los pesos sinápticos lo vieron venir.'],
};

const pick = list => list[Math.floor(Math.random() * list.length)];

// No repetir la misma frase dos veces seguidas para un mismo tipo de evento
const lastUsed = {};
function say(kind, vars = {}) {
  const list = LINES[kind];
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === lastUsed[kind]) i = (i + 1) % list.length;
  lastUsed[kind] = i;
  return list[i].replace(/\{(\w)\}/g, (_, k) => vars[k] ?? '');
}

function quip(gap, margin) {
  if (gap != null && gap < 0.2) return pick(QUIPS.foto);
  if (margin != null && margin > 3) return pick(QUIPS.paliza);
  return pick(QUIPS.normal);
}

module.exports = { say, quip };
