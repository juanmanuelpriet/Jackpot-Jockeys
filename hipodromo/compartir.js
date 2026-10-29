// compartir.js — Arranca el servidor y lo publica en internet con un túnel temporal de
// Cloudflare (gratis, sin cuenta), para jugar con amigos que no están en tu WiFi.
// Requiere `cloudflared`: brew install cloudflared   (o https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
// Uso: npm run compartir

const { spawn } = require('child_process');

const PORT = process.env.PORT || '3000';
const server = spawn(process.execPath, [require.resolve('./server.js')], { stdio: 'inherit', env: { ...process.env, PORT } });

const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
tunnel.on('error', () => {
  console.error('\n⚠️  No encontré `cloudflared`. Instálalo con: brew install cloudflared');
  console.error('   Mientras tanto el juego sigue funcionando en tu red local.\n');
});
let shown = false;
const watch = data => {
  const m = String(data).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !shown) {
    shown = true;
    console.log(`\n🌎 Jackpot Jockeys en internet: ${m[0]}`);
    console.log('   Abre ese enlace en la pantalla grande; el QR que aparezca ya sirve para cualquier celular.\n');
  }
};
tunnel.stdout.on('data', watch);
tunnel.stderr.on('data', watch);

const stop = () => { tunnel.kill(); server.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
