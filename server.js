'use strict';

const http = require('http');
const { corroborate } = require('./corroborate');

const PORT = process.env.PORT || 8787;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/corroborate') {
    let raw;
    try {
      raw = await readBody(req);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ verdict: 'invalid', confidence: 'low', corroboratingSources: [] }));
      return;
    }

    let parsed;
    try {
      parsed = raw.trim() === '' ? null : JSON.parse(raw);
    } catch {
      // Malformed JSON -> body is not a valid object -> invalid.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ verdict: 'invalid', confidence: 'low', corroboratingSources: [] }));
      return;
    }

    const result = corroborate(parsed);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`corroboration engine listening on :${PORT}`);
});

module.exports = server;
