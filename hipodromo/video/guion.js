// guion.js — Lo que dice y muestra el video tutorial. `voz` se escribe como suena para que la voz lo pronuncie bien;
// `texto` es el subtítulo. Si no hay `texto`, el subtítulo es igual a `voz`.

module.exports = [
  { id: 'hola', voz: 'Bienvenidos a Yákpot Yókis. Aquí nadie maneja los caballos: cada uno es una red neuronal que aprendió a correr sola. Tú apuestas fichas de mentira, ayudas a tu favorito y saboteas a los demás.',
    texto: 'Bienvenidos a Jackpot Jockeys. Aquí nadie maneja los caballos: cada uno es una red neuronal que aprendió a correr sola. Tú apuestas fichas de mentira, ayudas a tu favorito y saboteas a los demás.' },
  { id: 'entrar', voz: 'Escanea el código de la pantalla con tu celular y escribe tu nombre. Empiezas con mil fichas, y gana quien termine con más.' },
  { id: 'apostar', voz: 'Toca un caballo y escribe cuánto apuestas. El número dorado es lo que recibes si aciertas. ¿Te equivocaste? Puedes quitar cualquier apuesta antes de la carrera.' },
  { id: 'tipos', voz: 'También puedes apostar a que quede entre los dos primeros, o en el podio: pagan menos, pero es más fácil acertar. Cuando termines, toca Listo.' },
  { id: 'personalidades', voz: 'Hay cuatro personalidades. El corredor va limpio y constante. El pícaro empuja a veces. El bravo busca pelea. Y el muy bravo es todo o nada.' },
  { id: 'mundos', voz: 'Y cada carrera se corre en un mundo distinto, con su propia física y sus propios obstáculos.' },
  { id: 'nieve', mundo: 'nieve', titulo: '❄️ Nieve', voz: 'En la nieve, los caballos derrapan en las curvas.' },
  { id: 'luna', mundo: 'luna', titulo: '🌙 Luna', voz: 'En la luna hay poca gravedad, y los cráteres los atrapan.' },
  { id: 'volcan', mundo: 'volcan', titulo: '🌋 Volcán', voz: 'En el volcán, la ceniza no deja ver, y la lava quema.' },
  { id: 'desierto', mundo: 'desierto', titulo: '🏜️ Desierto', voz: 'En el desierto, el viento los empuja de lado.' },
  { id: 'pantano', mundo: 'pantano', titulo: '🐊 Pantano', voz: 'Y en el pantano, los caimanes muerden.' },
  { id: 'carrera', voz: 'En la carrera, mira la pantalla grande y usa poderes desde el celular con un toque. La zanahoria acelera a tu caballo, el escudo lo protege, y el lazo frena al que va adelante.' },
  { id: 'potro', voz: 'En Mi caballo puedes comprar tu propio potro y entrenarlo de verdad. Si tu caballo gana, cobras premio y una comisión de la casa. Eso sí: cada entrenamiento le cuesta una carrera.' },
  { id: 'mafia', voz: 'Si te quedas sin fichas, la mafia te presta. Pero la deuda sube doce por ciento cada carrera, y se lleva la mitad de tus premios hasta cobrarse.' },
  { id: 'pena', voz: 'En una peña, hasta tres amigos se regalan fichas y comparten premios. Y sí: también se pueden traicionar.' },
  { id: 'final', voz: 'Cada ocho carreras hay un Gran Premio que paga más. Se juega hasta que se aburran, y las fichas no son dinero real. ¡A jugar!',
    texto: 'Cada 8 carreras hay un Gran Premio que paga más. Se juega hasta que se aburran, y las fichas no son dinero real. ¡A jugar!' },
];
