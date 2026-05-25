#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function copyRecursiveSync(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursiveSync(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function safeRmDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {}
}

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, 'dist');
if (!fs.existsSync(distDir)) {
  console.log('Running build because dist/ is missing...');
  execSync('npm run build', { stdio: 'inherit' });
}

const out = path.join(projectRoot, '.vercel', 'output');
safeRmDir(out);

// Use the <name>.func folder convention expected by Vercel Build Output API
const funcDir = path.join(out, 'functions', '_app.func');
const staticDir = path.join(out, 'static');
fs.mkdirSync(funcDir, { recursive: true });
fs.mkdirSync(staticDir, { recursive: true });

// Copy full dist into the function so server entry and its assets resolve
if (fs.existsSync(distDir)) {
  copyRecursiveSync(distDir, path.join(funcDir, 'dist'));
}

// Copy client assets (static) so filesystem handler serves them
const clientSrc = path.join(distDir, 'client');
if (fs.existsSync(clientSrc)) {
  copyRecursiveSync(clientSrc, staticDir);
}

// Edge wrapper that calls the generated server.fetch
// Create a Node.js launcher that dynamically imports the ESM server bundle and
// adapts Node's (req, res) to a Fetch API request/response pair.
const indexJs = "module.exports = async function (req, res) {\n" +
"  try {\n" +
"    const { default: server } = await import('./dist/server/server.js');\n" +
"    const protocol = req.headers['x-forwarded-proto'] || 'https';\n" +
"    const host = req.headers.host || 'localhost';\n" +
"    const url = new URL(req.url, protocol + '://' + host);\n\n" +
"    const headers = new Headers();\n" +
"    for (const [k, v] of Object.entries(req.headers || {})) {\n" +
"      if (v != null) headers.set(k, String(v));\n" +
"    }\n\n" +
"    const body = (req.method === 'GET' || req.method === 'HEAD') ? undefined : req;\n" +
"    const request = new Request(url.toString(), { method: req.method, headers, body });\n\n" +
"    const response = await server.fetch(request);\n\n" +
"    res.statusCode = response.status;\n" +
"    response.headers.forEach((val, key) => res.setHeader(key, val));\n" +
"    const buf = Buffer.from(await response.arrayBuffer());\n" +
"    res.end(buf);\n" +
"  } catch (err) {\n" +
"    console.error('Function error:', err);\n" +
"    res.statusCode = 500;\n" +
"    res.end('Internal Server Error');\n" +
"  }\n" +
"};\n";
fs.writeFileSync(path.join(funcDir, 'index.js'), indexJs, 'utf8');

// .vc-config.json for the function (Node.js runtime). Use a supported Node
// runtime identifier and include a string `handler` required by Vercel.
// Use `nodejs18.x` which is a commonly supported Vercel runtime.
const vcConfig = { runtime: 'nodejs18.x', handler: 'index.js' };
fs.writeFileSync(path.join(funcDir, '.vc-config.json'), JSON.stringify(vcConfig, null, 2), 'utf8');

// Top-level config to prefer filesystem (static) then function
const configJson = {
  version: 3,
  routes: [
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/.vercel/functions/_app.func' }
  ]
};
fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify(configJson, null, 2), 'utf8');

console.log('Wrote .vercel/output with function and static assets.');
console.log('You can run `npm run vercel-build` locally to generate the layout.');
