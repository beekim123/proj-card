import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export function install({ recorder = false } = {}) {
  registerHooks({
    resolve(specifier, context, next) {
      if (recorder && specifier === 'vitest') return { url: new URL('./test-api.mjs', import.meta.url).href, shortCircuit: true };
      let resolved;
      try { resolved = next(specifier, context); } catch (error) {
        if (!specifier.startsWith('.')) throw error;
        const base = fileURLToPath(new URL(specifier, context.parentURL));
        const target = [base + '.ts', path.join(base, 'index.ts'), base.replace(/\.js$/, '.ts')].find(existsSync);
        if (!target) throw error;
        resolved = { url: pathToFileURL(target).href, shortCircuit: true };
      }
      if (recorder && /(?:\.test|batch-one-fixtures)\.ts$/.test(context.parentURL ?? '') && /\/h5\/src\/rules\/(?:index|run|save-state|effects)\.ts$/.test(resolved.url)) {
        return { url: 'portwrap:' + encodeURIComponent(resolved.url), shortCircuit: true };
      }
      return resolved;
    },
    load(url, context, next) {
      if (!url.startsWith('portwrap:')) return next(url, context);
      const real = decodeURIComponent(url.slice(9));
      const modules = ['index', 'run', 'save-state', 'effects'];
      const directory = path.dirname(fileURLToPath(real));
      const names = new Set();
      for (const mod of modules) {
        const source = readFileSync(path.join(directory, mod + '.ts'), 'utf8');
        for (const match of source.matchAll(/export (?:async )?function\s+(\w+)/g)) names.add(match[1]);
      }
      const own = path.basename(fileURLToPath(real), '.ts');
      if (own !== 'index') {
        names.clear();
        for (const m of readFileSync(fileURLToPath(real), 'utf8').matchAll(/export (?:async )?function\s+(\w+)/g)) names.add(m[1]);
      }
      const api = new URL('./test-api.mjs', import.meta.url).href;
      const source = `import * as original from ${JSON.stringify(real)};import {capture} from ${JSON.stringify(api)};export * from ${JSON.stringify(real)};\n` + [...names].map(name => `export const ${name}=(...args)=>capture(${JSON.stringify(own)},${JSON.stringify(name)},original[${JSON.stringify(name)}],args);`).join('\n');
      return { format: 'module', source, shortCircuit: true };
    },
  });
}
