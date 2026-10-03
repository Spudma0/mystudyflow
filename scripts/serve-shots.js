// Receives App Store screenshots rasterised by the running app and writes them
// to assets/appstore/<device>/.
//
// The page draws itself to a canvas at the exact pixel size Apple asks for and
// posts that here, rather than the window being screenshotted: a screenshot is
// captured at the pane's own device pixel ratio and re-encoded, which is both
// the wrong size and softer than the real thing. This keeps the exact pixels.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'assets', 'appstore');
const PORT = 5056;
/** Only the two slots being produced, so a typo can't scatter files around. */
const DIRS = new Set(['iphone-6.5', 'ipad-13', 'iphone-6.5-marketing']);

function save(req, res) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    // A 13" shot is a few megabytes; far past that is not one.
    if (body.length > 60e6) req.destroy();
  });
  req.on('end', () => {
    try {
      const { dir, name, dataUrl } = JSON.parse(body);
      if (!DIRS.has(dir)) throw new Error(`unknown device folder: ${dir}`);
      if (!/^[\w.-]+\.png$/.test(name)) throw new Error('bad name');

      const folder = path.join(ROOT, dir);
      fs.mkdirSync(folder, { recursive: true });
      const file = path.join(folder, name);
      fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));

      const kb = (fs.statSync(file).size / 1024).toFixed(0);
      console.log(`wrote ${dir}/${name} ${kb}KB`);
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }).end('ok');
    } catch (err) {
      console.error('save failed:', String(err));
      res.writeHead(400, { 'Access-Control-Allow-Origin': '*' }).end(String(err));
    }
  });
}

http
  .createServer((req, res) => {
    // The app is served from another port, so the browser preflights the post.
    if (req.method === 'OPTIONS') {
      res
        .writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        })
        .end();
      return;
    }
    if (req.method === 'POST' && req.url === '/save') return save(req, res);
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }).end('not found');
  })
  .listen(PORT, () => console.log(`screenshot sink on http://localhost:${PORT}`));
