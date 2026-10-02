// Serves assets/promo over HTTP so the promo cards can be opened and captured
// in a browser. Nothing in the app depends on this — it exists only so the
// marketing images can be re-exported later without hunting for a static
// server.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'assets', 'promo');
const PORT = 5055;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.css': 'text/css',
  '.js': 'text/javascript',
};

/**
 * Writes a rendered card to disk.
 *
 * The page rasterises itself to a PNG and posts it here rather than the image
 * being screenshotted: a screenshot is downscaled to the window and re-encoded
 * as JPEG, which is what made the earlier exports soft. This path keeps the
 * exact pixels the page drew.
 */
function save(req, res) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    // A card is a couple of megabytes; anything far past that is not one.
    if (body.length > 40e6) req.destroy();
  });
  req.on('end', () => {
    try {
      const { name, dataUrl } = JSON.parse(body);
      if (!/^[\w.-]+\.png$/.test(name)) throw new Error('bad name');
      const file = path.join(ROOT, 'cards', name);
      fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
      console.log('wrote', name, (fs.statSync(file).size / 1024).toFixed(0) + 'KB');
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    } catch (err) {
      res.writeHead(400).end(String(err));
    }
  });
}

http
  .createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/save') {
      save(req, res);
      return;
    }

    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'promo.html' : url);

    // Never serve outside the promo folder, whatever the path contains.
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    });
  })
  .listen(PORT, () => console.log(`promo cards on http://localhost:${PORT}`));
