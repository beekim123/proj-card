import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, ctx, next) {
  if (specifier === 'vitest') return { url: new URL('./vitest-native.mjs', import.meta.url).href, shortCircuit: true };
  try { return next(specifier, ctx); } catch (e) {
    if (specifier.startsWith('.')) return next(specifier + '.ts', ctx);
    throw e;
  }
} });
