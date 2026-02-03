/**
 * Local Entity Reference Phrases Utility
 * 
 * Provides varied phrases for referencing local entities in blog content.
 * This helps avoid repetitive language and makes content feel more natural.
 * All phrases are generic and work for any local business type.
 */

type PhraseContext = 'expertise' | 'service' | 'faq' | 'general';

/**
 * Proximity-based phrases for general entity references
 */
const PROXIMITY_PHRASES = [
  (entity: string) => `near ${entity}`,
  (entity: string) => `in the ${entity} area`,
  (entity: string) => `by ${entity}`,
  (entity: string) => `around ${entity}`,
  (entity: string) => `in the vicinity of ${entity}`,
  (entity: string) => `close to ${entity}`,
  (entity: string) => `in proximity to ${entity}`,
];

/**
 * Resident/Community-based phrases
 */
const COMMUNITY_PHRASES = [
  (entity: string) => `residents living by ${entity}`,
  (entity: string) => `the ${entity} community`,
  (entity: string) => `people in the ${entity} area`,
  (entity: string) => `homes and businesses near ${entity}`,
  (entity: string) => `local residents near ${entity}`,
  (entity: string) => `those in the ${entity} vicinity`,
  (entity: string) => `customers in the ${entity} region`,
  (entity: string) => `residents and businesses in the ${entity} area`,
  (entity: string) => `the local community near ${entity}`,
  (entity: string) => `homeowners and businesses by ${entity}`,
];

/**
 * Service area phrases for describing who is being served
 */
const SERVICE_PHRASES = [
  (entity: string) => `serving the ${entity} area`,
  (entity: string) => `helping residents near ${entity}`,
  (entity: string) => `supporting the ${entity} community`,
  (entity: string) => `working with customers in the ${entity} region`,
  (entity: string) => `serving residents in the ${entity} area`,
  (entity: string) => `helping the ${entity} community`,
  (entity: string) => `supporting customers near ${entity}`,
  (entity: string) => `working with homeowners and businesses in the ${entity} area`,
  (entity: string) => `serving those living near ${entity}`,
  (entity: string) => `helping people in the ${entity} vicinity`,
];

/**
 * Expertise phrases for demonstrating local knowledge
 */
const EXPERTISE_PHRASES = [
  (entity: string) => `After installing hundreds of systems near ${entity}`,
  (entity: string) => `Our experience serving residents in the ${entity} area`,
  (entity: string) => `Having worked with homeowners living by ${entity}`,
  (entity: string) => `In our years of supporting the ${entity} community`,
  (entity: string) => `After working with countless customers near ${entity}`,
  (entity: string) => `Our experience helping residents in the ${entity} area`,
  (entity: string) => `Having served the ${entity} community for years`,
  (entity: string) => `In our time working with people in the ${entity} vicinity`,
  (entity: string) => `After completing hundreds of projects near ${entity}`,
  (entity: string) => `Our years of experience serving the ${entity} area`,
];

/**
 * FAQ-specific phrases for contact/service references
 */
const FAQ_PHRASES = [
  (entity: string) => `serving residents near ${entity}`,
  (entity: string) => `helping the ${entity} community`,
  (entity: string) => `supporting customers in the ${entity} area`,
  (entity: string) => `working with people in the ${entity} vicinity`,
  (entity: string) => `serving the ${entity} area`,
  (entity: string) => `helping homeowners and businesses near ${entity}`,
  (entity: string) => `supporting the local community around ${entity}`,
  (entity: string) => `working with residents in the ${entity} region`,
];

/**
 * Gets a varied phrase for referencing a local entity based on context
 * Uses a simple hash-based selection to ensure consistency within the same entity
 * but variety across different uses
 */
export function getLocalEntityReference(
  entity: string,
  context: PhraseContext = 'general',
  index: number = 0
): string {
  let phrases: Array<(entity: string) => string>;
  
  switch (context) {
    case 'expertise':
      phrases = EXPERTISE_PHRASES;
      break;
    case 'service':
      phrases = SERVICE_PHRASES;
      break;
    case 'faq':
      phrases = FAQ_PHRASES;
      break;
    case 'general':
    default:
      // Mix proximity and community phrases for general context
      phrases = [...PROXIMITY_PHRASES, ...COMMUNITY_PHRASES];
      break;
  }
  
  // Use index to rotate through phrases, ensuring variety
  const selectedIndex = index % phrases.length;
  return phrases[selectedIndex](entity);
}

/**
 * Gets a varied phrase for expertise examples
 */
export function getLocalExpertisePhrase(entity: string, index: number = 0): string {
  return getLocalEntityReference(entity, 'expertise', index);
}

/**
 * Gets a varied phrase for service area references
 */
export function getLocalServicePhrase(entity: string, index: number = 0): string {
  return getLocalEntityReference(entity, 'service', index);
}

/**
 * Gets a varied phrase for FAQ answers
 */
export function getLocalFAQPhrase(entity: string, index: number = 0): string {
  return getLocalEntityReference(entity, 'faq', index);
}

/**
 * Gets a varied general reference phrase
 */
export function getLocalGeneralPhrase(entity: string, index: number = 0): string {
  return getLocalEntityReference(entity, 'general', index);
}

/**
 * Gets multiple varied phrases for use in examples or instructions
 * Returns an array of example phrases to show variety
 */
export function getLocalEntityPhraseExamples(
  entity: string,
  context: PhraseContext = 'general',
  count: number = 5
): string[] {
  const examples: string[] = [];
  for (let i = 0; i < count; i++) {
    examples.push(getLocalEntityReference(entity, context, i));
  }
  return examples;
}
