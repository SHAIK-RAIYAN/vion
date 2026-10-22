import { pgPool } from "../../prisma/db";
import { getPaginationMeta, type Pagination } from "../../utils/pagination";
import {
  normalizeQuery,
  correctKnownTypos,
  expandSynonyms,
  buildTsQueryString,
} from "./synonyms";

export interface SearchUploadItem {
  id: string;
  channelId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  hlsManifestUrl: string | null;
  viewCount: number;
  isDeleted: boolean;
  visibility: string;
  processingStatus: string;
  createdAt: string;
  updatedAt: string;
  category: string | null;
  mood: string | null;
  visualStyle: string | null;
  colorTone: string | null;
  environment: string | null;
  tags: string | null;
  searchScore?: number;
  matchReasons?: string[];
  channel: {
    id: string;
    handle: string;
    channelName: string;
    profilePictureUrl: string | null;
  };
  videos: Array<{
    id: string;
    resolution: string;
    url: string;
  }>;
}

/**
 * Computes explainable match badges based on actual matched metadata.
 */
function determineMatchReasons(
  item: any,
  query: string,
  normalizedQuery: string,
  corrections: Record<string, string>,
  allSearchTokens: string[],
): string[] {
  const reasons: string[] = [];
  const titleLower = (item.title || "").toLowerCase();

  // Exact or strong title match
  if (titleLower === normalizedQuery) {
    reasons.push("Exact Title");
  } else if (titleLower.includes(normalizedQuery)) {
    reasons.push("Title Match");
  }

  // Typo corrections
  const correctedKeys = Object.keys(corrections);
  if (correctedKeys.length > 0) {
    for (const wrong of correctedKeys) {
      if (
        titleLower.includes(corrections[wrong]) ||
        (item.tags && item.tags.toLowerCase().includes(corrections[wrong])) ||
        (item.category && item.category.toLowerCase().includes(corrections[wrong]))
      ) {
        reasons.push(`Spelling: '${wrong}' -> '${corrections[wrong]}'`);
        break;
      }
    }
  }

  // Category match
  if (
    item.category &&
    allSearchTokens.some((t) => item.category.toLowerCase().includes(t))
  ) {
    reasons.push(`Category: ${item.category}`);
  }

  // Visual style match
  if (
    item.visualStyle &&
    allSearchTokens.some((t) => item.visualStyle.toLowerCase().includes(t))
  ) {
    reasons.push(`Style: ${item.visualStyle}`);
  }

  // Mood match
  if (
    item.mood &&
    allSearchTokens.some((t) => item.mood.toLowerCase().includes(t))
  ) {
    reasons.push(`Mood: ${item.mood}`);
  }

  // Color match
  if (
    item.colorTone &&
    allSearchTokens.some((t) => item.colorTone.toLowerCase().includes(t))
  ) {
    reasons.push(`Color: ${item.colorTone}`);
  }

  // Environment match
  if (
    item.environment &&
    allSearchTokens.some((t) => item.environment.toLowerCase().includes(t))
  ) {
    reasons.push(`Environment: ${item.environment}`);
  }

  // If no explicit badge was added but result was scored high, fallback to descriptive match
  if (reasons.length === 0) {
    reasons.push("Descriptive Match");
  }

  // Return max 3 distinct badges to avoid UI clutter
  return Array.from(new Set(reasons)).slice(0, 3);
}

/**
 * Executes zero-cost relevance-ranked hybrid search combining:
 * 1. Exact title matches
 * 2. Prefix & contains title matches
 * 3. PostgreSQL Full-Text Search on weighted tsvectors (title, tags, category, style, mood, env)
 * 4. Synonym expansion
 * 5. pg_trgm fuzzy matching for spelling mistakes
 * 6. Modest popularity & recency secondary boost
 */
export async function searchContent(query: string, pagination: Pagination) {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;
  const rawQuery = (query || "").trim();

  // Handle empty query: return latest public discover feed without expensive search computation
  if (!rawQuery) {
    const discoverSql = `
      SELECT
        u.*,
        COUNT(*) OVER() AS total_count,
        json_build_object(
          'id', ch.id,
          'handle', ch.handle,
          'channelName', ch."channelName",
          'profilePictureUrl', ch."profilePictureUrl"
        ) AS channel,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', v.id,
                'resolution', v.resolution,
                'url', v.url
              )
            )
            FROM video v
            WHERE v."uploadId" = u.id
          ),
          '[]'::json
        ) AS videos
      FROM upload u
      JOIN channel ch ON ch.id = u."channelId"
      WHERE u."isDeleted" = false
        AND u.visibility = 'PUBLIC'
        AND u."processingStatus" = 'COMPLETED'
      ORDER BY u."createdAt" DESC, u.id DESC
      LIMIT $1 OFFSET $2;
    `;

    const result = await pgPool.query(discoverSql, [limit, offset]);
    const total = result.rows.length > 0 ? Number(result.rows[0].total_count) : 0;
    const items = result.rows.map((row) => {
      const { total_count, ...item } = row;
      return {
        ...item,
        searchScore: 1.0,
        matchReasons: ["Discovery"],
      };
    });

    return {
      videos: items,
      channels: [],
      items,
      pagination: getPaginationMeta(total, page, limit),
    };
  }

  // Tokenize & normalize query
  const normalized = normalizeQuery(rawQuery);
  const rawTokens = normalized.split(/\s+/).filter(Boolean);
  const { correctedTokens, correctionsMade } = correctKnownTypos(rawTokens);
  const synonyms = expandSynonyms(correctedTokens);
  const allConceptTokens = Array.from(new Set([...correctedTokens, ...synonyms]));
  const tsQueryString = buildTsQueryString(correctedTokens, synonyms);

  // Parameterized search query with relevance ranking
  const searchSql = `
    WITH candidates AS (
      SELECT
        u.id,
        u."channelId",
        u.title,
        u.description,
        u."thumbnailUrl",
        u."hlsManifestUrl",
        u."viewCount",
        u."isDeleted",
        u.visibility,
        u."processingStatus",
        u."createdAt",
        u."updatedAt",
        u.category,
        u.mood,
        u."visualStyle",
        u."colorTone",
        u.environment,
        u.tags,
        (
          -- Tier 1: Exact title match (+50)
          (CASE WHEN LOWER(u.title) = LOWER($1) THEN 50.0 ELSE 0.0 END) +

          -- Tier 2: Title prefix (+30) or contains (+20)
          (CASE WHEN LOWER(u.title) LIKE LOWER($1 || '%') THEN 30.0
                WHEN LOWER(u.title) LIKE LOWER('%' || $1 || '%') THEN 20.0
                ELSE 0.0 END) +

          -- Tier 3: Category, Mood, Visual Style, Color, Environment match (+25)
          (CASE WHEN LOWER(COALESCE(u.category, '')) = ANY($2::text[])
                  OR LOWER(COALESCE(u.mood, '')) = ANY($2::text[])
                  OR LOWER(COALESCE(u."visualStyle", '')) = ANY($2::text[])
                  OR LOWER(COALESCE(u."colorTone", '')) = ANY($2::text[])
                  OR LOWER(COALESCE(u.environment, '')) = ANY($2::text[]) THEN 25.0
                ELSE 0.0 END) +

          -- Tier 4: Explicit tags match (+20)
          (CASE WHEN LOWER(COALESCE(u.tags, '')) LIKE LOWER('%' || $1 || '%') THEN 20.0 ELSE 0.0 END) +

          -- Tier 5: Weighted Full-Text Search rank (up to +25)
          (CASE WHEN $3 <> '' THEN ts_rank_cd('{0.1, 0.2, 0.4, 1.0}', (
            setweight(to_tsvector('english', coalesce(u.title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(u.tags, '') || ' ' || coalesce(u.category, '') || ' ' || coalesce(u."visualStyle", '')), 'B') ||
            setweight(to_tsvector('english', coalesce(u.description, '') || ' ' || coalesce(u.mood, '') || ' ' || coalesce(u."colorTone", '') || ' ' || coalesce(u.environment, '')), 'C')
          ), to_tsquery('english', $3)) * 25.0 ELSE 0.0 END) +

          -- Tier 6: Typo-tolerant trigram similarity (up to +15)
          (similarity(u.title, $1) * 15.0) +

          -- Tier 7: Modest popularity boost (logarithmic, capped at +5.0)
          LEAST(5.0, LOG(u."viewCount" + 1)) +

          -- Tier 8: Modest recency boost (decayed over time, capped at +2.0)
          LEAST(2.0, 2.0 / (1.0 + EXTRACT(EPOCH FROM (NOW() - u."createdAt")) / 2592000.0))
        ) AS score
      FROM upload u
      WHERE u."isDeleted" = false
        AND u.visibility = 'PUBLIC'
        AND u."processingStatus" = 'COMPLETED'
        AND (
          LOWER(u.title) LIKE LOWER('%' || $1 || '%')
          OR ($3 <> '' AND (
            setweight(to_tsvector('english', coalesce(u.title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(u.tags, '') || ' ' || coalesce(u.category, '') || ' ' || coalesce(u."visualStyle", '')), 'B') ||
            setweight(to_tsvector('english', coalesce(u.description, '') || ' ' || coalesce(u.mood, '') || ' ' || coalesce(u."colorTone", '') || ' ' || coalesce(u.environment, '')), 'C')
          ) @@ to_tsquery('english', $3))
          OR similarity(u.title, $1) >= 0.25
          OR LOWER(COALESCE(u.tags, '')) LIKE LOWER('%' || $1 || '%')
          OR LOWER(COALESCE(u.category, '')) = ANY($2::text[])
          OR LOWER(COALESCE(u.mood, '')) = ANY($2::text[])
          OR LOWER(COALESCE(u."visualStyle", '')) = ANY($2::text[])
          OR LOWER(COALESCE(u."colorTone", '')) = ANY($2::text[])
          OR LOWER(COALESCE(u.environment, '')) = ANY($2::text[])
        )
    ),
    counted AS (
      SELECT COUNT(*) as total_count FROM candidates
    )
    SELECT
      c.*,
      counted.total_count,
      json_build_object(
        'id', ch.id,
        'handle', ch.handle,
        'channelName', ch."channelName",
        'profilePictureUrl', ch."profilePictureUrl"
      ) AS channel,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', v.id,
              'resolution', v.resolution,
              'url', v.url
            )
          )
          FROM video v
          WHERE v."uploadId" = c.id
        ),
        '[]'::json
      ) AS videos
    FROM candidates c
    CROSS JOIN counted
    JOIN channel ch ON ch.id = c."channelId"
    ORDER BY c.score DESC, c."viewCount" DESC, c."createdAt" DESC, c.id DESC
    LIMIT $4 OFFSET $5;
  `;

  // Search channels matching channelName or handle
  const channelSql = `
    SELECT id, handle, "channelName", "profilePictureUrl"
    FROM channel
    WHERE "channelName" ILIKE '%' || $1 || '%' OR handle ILIKE '%' || $1 || '%'
    LIMIT 5;
  `;

  const [searchRes, channelRes] = await Promise.all([
    pgPool.query(searchSql, [normalized, allConceptTokens, tsQueryString, limit, offset]),
    pgPool.query(channelSql, [normalized]),
  ]);

  const total = searchRes.rows.length > 0 ? Number(searchRes.rows[0].total_count) : 0;

  const items: SearchUploadItem[] = searchRes.rows.map((row) => {
    const { total_count, score, ...item } = row;
    const matchReasons = determineMatchReasons(
      item,
      rawQuery,
      normalized,
      correctionsMade,
      allConceptTokens,
    );

    return {
      ...item,
      searchScore: Number(Number(score || 0).toFixed(2)),
      matchReasons,
    };
  });

  return {
    videos: items,
    channels: channelRes.rows,
    items,
    pagination: getPaginationMeta(total, page, limit),
  };
}

/**
 * Intelligent discovery autocomplete suggestions:
 * Combines matching titles, categories, visual styles, and environments.
 */
export async function getSuggestions(query: string): Promise<string[]> {
  const sanitized = (query || "").trim();
  if (!sanitized) {
    return [];
  }

  const normalized = normalizeQuery(sanitized);
  const rawTokens = normalized.split(/\s+/).filter(Boolean);
  const { correctedTokens } = correctKnownTypos(rawTokens);
  const correctedQuery = correctedTokens.join(" ");
  const synonyms = expandSynonyms(correctedTokens);
  const allTokens = Array.from(
    new Set([normalized, correctedQuery, ...correctedTokens, ...synonyms].map((t) => t.toLowerCase())),
  );

  const suggestionsSql = `
    SELECT title, category, "visualStyle"
    FROM upload
    WHERE "isDeleted" = false
      AND visibility = 'PUBLIC'
      AND "processingStatus" = 'COMPLETED'
      AND (
        title ILIKE '%' || $1 || '%'
        OR title ILIKE '%' || $2 || '%'
        OR similarity(title, $1) >= 0.2
        OR similarity(title, $2) >= 0.2
        OR LOWER(COALESCE(category, '')) = ANY($3::text[])
        OR LOWER(COALESCE("visualStyle", '')) = ANY($3::text[])
        OR LOWER(COALESCE(mood, '')) = ANY($3::text[])
        OR LOWER(COALESCE(tags, '')) LIKE '%' || $2 || '%'
      )
    ORDER BY
      CASE
        WHEN LOWER(title) LIKE LOWER($1 || '%') OR LOWER(title) LIKE LOWER($2 || '%') THEN 1
        WHEN LOWER(title) LIKE LOWER('%' || $2 || '%') THEN 2
        ELSE 3
      END,
      "viewCount" DESC
    LIMIT 10;
  `;

  try {
    const res = await pgPool.query(suggestionsSql, [normalized, correctedQuery, allTokens]);
    const titles = res.rows.map((r) => r.title);

    // Also include category/style suggestions if matching query or corrected query
    const categories = ["Anime", "Pixel Art", "Cyberpunk", "Nature", "Ocean", "Cars", "Space", "Minimal", "Japanese"];
    const matchedCategories = categories
      .filter((c) =>
        allTokens.some((t) => c.toLowerCase().includes(t) || t.includes(c.toLowerCase())),
      )
      .map((c) => `${c} Wallpapers`);

    const combined = Array.from(new Set([...matchedCategories, ...titles])).slice(0, 10);
    return combined;
  } catch (err) {
    console.error("Suggestions query error:", err);
    return [];
  }
}
