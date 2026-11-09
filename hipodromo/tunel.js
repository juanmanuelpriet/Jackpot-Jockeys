// tunel.js — Publica el juego en internet con un túnel temporal de Cloudflare (gratis, sin cuenta), para que
// entren celulares con datos móviles o desde otra red. Si no encuentra `cloudflared`, lo descarga una sola vez
// de las versiones oficiales de Cloudflare en GitHub. El túnel solo vive mientras el juego está abierto.

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const RELEASES = 'https://github.com/cloudflare/cloudflared/releases/latest/download/';
let estado = { fase: 'apagado' }, proc = null, port = 3000;
const oyentes = [];
const cambia = e => { estado = e; for (const f of oyentes) f(estado); };

// Dónde se guarda el cloudflared descargado: junto a los datos del juego
const carpeta = () => path.join(process.env.JJ_DATA_DIR || __dirname, 'bin');
const exe = () => path.join(carpeta(), process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');

function asset() {
  const arch = os.arch() === 'arm64' ? 'arm64' : 'amd64';
  if (process.platform === 'darwin') return `cloudflared-darwin-${arch}.tgz`;
  if (process.platform === 'win32') return 'cloudflared-windows-amd64.exe';
  return `cloudflared-linux-${arch}`;
}

function buscar() {
  const local = process.env.LOCALAPPDATA || '';
  const lista = [exe(), '/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared', '/usr/bin/cloudflared',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe',
    path.join(local, 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe')];
  return lista.find(p => fs.existsSync(p)) || null;
}

// Descarga siguiendo las redirecciones de GitHub, con el avance en %
function bajar(url, destino, avance, saltos = 0) {
  return new Promise((ok, mal) => {
    https.get(url, { headers: { 'User-Agent': 'jackpot-jockeys' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && saltos < 6) {
        res.resume(); return bajar(new URL(res.headers.location, url).href, destino, avance, saltos + 1).then(ok, mal);
      }
      if (res.statusCode !== 200) { res.resume(); return mal(new Error(`HTTP ${res.statusCode}`)); }
      const total = +res.headers['content-length'] || 0; let hecho = 0;
      const f = fs.createWriteStream(destino);
      res.on('data', c => { hecho += c.length; if (total) avance(Math.round(hecho / total * 100)); });
      res.pipe(f);
      f.on('finish', () => f.close(ok));
      f.on('error', mal); res.on('error', mal);
    }).on('error', mal);
  });
}

async function instalar() {
  fs.mkdirSync(carpeta(), { recursive: true });
  const a = asset(), tmp = path.join(carpeta(), a + '.parte');
  cambia({ fase: 'descargando', progreso: 0 });
  await bajar(RELEASES + a, tmp, p => { if (p !== estado.progreso) cambia({ fase: 'descargando', progreso: p }); });
  if (a.endsWith('.tgz')) {
    await new Promise((ok, mal) => execFile('tar', ['-xzf', tmp, '-C', carpeta()], e => e ? mal(e) : ok()));
    fs.unlinkSync(tmp);
  } else fs.renameSync(tmp, exe());
  if (process.platform !== 'win32') fs.chmodSync(exe(), 0o755);
  return exe();
}

// Abre el túnel hacia el puerto del juego. Devuelve enseguida; el estado avisa cuando el enlace está listo.
async function abrir() {
  if (proc || ['descargando', 'abriendo', 'listo'].includes(estado.fase)) return estado;
  try {
    const bin = buscar() || await instalar();
    cambia({ fase: 'abriendo' });
    const p = proc = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const lento = setTimeout(() => { if (estado.fase === 'abriendo') cambia({ fase: 'error', error: 'El túnel está tardando. Revisa la conexión a internet e inténtalo de nuevo.' }); cerrar(true); }, 40000);
    const mira = d => {
      const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (!m || proc !== p || estado.fase === 'listo') return;  // nada de avisos de un túnel ya cerrado
      clearTimeout(lento);
      process.env.PUBLIC_URL = m[0];
      cambia({ fase: 'listo', url: m[0] });
    };
    p.stdout.on('data', mira); p.stderr.on('data', mira);
    p.on('error', e => { clearTimeout(lento); if (proc !== p) return; proc = null; cambia({ fase: 'error', error: `No pude abrir cloudflared: ${e.message}` }); });
    p.on('exit', () => {
      clearTimeout(lento); if (proc !== p) return; proc = null; delete process.env.PUBLIC_URL;
      if (estado.fase !== 'error') cambia({ fase: 'apagado' });
    });
  } catch (e) {
    cambia({ fase: 'error', error: `No pude descargar cloudflared (${e.message}). Revisa la conexión a internet.` });
  }
  return estado;
}

function cerrar(conError = false) {
  if (proc) proc.kill();
  proc = null; delete process.env.PUBLIC_URL;
  if (!conError) cambia({ fase: 'apagado' });
  return estado;
}

// Al cerrar el juego se cierra el túnel
for (const s of ['exit', 'SIGINT', 'SIGTERM']) process.on(s, () => { if (proc) proc.kill(); if (s !== 'exit') process.exit(0); });

module.exports = { abrir, cerrar, estado: () => estado, puerto: p => { port = p; }, escuchar: f => oyentes.push(f) };
