// GitHub Pages に近い条件(gzip・/wanko-affiliate-guide/ 配下)で静的配信する
const http=require('http'),fs=require('fs'),path=require('path'),zlib=require('zlib');
const root=process.argv[2],port=+process.argv[3]||8080,base='/wanko-affiliate-guide';
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.xml':'application/xml','.txt':'text/plain','.ico':'image/x-icon','.mp4':'video/mp4'};
http.createServer((req,res)=>{
  let u=decodeURIComponent(req.url.split('?')[0]);
  if(!u.startsWith(base)){res.writeHead(404);return res.end();}
  u=u.slice(base.length)||'/'; if(u.endsWith('/'))u+='index.html';
  const f=path.join(root,u);
  if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('nf');}
  const ext=path.extname(f),t=types[ext]||'application/octet-stream';
  const body=fs.readFileSync(f);
  const gz=/text|javascript|json|svg|xml/.test(t)&&/gzip/.test(req.headers['accept-encoding']||'');
  res.writeHead(200,{'Content-Type':t,'Cache-Control':'max-age=600',...(gz?{'Content-Encoding':'gzip'}:{})});
  res.end(gz?zlib.gzipSync(body):body);
}).listen(port,()=>console.log('up',port));
