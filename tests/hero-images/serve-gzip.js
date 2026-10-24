// 計測用の静的サーバー(gzip あり、.html のリダイレクトなし)。
// 使い方: node tests/hero-images/serve-gzip.js [ルート] [ポート]
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const root = path.resolve(process.argv[2] || '.'), port = +(process.argv[3] || 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.woff2': 'font/woff2' };
const COMPRESS = /^(text\/|application\/(javascript|json|xml)|image\/svg)/;
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache' };
    if (COMPRESS.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) { buf = zlib.gzipSync(buf); headers['Content-Encoding'] = 'gzip'; }
    headers['Content-Length'] = buf.length;
    res.writeHead(200, headers).end(buf);
  });
}).listen(port, '127.0.0.1');
