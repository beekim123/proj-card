import type { ArtDefinition } from './types';

export function matchesAssetFilter(definition: Pick<ArtDefinition, 'status' | 'v2' | 'batch'>, changedOnly: boolean, batch: string): boolean {
  return (!changedOnly || (definition.status ?? '已有') !== '已有') && (batch === 'all' || definition.v2 === batch || definition.batch === batch);
}

