// grabar.js — Graba el video tutorial con el juego real: abre una pantalla y un celular en una ventana oculta, los
// maneja según el guion y graba imagen y voz en public/tutorial.webm.
// Uso (solo Mac, por la voz de `say`): npx electron video/grabar.js
// Hay que volver a grabarlo si cambia lo que se ve o lo que dice el guion.

const { app, BrowserWindow, session } = require('electron');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const GUION = require('./guion');

const ROOT = path.join(__dirname, '..');
const SALIDA = process.env.JJ_VIDEO || path.join(ROOT, 'public', 'tutorial.webm');
const VOZ = 'Paulina', RITMO = '178';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jj-video-'));
const MUNDOS_FOOTAGE = ['nieve', 'luna', 'volcan', 'desierto', 'pantano'];
const BASE_PORT = 3180;
const servers = [];

const wait = ms => new Promise(r => setTimeout(r, ms));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();

function startServer(port, mundo) {
  const data = path.join(TMP, 'datos' + port);
  fs.mkdirSync(data);
  servers.push(spawn('node', ['server.js'], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, PORT: String(port), JJ_DATA_DIR: data, JJ_MUNDO: mundo } }));
}
async function ready(port) {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://localhost:${port}/cel`)).ok) return; } catch { /* aún no */ }
    await wait(250);
  }
  throw new Error('El servidor no arrancó en ' + port);
}

let win;
const dir = (code) => win.webContents.executeJavaScript(code, true);
const frameOf = port => win.webContents.mainFrame.framesInSubtree.find(f => f.url.includes(`:${port}/`) && !f.url.includes('/cel'));
const phoneFrame = () => win.webContents.mainFrame.framesInSubtree.find(f => f.url.includes('/cel'));

// Marca con un círculo dónde se toca el celular y luego toca de verdad
const TAP = `(el) => new Promise(done => {
  const r = el.getBoundingClientRect(), d = document.createElement('div');
  d.style.cssText = 'position:fixed;z-index:9999;width:54px;height:54px;border-radius:50%;background:rgba(231,200,115,.55);border:3px solid #e7c873;pointer-events:none;transition:transform .35s;left:' + (r.left + r.width / 2 - 27) + 'px;top:' + (r.top + r.height / 2 - 27) + 'px';
  document.body.append(d);
  setTimeout(() => { d.style.transform = 'scale(.7)'; el.click(); setTimeout(() => { d.remove(); done(true); }, 350); }, 450);
})`;
const tapText = text => phoneFrame().executeJavaScript(`(() => {
  const el = [...document.querySelectorAll('button, .pw, .item')].filter(b => b.offsetParent).find(b => b.textContent.includes(${JSON.stringify(text)}));
  return el ? (${TAP})(el) : false;
})()`, true);
const tapSel = sel => phoneFrame().executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? (${TAP})(el) : false; })()`, true);
const skipGuide = () => phoneFrame().executeJavaScript(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.offsetParent && x.textContent.trim() === 'Saltar'); if (b) b.click(); return !!b; })()`, true);
const setField = (sel, value) => phoneFrame().executeJavaScript(`(() => { const a = document.querySelector(${JSON.stringify(sel)}); if (!a) return false; a.value = ${JSON.stringify(value)}; a.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`, true);
const startRace = async port => frameOf(port).executeJavaScript(`(() => { try { skipSplash(); } catch {} const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('INICIAR') || x.textContent.includes('Iniciar')); if (b) b.click(); return !!b; })()`, true);

const scene = id => GUION.find(s => s.id === id);
const say = s => dir(`say(${JSON.stringify(s.id)}, ${JSON.stringify(s.texto || s.voz)})`);

async function main() {
  await app.whenReady();
  for (const s of GUION) {
    const f = path.join(TMP, s.id + '.wav');
    execFileSync('say', ['-v', VOZ, '-r', RITMO, '-o', f, '--data-format=LEI16@44100', s.voz]);
    s.file = f;
  }
  startServer(BASE_PORT, 'hipodromo');
  MUNDOS_FOOTAGE.forEach((m, i) => startServer(BASE_PORT + 1 + i, m));
  await Promise.all(MUNDOS_FOOTAGE.map((_, i) => ready(BASE_PORT + 1 + i)).concat(ready(BASE_PORT)));

  win = new BrowserWindow({ width: 1280, height: 720, useContentSize: true, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false, offscreen: false } });
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => cb({ video: req.frame }));
  await win.loadFile(path.join(__dirname, 'director.html'));
  for (const s of GUION) await dir(`loadVoice(${JSON.stringify(s.id)}, ${JSON.stringify(s.file)})`);

  // Pantalla real, con la intro de caballos quieta mientras se presenta
  await dir(`loadBig('http://localhost:${BASE_PORT}/?sinvideo=1')`);
  await wait(3500);
  await frameOf(BASE_PORT).executeJavaScript(`clearTimeout(introTimer); 1`, true);
  const sala = await frameOf(BASE_PORT).executeJavaScript(`SALA`);
  await dir(`loadPhone('http://localhost:${BASE_PORT}/cel?sala=${sala}')`);
  await wait(2000);

  console.log('grabando:', await dir(`startRecording()`));
  await dir(`setFade(0)`);
  await wait(700);
  await say(scene('hola'));

  // Entrar
  await frameOf(BASE_PORT).executeJavaScript(`skipSplash(); 1`, true);
  await wait(700);
  const entrar = say(scene('entrar'));
  await wait(3200); // primero se ve el código, luego entra el celular
  await dir(`showPhone(true)`);
  await wait(800);
  await setField('input[placeholder="Tu nombre"]', 'Ana');
  await wait(800);
  await tapText('Entrar a jugar');
  await wait(800);
  await skipGuide();
  await entrar;

  // Apostar: un boleto que se queda y otro que se quita
  const apostar = say(scene('apostar'));
  await wait(1000);
  await tapSel('#horses .item:nth-child(2)');
  await wait(1600);
  await setField('#betAmt', '100');
  await wait(1500);
  await tapSel('#betOk');
  await wait(2200);
  await tapSel('#horses .item:nth-child(4)');
  await wait(900);
  await setField('#betAmt', '50');
  await wait(700);
  await tapSel('#betOk');
  await wait(1100);
  await tapText('Deshacer');
  await apostar;

  const tipos = say(scene('tipos'));
  await wait(1800);
  await tapText('Top 2');
  await wait(1700);
  await tapText('Podio');
  await wait(2200);
  await tapText('Que gane');
  await tipos;
  await dir(`showPhone(false); showCards(true); lightCard(-1)`);
  await wait(500);
  const personalidades = say(scene('personalidades'));
  for (let i = 0; i < 4; i++) { await wait(i ? 2300 : 2000); await dir(`lightCard(${i})`); }
  await personalidades;
  await dir(`showCards(false)`);

  // Mundos: cada uno en su propio servidor, con la carrera ya andando cuando se muestra
  const mundosIntro = say(scene('mundos'));
  const worldScenes = GUION.filter(s => s.mundo);
  await dir(`addWorld('nieve', 'http://localhost:${BASE_PORT + 1}/?sinvideo=1')`);
  await wait(2200);
  await startRace(BASE_PORT + 1);
  await mundosIntro;
  for (let i = 0; i < worldScenes.length; i++) {
    const s = worldScenes[i], next = worldScenes[i + 1];
    if (i === 2) await tapText('Listo'); // la carrera de verdad arranca mientras se ven los mundos
    await dir(`showWorld(${JSON.stringify(s.mundo)}); setTitle(${JSON.stringify(s.titulo)})`);
    if (next) {
      const port = BASE_PORT + 1 + MUNDOS_FOOTAGE.indexOf(next.mundo);
      await dir(`addWorld(${JSON.stringify(next.mundo)}, 'http://localhost:${port}/?sinvideo=1')`);
      setTimeout(() => startRace(port).catch(() => {}), 1800);
    }
    await say(s);
    await wait(500);
  }
  await dir(`setTitle(''); hideWorlds(); showPhone(true)`);
  await wait(500);

  // Carrera de verdad con poderes
  const carrera = say(scene('carrera'));
  await wait(3500);
  await tapText('🥕');
  await wait(4800);
  await tapText('🛡️');
  await wait(3500);
  await tapText('🪢');
  await carrera;

  const potro = say(scene('potro'));
  await tapText('Mi caballo');
  await potro;

  const mafia = say(scene('mafia'));
  await tapText('Entendido');
  await wait(500);
  await tapText('Mafia');
  await mafia;

  const pena = say(scene('pena'));
  await tapText('Entendido');
  await wait(500);
  await tapText('Peña');
  await pena;

  // Se cierra con el logo y los caballos corriendo
  await dir(`showPhone(false)`);
  await frameOf(BASE_PORT).executeJavaScript(`showSplash(false); clearTimeout(introTimer); 1`, true);
  await say(scene('final'));
  await wait(600);
  await dir(`hideCaption(); setFade(1)`);
  await wait(900);
  const bytes = await dir(`stopRecording(${JSON.stringify(SALIDA)})`);
  console.log('listo', SALIDA, (bytes / 1e6).toFixed(1) + ' MB');
}

function finish(code) {
  for (const s of servers) s.kill();
  fs.rmSync(TMP, { recursive: true, force: true });
  app.exit(code);
}
main().then(() => finish(0), e => { console.error(e); finish(1); });
