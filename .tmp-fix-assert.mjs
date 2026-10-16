const fs = require('fs');
const p = 'scripts/linux-binaries-manifest.test.mjs';
let t = fs.readFileSync(p, 'utf8');
const lines = t.split('\n');
lines[497] = lines[497].replace('OpenBitFun', 'OPC-Team');
lines[507] = lines[507].replace('OpenBitFun', 'OPC-Team');
fs.writeFileSync(p, lines.join('\n'));
console.log(JSON.stringify(lines[497]));
console.log(JSON.stringify(lines[507]));
