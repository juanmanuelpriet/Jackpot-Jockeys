// Comprueba que sim.js calcula lo mismo que PyTorch. node control.js <carpeta con red.json y control.json>
const H = require('path').join(__dirname, '../../') + '/', fs = require('fs'), { einsteinStep } = require(H + 'sim');
const d = process.argv[2], net = JSON.parse(fs.readFileSync(d + '/red.json')), c = JSON.parse(fs.readFileSync(d + '/control.json'));
const mem = []; let err = 0;
c.g.forEach((g, t) => { const y = einsteinStep(net, Float32Array.from(g, v => v / 250), c.s[t], mem); err = Math.max(err, Math.abs(y[0] - c.y[t][0]), Math.abs(y[1] - c.y[t][1])); });
console.log('diferencia máxima con PyTorch', err.toExponential(2));
