import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const html = await readFile('index.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
assert.deepEqual(duplicateIds, [], `Duplicate element IDs: ${duplicateIds.join(', ')}`);

const localReferences = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)]
  .map(match => match[1].split('#')[0].split('?')[0])
  .filter(reference => reference && !/^(?:https?:|data:|#)/.test(reference));
for (const reference of localReferences) {
  await access(reference);
}

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
for (const script of manifest.content_scripts?.flatMap(entry => entry.js || []) || []) await access(script);
for (const file of Object.values(manifest.icons || {})) await access(file);

console.log(`PASS HTML/manifest: ${ids.length} unique IDs and ${localReferences.length} local assets resolved`);
