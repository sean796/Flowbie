/**
 * Entity Generator Module
 * Thin wrapper: delegates to agentic entity flow (@/lib/entity).
 * Count is user input; returns up to count entities; min 1 when possible.
 */

import { toast } from 'sonner';
import { generateEntities as generateEntitiesFromEntityModule } from '@/lib/entity';
import type { EntityWithCriteria, GenerationOptions } from '../types';

/**
 * Main entity generation function (agentic wiki research).
 * Delegates to @/lib/entity; handles sitemap/parse errors with toast.
 */
export async function generateEntities(
  options: GenerationOptions,
  onProgress?: (message: string) => void,
  onCriteriaInfo?: (entity: string, criteriaData: EntityWithCriteria['criteriaData']) => void
): Promise<{
  entities: EntityWithCriteria[];
  suggestedTitleFormat: string;
}> {
  const { site, sitemapUrl, count, promptModifier } = options;
  const entitySitemapUrl = site.entitySitemapUrl || sitemapUrl;

  try {
    return await generateEntitiesFromEntityModule(
      { site, sitemapUrl: entitySitemapUrl, count, promptModifier },
      onProgress,
      onCriteriaInfo
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (
      errorMessage.includes('HTML instead of XML') ||
      errorMessage.includes('Invalid sitemap format') ||
      errorMessage.includes('does not appear to be a valid sitemap')
    ) {
      toast.error(errorMessage, { duration: 10000 });
    }
    if (
      errorMessage.includes('Attribute without value') ||
      errorMessage.includes('XML')
    ) {
      toast.error(errorMessage);
    }
    throw err;
  }
}
