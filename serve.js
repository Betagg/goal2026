// GOAL 2026 — zero-dependency static server.  Run:  node serve.js
const http = require('http'), fs = require('fs'), p = require('path');
const PORT = process.env.PORT || 5175, HOST = process.env.HOST || '0.0.0.0';
const types = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};
http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]);
  if (f === '/') f = '/index.html';
  const fp = p.join(__dirname, p.normalize(f));
  if (!fp.startsWith(__dirname)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(fp, (e, d) => {
    if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': types[p.extname(fp)] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(PORT, HOST, () => console.log(`GOAL 2026 → http://${HOST}:${PORT}/`));
