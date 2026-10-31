// app/main.js — Jackpot Jockeys como app de escritorio (Electron).
// Arranca el servidor del juego por dentro, abre la pantalla grande en su propia ventana
// y agrega un menú para nueva partida, pantalla completa y compartir por internet.

const { app, BrowserWindow, Menu, shell, dialog, clipboard } = require('electron');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

app.setName('Jackpot Jockeys');
let win = null, port = 3000, tunnel = null;

// Primer puerto libre desde 3000 (así no choca con otro servidor abierto)
function freePort(start) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(freePort(start + 1)));
    srv.once('listening', () => srv.close(() => resolve(start)));
    srv.listen(start);
  });
}

async function startServer() {
  port = await freePort(3000);
  process.env.PORT = String(port);
  process.env.JJ_DATA_DIR = app.getPath('userData');
  const { server } = require('../server.js');
  if (!server.listening) await new Promise(r => server.once('listening', r));
}

const home = () => `http://localhost:${port}/`;

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 960, minWidth: 900, minHeight: 600,
    backgroundColor: '#0b1f15', title: 'Jackpot Jockeys', show: false, icon: path.join(__dirname, 'icono.png'),
    webPreferences: { contextIsolation: true, autoplayPolicy: 'no-user-gesture-required' }, // el video tutorial arranca con sonido
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL(home());
  // Los enlaces externos se abren en el navegador, no dentro del juego
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('closed', () => { win = null; });
}

// Nueva sala: olvida la llave de la sala actual y vuelve al inicio
async function newRoom() {
  if (!win) return;
  await win.webContents.executeJavaScript("try { sessionStorage.clear() } catch {}");
  win.loadURL(home());
}

function findCloudflared() {
  const local = process.env.LOCALAPPDATA || '';
  const candidates = ['/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe',
    path.join(local, 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe')];
  return candidates.find(p => fs.existsSync(p)) || 'cloudflared';
}

// Publica el juego con un túnel temporal de Cloudflare y recarga para que el QR use el enlace público
function shareOnline() {
  if (tunnel) return showShared(process.env.PUBLIC_URL);
  tunnel = spawn(findCloudflared(), ['tunnel', '--url', home()], { stdio: ['ignore', 'pipe', 'pipe'] });
  let done = false;
  const timer = setTimeout(() => {
    if (!done) dialog.showMessageBox(win, { type: 'warning', message: 'El túnel está tardando', detail: 'Revisa tu conexión a internet e inténtalo de nuevo.' });
  }, 25000);
  const watch = data => {
    const m = String(data).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (!m || done) return;
    done = true; clearTimeout(timer);
    process.env.PUBLIC_URL = m[0];
    win && win.webContents.reload();
    showShared(m[0]);
  };
  tunnel.stdout.on('data', watch);
  tunnel.stderr.on('data', watch);
  tunnel.on('error', () => {
    clearTimeout(timer); tunnel = null;
    dialog.showMessageBox(win, {
      type: 'info', message: 'Para jugar por internet hace falta cloudflared',
      detail: `Instálalo una vez con:\n\n${process.platform === 'win32' ? 'winget install --id Cloudflare.cloudflared' : 'brew install cloudflared'}\n\n` +
        'Después cierra y abre el juego. Mientras tanto se puede jugar con celulares en la misma WiFi.',
    });
  });
  tunnel.on('exit', () => { tunnel = null; delete process.env.PUBLIC_URL; });
}

function showShared(url) {
  if (!url) return;
  clipboard.writeText(url);
  dialog.showMessageBox(win, {
    type: 'info', message: 'Jackpot Jockeys está en internet',
    detail: `${url}\n\nEl enlace quedó copiado. El QR de la pantalla ya sirve para cualquier celular, esté donde esté.\nEl enlace deja de funcionar al cerrar el juego.`,
  });
}

function stopSharing() {
  if (!tunnel) return;
  tunnel.kill();
  tunnel = null;
  delete process.env.PUBLIC_URL;
  win && win.webContents.reload();
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu', label: 'Jackpot Jockeys' }] : []),
    {
      label: 'Juego',
      submenu: [
        { label: 'Nueva sala', accelerator: 'CmdOrCtrl+N', click: newRoom },
        { label: 'Pantalla completa', accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11', click: () => win && win.setFullScreen(!win.isFullScreen()) },
        { type: 'separator' },
        { label: 'Compartir por internet…', accelerator: 'CmdOrCtrl+I', click: shareOnline },
        { label: 'Dejar de compartir', click: stopSharing },
        { label: 'Abrir en el navegador', click: () => win && shell.openExternal(win.webContents.getURL()) },
        { type: 'separator' },
        { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => win && win.webContents.reload() },
        ...(isMac ? [] : [{ role: 'quit', label: 'Salir' }]),
      ],
    },
    { role: 'editMenu', label: 'Edición' },
    { role: 'windowMenu', label: 'Ventana' },
  ]));
}

// Una sola instancia del juego
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(async () => {
  await startServer();
  buildMenu();
  createWindow();
  app.on('activate', () => { if (!win) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (tunnel) tunnel.kill(); });
