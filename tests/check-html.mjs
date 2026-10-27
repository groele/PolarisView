import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const html = await readFile('index.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
assert.deepEqual(duplicateIds, [], `Duplicate element IDs: ${duplicateIds.join(', ')}`);

const idSet = new Set(ids);
const internalHrefIds = [...html.matchAll(/\bhref="#([^"]+)"/g)].map(match => match[1]);
for (const refId of internalHrefIds) {
  assert.ok(idSet.has(refId), `Missing internal href target ID: #${refId}`);
}

const idRefAttrs = [...html.matchAll(/\b(?:for|aria-controls|aria-labelledby)="([^"]+)"/g)]
  .flatMap(match => match[1].trim().split(/\s+/))
  .filter(Boolean);
for (const refId of idRefAttrs) {
  assert.ok(idSet.has(refId), `Missing referenced element ID: ${refId}`);
}

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
