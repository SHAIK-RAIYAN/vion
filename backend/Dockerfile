# Production Dockerfile for Vion Express API Backend
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install system utilities & media tools (curl for healthchecks, ffmpeg for media inspection)
RUN apk add --no-cache curl ffmpeg

# Install production dependencies
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Final runtime container
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=5000
ENV FFMPEG_PATH=ffmpeg
ENV FFPROBE_PATH=ffprobe
ENV FFMPEG_PRESET=veryfast
ENV FFMPEG_THREADS=1
ENV MAX_RENDITIONS=2
ENV WORKER_CONCURRENCY=1
ENV FAST_TRANSCODE=true
ENV WORKER_MODE=embedded
ENV X264_LOW_MEM=true
ENV TEMP_MEDIA_DIR=/app/tmp/media

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY src ./src
COPY prisma.config.ts ./

# Create required temporary media directory
RUN mkdir -p tmp/media && chown -R bun:bun /app

USER bun

EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/v1/health || exit 1

CMD ["bun", "--smol", "src/index.ts"]
