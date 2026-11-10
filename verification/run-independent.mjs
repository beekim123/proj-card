import { mkdtemp, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const suite = process.argv[2] ?? 'independent-rules.cjs';
if (!['independent-rules.cjs', 'independent-oracle.cjs'].includes(suite)) throw new Error('Unknown verification suite');
const temporary = await mkdtemp(join(tmpdir(), 'gemcard-independent-'));
try {
  // Compile the production rules again with no DOM or ambient Node types.
  await writeFile(join(temporary, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'CommonJS', moduleResolution: 'Node',
      lib: ['ES2022'], types: [], strict: true, skipLibCheck: true,
      outDir: join(temporary, 'compiled'),
    },
    files: [join(root, 'src/rules/index.ts')],
  }));
  let processResult = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(temporary, 'tsconfig.json')], { stdio: 'inherit' });
  if (processResult.error) throw processResult.error;
  if (processResult.status !== 0) process.exitCode = processResult.status ?? 1;
  else {
    await writeFile(join(temporary, 'package.json'), '{"type":"commonjs"}');
    await copyFile(join(root, 'verification', suite), join(temporary, 'independent-rules.cjs'));
    processResult = spawnSync(process.execPath, [join(temporary, 'independent-rules.cjs')], { stdio: 'inherit' });
    if (processResult.error) throw processResult.error;
    process.exitCode = processResult.status ?? 1;
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
