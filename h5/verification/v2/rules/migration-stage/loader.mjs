import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, ctx, next) { try { return next(specifier,ctx); } catch(e) { if(specifier.startsWith('.')) return next(specifier+'.ts',ctx); throw e; } } });
