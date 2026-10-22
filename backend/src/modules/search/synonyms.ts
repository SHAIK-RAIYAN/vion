/**
 * Curated synonym dictionary and token processor for Vion wallpaper discovery.
 * Ensures zero-cost precision discovery for moods, visual styles, environments,
 * colors, and common related search terms.
 */

// Canonical synonym groups: each term in the list relates directly to the core concept
export const SYNONYM_GROUPS: Record<string, string[]> = {
  night: ["night", "nighttime", "after dark", "midnight", "moonlit", "evening"],
  rain: ["rain", "rainy", "rainfall", "drizzle", "storm", "wet"],
  calm: ["calm", "peaceful", "serene", "relaxing", "tranquil", "cozy", "zen"],
  peaceful: ["peaceful", "calm", "serene", "tranquil", "relaxing"],
  anime: ["anime", "animated", "manga", "cel-shaded", "jujutsu", "sukuna", "gojo", "luffy"],
  purple: ["purple", "violet", "magenta", "lavender"],
  blue: ["blue", "cyan", "azure", "navy", "aqua"],
  green: ["green", "emerald", "grass", "nature", "foliage"],
  ocean: ["ocean", "sea", "waves", "water", "marine", "kanagawa", "pond", "fish"],
  city: ["city", "urban", "metropolis", "cyberpunk", "lofi", "street", "skyline"],
  car: ["car", "cars", "vehicle", "drift", "drifting", "automotive", "tunnel"],
  space: ["space", "cosmic", "galaxy", "universe", "stars", "starry", "black hole", "astronomy"],
  nature: ["nature", "landscape", "mountains", "forest", "grass", "trees", "lake", "meadow", "cottage"],
  dark: ["dark", "moody", "gothic", "shadow", "monochrome", "black"],
  dreamy: ["dreamy", "ethereal", "fantasy", "surreal", "aesthetic", "soft"],
  energetic: ["energetic", "action", "dynamic", "speed", "drift", "fast"],
  japan: ["japan", "japanese", "tokyo", "kanagawa", "sakura"],
};

// Common misspellings and abbreviations mapped to canonical search tokens
export const TYPO_MAP: Record<string, string> = {
  japnese: "japanese",
  japaneese: "japanese",
  nigth: "night",
  nihgt: "night",
  walpaper: "wallpaper",
  walpapers: "wallpapers",
  wallpepar: "wallpaper",
  anme: "anime",
  amime: "anime",
  scifi: "sci-fi",
  "lo-fi": "lofi",
  ocen: "ocean",
  oceen: "ocean",
  montain: "mountain",
  montains: "mountains",
  peacefull: "peaceful",
  colud: "cloud",
  coluds: "clouds",
  purpl: "purple",
  purpel: "purple",
  drifiting: "drifting",
  drif: "drift",
  superheros: "superhero",
  wavy: "wavy",
  cozy: "cozy",
  cozzy: "cozy",
  asthetic: "aesthetic",
  aesthetics: "aesthetic",
};

/**
 * Normalizes query string: strips accents, lowercases, removes destructive punctuation
 */
export function normalizeQuery(query: string): string {
  return (query || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Corrects common known misspellings in tokens
 */
export function correctKnownTypos(tokens: string[]): { correctedTokens: string[]; correctionsMade: Record<string, string> } {
  const correctionsMade: Record<string, string> = {};
  const correctedTokens = tokens.map((token) => {
    const lower = token.toLowerCase();
    if (TYPO_MAP[lower]) {
      correctionsMade[lower] = TYPO_MAP[lower];
      return TYPO_MAP[lower];
    }
    return token;
  });
  return { correctedTokens, correctionsMade };
}

/**
 * Generates expanded synonym tokens without diluting query relevance.
 * Limits expansion to top related terms for each matching concept.
 */
export function expandSynonyms(tokens: string[]): string[] {
  const expansions = new Set<string>();

  for (const token of tokens) {
    const lower = token.toLowerCase();
    // Direct match with synonym group key
    if (SYNONYM_GROUPS[lower]) {
      for (const syn of SYNONYM_GROUPS[lower].slice(0, 3)) {
        expansions.add(syn);
      }
    } else {
      // Check if token belongs to any synonym group
      for (const [key, group] of Object.entries(SYNONYM_GROUPS)) {
        if (group.includes(lower)) {
          expansions.add(key);
          for (const syn of group.slice(0, 2)) {
            expansions.add(syn);
          }
          break;
        }
      }
    }
  }

  return Array.from(expansions);
}

/**
 * Formats a clean PostgreSQL tsquery string from token list.
 * Supports prefix matching (`token:*`) and OR matching for synonyms.
 */
export function buildTsQueryString(primaryTokens: string[], synonymTokens: string[] = []): string {
  const cleanTokens = primaryTokens
    .map((t) => t.replace(/[^a-zA-Z0-9_-]/g, ""))
    .filter((t) => t.length > 0);

  if (cleanTokens.length === 0) return "";

  // Primary terms are AND-connected with prefix matching
  const primaryClause = cleanTokens.map((t) => `${t}:*`).join(" & ");

  const cleanSynonyms = synonymTokens
    .map((t) => t.replace(/[^a-zA-Z0-9_-]/g, ""))
    .filter((t) => t.length > 0 && !cleanTokens.includes(t))
    .slice(0, 4);

  if (cleanSynonyms.length > 0) {
    const synClause = cleanSynonyms.map((t) => `${t}:*`).join(" | ");
    return `(${primaryClause}) | (${synClause})`;
  }

  return primaryClause;
}
