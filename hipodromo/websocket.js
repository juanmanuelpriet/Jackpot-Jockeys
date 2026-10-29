// websocket.js — WebSocket mínimo (RFC 6455) sin dependencias, solo para empujar mensajes
// del servidor al navegador. Se usa en lugar de Server-Sent Events porque algunos proxies
// (como los túneles de Cloudflare) retienen los flujos SSE y la carrera llegaría a saltos.

const crypto = require('crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(text) {
  const payload = Buffer.from(text);
  const n = payload.length;
  const header = n < 126 ? Buffer.from([0x81, n])
    : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255])
    : Buffer.concat([Buffer.from([0x81, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; })()]);
  return Buffer.concat([header, payload]);
}

// Acepta la conexión y devuelve { send(texto), onClose(fn) }. Los mensajes del navegador
// se ignoran salvo ping (responde pong) y close.
function accept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return null; }
  const acceptKey = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`);
  socket.setNoDelay(true);
  const closers = [];
  let closed = false;
  const close = () => { if (closed) return; closed = true; closers.forEach(f => f()); socket.destroy(); };
  let buf = Buffer.alloc(0);
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const op = buf[0] & 15, masked = buf[1] & 128;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const total = off + (masked ? 4 : 0) + len;
      if (buf.length < total) return;
      if (op === 8) return close();
      if (op === 9) { // ping → pong con el mismo contenido
        const mask = buf.subarray(off, off + 4), data = Buffer.from(buf.subarray(off + 4, total));
        if (masked) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
        socket.write(Buffer.concat([Buffer.from([0x8a, data.length]), data]));
      }
      buf = buf.subarray(total);
    }
  });
  socket.on('close', close);
  socket.on('error', close);
  return {
    send(text) { if (!closed) socket.write(frame(text)); },
    onClose(fn) { closers.push(fn); },
    close,
  };
}

module.exports = { accept };
