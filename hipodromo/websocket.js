// websocket.js — WebSocket mínimo (RFC 6455) sin dependencias, solo para empujar mensajes
// del servidor al navegador. Se usa en lugar de Server-Sent Events porque algunos proxies
// (como los túneles de Cloudflare) retienen los flujos SSE y la carrera llegaría a saltos.

const crypto = require('crypto');
const zlib = require('zlib');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// Compresión permessage-deflate (RFC 7692) sin contexto compartido: cada mensaje se comprime solo.
// El estado del juego es JSON repetitivo y queda 3-4 veces más chico: clave con datos móviles y túneles.
const TAIL = Buffer.from([0x00, 0x00, 0xff, 0xff]);
const deflate = buf => { const d = zlib.deflateRawSync(buf, { finishFlush: zlib.constants.Z_SYNC_FLUSH }); return d.subarray(0, d.length - 4); };
const inflate = buf => zlib.inflateRawSync(Buffer.concat([buf, TAIL]), { finishFlush: zlib.constants.Z_SYNC_FLUSH });

function frame(text, compress) {
  let payload = Buffer.from(text), first = 0x81;
  if (compress && payload.length > 256) { payload = deflate(payload); first = 0xc1; } // RSV1 = comprimido
  const n = payload.length;
  const header = n < 126 ? Buffer.from([first, n])
    : n < 65536 ? Buffer.from([first, 126, n >> 8, n & 255])
    : Buffer.concat([Buffer.from([first, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; })()]);
  return Buffer.concat([header, payload]);
}

// Acepta la conexión y devuelve { send(texto), onMessage(fn), onClose(fn) }. Entiende mensajes
// de texto (las acciones de los celulares), ping (responde pong) y close.
function accept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return null; }
  const acceptKey = crypto.createHash('sha1').update(key + GUID).digest('base64');
  const compress = /permessage-deflate/i.test(req.headers['sec-websocket-extensions'] || '');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
    (compress ? 'Sec-WebSocket-Extensions: permessage-deflate; server_no_context_takeover; client_no_context_takeover\r\n' : '') + '\r\n');
  socket.setNoDelay(true);
  const closers = [], listeners = [];
  let closed = false;
  const close = () => { if (closed) return; closed = true; closers.forEach(f => f()); socket.destroy(); };
  let buf = Buffer.alloc(0);
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const op = buf[0] & 15, masked = buf[1] & 128, rsv1 = buf[0] & 0x40;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const total = off + (masked ? 4 : 0) + len;
      if (buf.length < total) return;
      if (op === 8) return close();
      const mask = masked ? buf.subarray(off, off + 4) : null;
      const data = Buffer.from(buf.subarray(off + (masked ? 4 : 0), total));
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      if (op === 1) {
        let body = data;
        if (rsv1) { try { body = inflate(data); } catch { return close(); } }
        listeners.forEach(fn => fn(body.toString('utf8')));
      }
      if (op === 9) socket.write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); // ping → pong
      buf = buf.subarray(total);
    }
  });
  socket.on('close', close);
  socket.on('error', close);
  return {
    send(text) { if (!closed) socket.write(frame(text, compress)); },
    onClose(fn) { closers.push(fn); },
    onMessage(fn) { listeners.push(fn); },
    close,
  };
}

module.exports = { accept };
