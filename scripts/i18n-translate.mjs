#!/usr/bin/env node
// Translates src/i18n/locales/en/*.json to fr + ar via Lovable AI Gateway.
// Default: fills only missing keys per file. Pass --force to overwrite.
import fs from 'node:fs';
import path from 'node:path';

const FORCE = process.argv.includes('--force');
const ONLY = process.argv.find(a => a.startsWith('--only='))?.split('=')[1];

const apiKey = process.env.LOVABLE_API_KEY;
if (!apiKey) { console.error('LOVABLE_API_KEY env var required'); process.exit(1); }

const root = path.resolve('src/i18n/locales');
const targets = { fr: 'French', ar: 'Tunisian Arabic (Modern Standard Arabic acceptable; use natural, concise wording suitable for a high-school study app for Tunisian students)' };
const files = fs.readdirSync(path.join(root, 'en')).filter(f => f.endsWith('.json') && (!ONLY || f === ONLY));

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

async function translate(payload, targetName) {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: `You translate JSON values into ${targetName}. CRITICAL RULES: 1) Return ONLY a JSON object with the same keys. 2) Preserve interpolation placeholders like {{name}}, {0}, %s exactly. 3) Preserve HTML tags. 4) Keep brand names like "Qarray", "Lovable AI" untranslated. 5) Keep emojis. 6) Do not add extra keys.` },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content;
  return JSON.parse(text);
}

for (const file of files) {
  const enPath = path.join(root, 'en', file);
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const enFlat = flatten(en);

  for (const [lng, name] of Object.entries(targets)) {
    const outPath = path.join(root, lng, file);
    const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};
    const existingFlat = flatten(existing);
    const toTranslate = {};
    for (const k of Object.keys(enFlat)) {
      if (FORCE || !(k in existingFlat) || existingFlat[k] === '') toTranslate[k] = enFlat[k];
    }
    if (Object.keys(toTranslate).length === 0) {
      console.log(`[${lng}/${file}] up-to-date`);
      continue;
    }
    console.log(`[${lng}/${file}] translating ${Object.keys(toTranslate).length} keys…`);
    try {
      const translated = await translate(toTranslate, name);
      const merged = { ...existingFlat, ...translated };
      // Preserve original key order from en
      const ordered = {};
      for (const k of Object.keys(enFlat)) ordered[k] = merged[k] ?? enFlat[k];
      fs.writeFileSync(outPath, JSON.stringify(ordered, null, 2) + '\n');
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
    }
  }
}
console.log('Done');
