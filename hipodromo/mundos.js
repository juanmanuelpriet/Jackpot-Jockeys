// mundos.js — Los mundos donde se corre: cada uno cambia la física y tiene obstáculos propios.
// `hipodromo` es la carrera clásica: todos sus valores dejan la física igual que siempre.
//
//   vel       multiplica la velocidad
//   agarre    qué tan rápido la dirección de avance sigue a la cabeza (1 = sin derrapar)
//   inercia   qué tan rápido cambia la velocidad (1 = al instante)
//   vision    alcance de los sensores (1 = completo)
//   viento    empuje lateral máximo, en px por tick
//   salto     velocidad mínima para saltar  ·  aire: ticks en el aire

const MUNDOS = {
  hipodromo: { name: 'Hipódromo', icon: '🏇', desc: 'La carrera clásica: vallas y barro.', vel: 1, agarre: 1, inercia: 1, vision: 1, viento: 0, salto: 6.5, aire: 10,
    obstaculos: [['valla', 0.65], ['barro', 0.35]] },
  nieve: { name: 'Nieve', icon: '❄️', desc: 'Se derrapa en las curvas. Hielo sin control, montones de nieve y pinos.', vel: 0.95, agarre: 0.3, inercia: 1, vision: 1, viento: 0, salto: 6.5, aire: 10,
    obstaculos: [['pino', 0.35], ['hielo', 0.35], ['nevada', 0.3]] },
  luna: { name: 'Luna', icon: '🌙', desc: 'Poca gravedad: saltos largos y le cuesta acelerar. Rocas y cráteres.', vel: 1.05, agarre: 0.7, inercia: 0.08, vision: 1, viento: 0, salto: 4.5, aire: 24,
    obstaculos: [['roca', 0.5], ['crater', 0.5]] },
  volcan: { name: 'Volcán', icon: '🌋', desc: 'La ceniza acorta la vista. La lava quema y los géiseres revientan.', vel: 1, agarre: 1, inercia: 1, vision: 0.55, viento: 0, salto: 6.5, aire: 10,
    obstaculos: [['lava', 0.4], ['geiser', 0.4], ['basalto', 0.2]] },
  desierto: { name: 'Desierto', icon: '🏜️', desc: 'El viento empuja de lado. Cactus, arena blanda y remolinos.', vel: 1, agarre: 1, inercia: 1, vision: 1, viento: 1.3, salto: 6.5, aire: 10,
    obstaculos: [['cactus', 0.35], ['arena', 0.35], ['remolino', 0.3]] },
  pantano: { name: 'Pantano', icon: '🐊', desc: 'Suelo blando. Troncos altos, ciénaga y caimanes que muerden.', vel: 0.97, agarre: 0.65, inercia: 0.35, vision: 1, viento: 0, salto: 6.5, aire: 10,
    obstaculos: [['caiman', 0.55], ['tronco', 0.25], ['cienaga', 0.2]] },
};

// Cómo actúa cada obstáculo:
//   salto      se salta con velocidad; si no, tropieza          solido    no se salta: siempre tropieza
//   lento      frena mientras se pisa (`freno`)                 resbalon  casi no deja girar (`giro`)
//   hoyo       al caer queda aturdido (`aturde` en s)           quema     vuelve al centro y pierde tiempo
//   desvio     lo hace girar mientras lo pisa (`giro`)          ciclo     se activa cada `periodo` ticks durante `activo`
//   saltable   se salta con velocidad (`salto`, si pide más que el mundo); si no, se pisa y hace su efecto
//   atrapa     saltarlo no salva: también alcanza al que va en el aire
const OBSTACULOS = {
  valla: { kind: 'salto', r: 14 },
  barro: { kind: 'lento', r: 22, freno: 0.55, saltable: true },
  pino: { kind: 'solido', r: 13 },
  hielo: { kind: 'resbalon', r: 26, giro: 0.15, saltable: true },
  nevada: { kind: 'lento', r: 24, freno: 0.6, saltable: true },
  roca: { kind: 'salto', r: 13 },
  crater: { kind: 'hoyo', r: 14, aturde: 0.8, saltable: true },
  lava: { kind: 'quema', r: 22, saltable: true, salto: 8 },
  geiser: { kind: 'ciclo', r: 20, periodo: 150, activo: 45, aturde: 0.9, atrapa: true },
  basalto: { kind: 'salto', r: 14, salto: 8 },
  cactus: { kind: 'solido', r: 12 },
  arena: { kind: 'lento', r: 28, freno: 0.65, saltable: true },
  remolino: { kind: 'desvio', r: 24, giro: 0.14, freno: 0.85, atrapa: true },
  tronco: { kind: 'salto', r: 16, salto: 7 },
  cienaga: { kind: 'lento', r: 26, freno: 0.45, saltable: true },
  caiman: { kind: 'ciclo', r: 18, periodo: 120, activo: 30, aturde: 1.1, atrapa: true },
};

// Qué tan grave es pisarlo, como lo percibe la red
const PELIGRO = { lento: 0.3, resbalon: 0.5, desvio: 0.5, hoyo: 0.8, quema: 1, ciclo: 1 };
const PELIGRO_CICLO_APAGADO = 0.2;
const CICLO_AVISO = 30; // ticks antes de activarse en los que el sensor ya avisa

module.exports = { MUNDOS, OBSTACULOS, PELIGRO, PELIGRO_CICLO_APAGADO, CICLO_AVISO };
