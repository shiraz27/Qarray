#!/usr/bin/env node
// Asserts every key in en/*.json exists in fr/*.json and ar/*.json.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('src/i18n/locales');
const langs = ['en', 'fr', 'ar'];
const ns = fs.readdirSync(path.join(root, 'en')).filter(f => f.endsWith('.json'));

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

let missing = 0;
for (const file of ns) {
  const en = flatten(JSON.parse(fs.readFileSync(path.join(root, 'en', file), 'utf8')));
  for (const lng of ['fr', 'ar']) {
    const data = flatten(JSON.parse(fs.readFileSync(path.join(root, lng, file), 'utf8')));
    const miss = Object.keys(en).filter(k => !(k in data));
    if (miss.length) {
      missing += miss.length;
      console.log(`[${lng}/${file}] missing ${miss.length} keys:`, miss.slice(0, 10).join(', '), miss.length > 10 ? '…' : '');
    }
  }
}
console.log(missing === 0 ? 'OK: all keys present in fr + ar' : `MISSING: ${missing} total`);
process.exit(missing === 0 ? 0 : 1);
