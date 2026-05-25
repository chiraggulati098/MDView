const path = require('path');

module.exports = async function (req, res) {
  try {
    const serverPath = path.join(process.cwd(), 'dist', 'server', 'server.js');
    const { default: server } = await import('file://' + serverPath);

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url, protocol + '://' + host);

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers || {})) {
      if (v != null) headers.set(k, String(v));
    }

    const body = (req.method === 'GET' || req.method === 'HEAD') ? undefined : req;
    const request = new Request(url.toString(), { method: req.method, headers, body });

    const response = await server.fetch(request);

    res.statusCode = response.status;
    response.headers.forEach((val, key) => res.setHeader(key, val));
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } catch (err) {
    console.error('API function error:', err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
};
