// Auxiliary checks only. This does not replace tsc, Vite, or Vitest.
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, extname } from 'node:path';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
      const candidate = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
      if (!extname(candidate)) {
        for (const suffix of ['.ts', '.mts', '/index.ts', '.js', '.mjs']) {
          if (existsSync(candidate + suffix)) return nextResolve(pathToFileURL(candidate + suffix).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && /\.(?:ts|mts)$/.test(url)) {
      const source = stripTypeScriptTypes(readFileSync(fileURLToPath(url), 'utf8'), { mode: 'transform', sourceUrl: url });
      return { format: 'module', source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
