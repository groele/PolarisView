import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? collect(target) : target.endsWith('.js') ? [target] : [];
  }));
  return nested.flat();
}

const files = [...await collect('js'), 'background.js'];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${file}\n${result.stderr}`);
}
console.log(`PASS syntax: ${files.length} JavaScript files`);
