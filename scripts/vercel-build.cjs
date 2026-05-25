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
// Create an entrypoint that imports the server bundle. Use an ES module wrapper
// since the server bundle is ESM.
const indexJs = `import server from './dist/server/server.js';

export default async function handler(request) {
  return await server.fetch(request);
}
`;
fs.writeFileSync(path.join(funcDir, 'index.mjs'), indexJs, 'utf8');

// .vc-config.json for the function (edge runtime)
const vcConfig = { runtime: 'edge' };
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
