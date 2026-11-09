// compartir.js — Arranca el servidor y lo publica en internet con un túnel temporal de Cloudflare (gratis, sin cuenta),
// para jugar con amigos que no están en tu WiFi. Si falta `cloudflared`, el juego lo descarga solo la primera vez.
// Uso: npm run compartir   (busca solo un puerto libre desde 3000, o desde PORT si lo das)
// También se puede abrir desde la pantalla del juego con el botón «Abrir a internet».

const net = require('net');

// Primer puerto libre: así nunca se abre un túnel hacia otro servidor viejo
function freePort(start) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(freePort(start + 1)));
    srv.once('listening', () => srv.close(() => resolve(start)));
    srv.listen(start);
  });
}

(async () => {
  process.env.PORT = String(await freePort(parseInt(process.env.PORT || '3000', 10)));
  const { server } = require('./server.js');
  if (!server.listening) await new Promise(r => server.once('listening', r));
  const tunel = require('./tunel');
  tunel.escuchar(st => {
    if (st.fase === 'descargando' && st.progreso % 25 === 0) console.log(`   Descargando cloudflared… ${st.progreso} %`);
    if (st.fase === 'listo') {
      console.log(`\n🌎 Jackpot Jockeys en internet: ${st.url}`);
      console.log('   Abre ese enlace en la pantalla grande; el QR que aparezca ya sirve para cualquier celular.');
      console.log('   Para cerrar el juego y el enlace: Ctrl+C\n');
    }
    if (st.fase === 'error') console.error(`\n⚠️  ${st.error}\n   Mientras tanto el juego sigue funcionando en tu red local.\n`);
  });
  tunel.abrir();
})();
