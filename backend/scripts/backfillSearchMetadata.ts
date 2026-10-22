/**
 * Bounded, Idempotent Backfill Script for Vion Wallpaper Discovery Metadata
 * Zero-cost, runs on demand in small batches without background worker.
 *
 * Usage: bun run scripts/backfillSearchMetadata.ts
 */

import { Pool } from "pg";
import { DB_URL } from "../src/config/config";

interface MetadataInference {
  category: string;
  mood: string;
  visualStyle: string;
  colorTone: string;
  environment: string;
  tags: string;
  description?: string;
}

const INFERENCE_RULES: Array<{
  match: RegExp;
  data: MetadataInference;
}> = [
  {
    match: /kanagawa|great wave/i,
    data: {
      category: "Art",
      mood: "Cinematic",
      visualStyle: "Illustration",
      colorTone: "Blue",
      environment: "Ocean",
      tags: "kanagawa, great wave, ocean, sea, wave, japan, japanese, blue, water",
      description: "Traditional Japanese ukiyo-e wave artwork with crashing blue ocean water.",
    },
  },
  {
    match: /pixel lofi city|lofi city/i,
    data: {
      category: "City",
      mood: "Calm",
      visualStyle: "Pixel Art",
      colorTone: "Neon",
      environment: "City",
      tags: "pixel art, lofi, city, neon, cozy, aesthetic, night, urban, chill",
      description: "Cozy animated pixel art cityscape with glowing neon lights at night.",
    },
  },
  {
    match: /sukuna|jujutsu kaisen/i,
    data: {
      category: "Anime",
      mood: "Dark",
      visualStyle: "Anime",
      colorTone: "Dark",
      environment: "Supernatural",
      tags: "anime, jujutsu kaisen, sukuna, dark, energetic, supernatural, manga",
      description: "High energy dark supernatural anime wallpaper of Ryomen Sukuna.",
    },
  },
  {
    match: /gojo/i,
    data: {
      category: "Anime",
      mood: "Calm",
      visualStyle: "Anime",
      colorTone: "Warm",
      environment: "Indoor",
      tags: "anime, gojo, cat, jujutsu kaisen, cute, calm, serene",
      description: "Whimsical and peaceful live wallpaper of Gojo Satoru with a kitten.",
    },
  },
  {
    match: /koi fish/i,
    data: {
      category: "Nature",
      mood: "Peaceful",
      visualStyle: "Illustration",
      colorTone: "Warm",
      environment: "Pond",
      tags: "koi, fish, pond, water, peaceful, calm, serene, nature, relaxing",
      description: "Peaceful flowing koi fish swimming in serene clear pond water.",
    },
  },
  {
    match: /miles morales|spider/i,
    data: {
      category: "Superhero",
      mood: "Cinematic",
      visualStyle: "Illustration",
      colorTone: "Dark",
      environment: "City",
      tags: "spiderman, miles morales, spider-verse, city, dark, falling, neon, marvel",
      description: "Cinematic upside-down falling leap over a dark glowing neon metropolis.",
    },
  },
  {
    match: /toyota chaser|drifting/i,
    data: {
      category: "Cars",
      mood: "Energetic",
      visualStyle: "3D Render",
      colorTone: "Neon",
      environment: "Tunnel",
      tags: "toyota, chaser, drift, drifting, car, vehicle, tunnel, night, neon, energetic",
      description: "Midnight automotive drifting through a high-speed neon tunnel.",
    },
  },
  {
    match: /black hole|monochrome/i,
    data: {
      category: "Sci-Fi",
      mood: "Dark",
      visualStyle: "Minimal",
      colorTone: "Monochrome",
      environment: "Space",
      tags: "black hole, space, cosmic, galaxy, astronomy, monochrome, dark, minimal",
      description: "Minimalist black and white cosmic gravitational singularity in deep space.",
    },
  },
  {
    match: /crown of thorns/i,
    data: {
      category: "Abstract",
      mood: "Dark",
      visualStyle: "Illustration",
      colorTone: "Dark",
      environment: "Nature",
      tags: "crown of thorns, dark, gothic, dramatic, moody, abstract",
      description: "Atmospheric dark botanical gothic wallpaper with thorny branches.",
    },
  },
  {
    match: /wavy grass|grass/i,
    data: {
      category: "Nature",
      mood: "Calm",
      visualStyle: "Photography",
      colorTone: "Green",
      environment: "Field",
      tags: "wavy grass, grass, nature, wind, peaceful, green, meadow, relaxing, serene",
      description: "Gentle green grass blades swaying gracefully in the serene wind.",
    },
  },
  {
    match: /cottage|summer cloud/i,
    data: {
      category: "Nature",
      mood: "Dreamy",
      visualStyle: "Anime",
      colorTone: "Warm",
      environment: "Cottage",
      tags: "summer, clouds, cottage, nature, serene, anime, sky, peaceful",
      description: "Dreamy countryside cottage beneath expansive fluffy summer clouds.",
    },
  },
  {
    match: /cat|stray/i,
    data: {
      category: "Animals",
      mood: "Calm",
      visualStyle: "Anime",
      colorTone: "Dark",
      environment: "Night Sky",
      tags: "cat, night sky, stars, moon, calm, peaceful, feline, cute",
      description: "Gentle cat gazing at the starry night sky and moonlit clouds.",
    },
  },
  {
    match: /luffy|gear 5/i,
    data: {
      category: "Anime",
      mood: "Energetic",
      visualStyle: "Anime",
      colorTone: "White",
      environment: "Night Sky",
      tags: "one piece, luffy, gear 5, moon, anime, night, energetic, dynamic",
      description: "Joyboy Luffy Gear 5 laughing under the full moonlit night sky.",
    },
  },
];

async function runBackfill() {
  const pool = new Pool({ connectionString: DB_URL });
  console.log("=== Vion Search Metadata Backfill ===");

  try {
    const { rows: uploads } = await pool.query(`
      SELECT id, title, description, category, mood, "visualStyle", "colorTone", environment, tags
      FROM upload
      WHERE "isDeleted" = false
      ORDER BY "createdAt" DESC;
    `);

    console.log(`Found ${uploads.length} total active uploads to examine.`);
    let updatedCount = 0;
    let skippedCount = 0;

    for (const item of uploads) {
      // Check if item already has metadata
      const hasCompleteMetadata =
        Boolean(item.category) &&
        Boolean(item.mood) &&
        Boolean(item.visualStyle) &&
        Boolean(item.colorTone) &&
        Boolean(item.environment) &&
        Boolean(item.tags);

      if (hasCompleteMetadata) {
        skippedCount++;
        continue;
      }

      // Find matching rule based on title + description
      const fullText = `${item.title || ""} ${item.description || ""}`.trim();
      const matchedRule = INFERENCE_RULES.find((r) => r.match.test(fullText));

      if (matchedRule) {
        const d = matchedRule.data;
        const newCategory = item.category || d.category;
        const newMood = item.mood || d.mood;
        const newStyle = item.visualStyle || d.visualStyle;
        const newColor = item.colorTone || d.colorTone;
        const newEnv = item.environment || d.environment;
        const newTags = item.tags || d.tags;
        const newDesc = item.description || d.description || null;

        await pool.query(
          `
          UPDATE upload
          SET
            category = $1,
            mood = $2,
            "visualStyle" = $3,
            "colorTone" = $4,
            environment = $5,
            tags = $6,
            description = COALESCE(description, $7)
          WHERE id = $8;
        `,
          [newCategory, newMood, newStyle, newColor, newEnv, newTags, newDesc, item.id],
        );

        console.log(`[Backfilled] "${item.title}" -> ${newCategory} | ${newStyle} | ${newColor} | ${newMood}`);
        updatedCount++;
      } else {
        // Fallback default safe tagging based on title words
        const defaultCategory = "Wallpaper";
        const defaultMood = "Calm";
        const defaultStyle = "Illustration";
        const defaultColor = "Neutral";
        const defaultEnv = "Ambient";
        const titleTokens = (item.title || "").toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
        const defaultTags = titleTokens.join(", ");

        await pool.query(
          `
          UPDATE upload
          SET
            category = COALESCE(category, $1),
            mood = COALESCE(mood, $2),
            "visualStyle" = COALESCE("visualStyle", $3),
            "colorTone" = COALESCE("colorTone", $4),
            environment = COALESCE(environment, $5),
            tags = COALESCE(tags, $6)
          WHERE id = $7;
        `,
          [defaultCategory, defaultMood, defaultStyle, defaultColor, defaultEnv, defaultTags, item.id],
        );

        console.log(`[Default-Tagged] "${item.title}"`);
        updatedCount++;
      }
    }

    console.log(`\nBackfill complete! Updated: ${updatedCount}, Skipped: ${skippedCount}`);
  } catch (err) {
    console.error("Backfill failed:", err);
  } finally {
    await pool.end();
  }
}

runBackfill();
