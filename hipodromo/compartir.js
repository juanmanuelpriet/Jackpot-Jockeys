// compartir.js — Arranca el servidor y lo publica en internet con un túnel temporal de
// Cloudflare (gratis, sin cuenta), para jugar con amigos que no están en tu WiFi.
// Requiere `cloudflared`: brew install cloudflared
// Uso: npm run compartir   (busca solo un puerto libre desde 3000, o desde PORT si lo das)

const { spawn } = require('child_process');
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
  const port = await freePort(parseInt(process.env.PORT || '3000', 10));
  let tunnel = null;
  const server = spawn(process.execPath, [require.resolve('./server.js')], {
    stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, PORT: String(port) },
  });
  const stop = code => { if (tunnel) tunnel.kill(); server.kill(); process.exit(code); };
  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
  server.on('exit', code => { console.error(`\nEl servidor se detuvo (código ${code}). Cierro el túnel.`); stop(code || 1); });

  // El túnel se abre solo cuando el servidor ya está escuchando
  server.stdout.on('data', data => {
    process.stdout.write(data);
    if (tunnel || !String(data).includes('listo')) return;
    tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    tunnel.on('error', () => {
      console.error('\n⚠️  No encontré `cloudflared`. Instálalo con: brew install cloudflared');
      console.error('   Mientras tanto el juego sigue funcionando en tu red local.\n');
    });
    let shown = false;
    const watch = chunk => {
      const m = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !shown) {
        shown = true;
        console.log(`\n🌎 Jackpot Jockeys en internet: ${m[0]}`);
        console.log('   Abre ese enlace en la pantalla grande; el QR que aparezca ya sirve para cualquier celular.');
        console.log('   Para cerrar el juego y el enlace: Ctrl+C\n');
      }
    };
    tunnel.stdout.on('data', watch);
    tunnel.stderr.on('data', watch);
  });
})();
