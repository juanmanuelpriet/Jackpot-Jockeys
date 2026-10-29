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
  casa: ['Ganó {h} y nadie acertó. La casa se queda con todo y sonríe.', 'Ganó {h}. Boletos al piso: hoy la banca invita… a nada.'],
  reparto: ['Ganó {h}. Hay cobro para los que creyeron.', '{h} paga. Alguien hoy invita la cena.'],
  gran_premio: ['¡GRAN PREMIO! Última carrera: la casa pone 50 % extra al pozo.', 'Llegó el Gran Premio. Aquí se hacen las fortunas… y las deudas.'],
  fin_partida: ['¡Se acabó la partida! {p} se lleva la noche.', 'Fin de la partida. {p} es el rey del hipódromo, por ahora.'],
  prestamo: ['{p} llamó a Don Caballone. {n} fichas al 12 % por carrera. Qué podría salir mal.', 'La mafia le presta {n} a {p}. Sonríen. Eso nunca es buena señal.'],
  cobrador: ['El cobrador de Don Caballone se queda con {n} fichas de {p}.', '{p} cobra, pero la mafia pasó primero: {n} fichas para Don Caballone.'],
  pago_mafia: ['{p} le paga {n} a la mafia. Don Caballone asiente.', '{p} salda {n} con la mafia. Sus rodillas lo agradecen.'],
  mafia_favor: ['La mafia "arregla" la carrera de {h}. Encargo de {p}.', '{h} recibe la visita de Don Caballone. Cortesía de {p}.'],
  peña_nueva: ['{p} funda la peña «{n}».', 'Nace «{n}», idea de {p}. Ya huele a conspiración.'],
  peña_union: ['{p} se une a «{n}». La conspiración crece.', '«{n}» suma a {p}. Los demás, cuidado.'],
  traicion: ['¡TRAICIÓN! {p} apuñala a «{n}» y se lleva {h} fichas. Judas tiene nuevo apellido.', '{p} traiciona a su peña «{n}» y se embolsa {h}. Esto no se olvida.'],
  combo: ['¡COMBO de «{n}» sobre {h}! Efecto doble.', '«{n}» coordina el ataque contra {h}. Doble castigo.'],
  regalo: ['{p} le pasa {n} fichas a {h}. La peña es la peña.', '{p} rescata a {h} con {n} fichas. Amistad verdadera.'],
  potro: ['{p} compra un potro: {h}. Que la red lo acompañe.', 'Nuevo en el establo: {h}, propiedad de {p}.'],
  entreno: ['{p} manda a {h} a entrenar {n}. Volverá distinto.', '{h} se va al gimnasio neuronal ({n}). Pagó {p}.'],
  entreno_fin: ['{h} terminó de entrenar y ya está en nivel {n}.', 'Volvió {h} del entrenamiento, ahora nivel {n}. Se le ve el brillo en los pesos.'],
  propietario: ['Premio de propietario para {p}: su caballo {h} ganó.', '{p} cobra como dueño de {h}. Inversión que paga.'],
  listos: ['Todos listos. ¡Arrancan en 5 segundos!', 'Apuestas cerradas por aclamación popular. Cinco segundos.'],
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
