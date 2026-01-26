# =============================================================================
# Mastra Slack Agent - Production Dockerfile
# Multi-stage build for minimal image size
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies (production only + tsx)
# -----------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies and tsx in one step
# Using --omit=dev then adding tsx separately to avoid devDependencies bloat
RUN npm ci --omit=dev --ignore-scripts && \
    npm install tsx --save-prod --ignore-scripts && \
    npm cache clean --force

# -----------------------------------------------------------------------------
# Stage 2: Runner
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 mastra && \
    adduser --system --uid 1001 --ingroup mastra mastra

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

# Copy source code (tsx runs TypeScript directly)
COPY tsconfig.json ./
COPY src/ ./src/

# Set ownership to non-root user
RUN chown -R mastra:mastra /app

# Switch to non-root user
USER mastra

# Environment
ENV NODE_ENV=production

# Health check (Socket Mode doesn't expose HTTP, so we check the process)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD pgrep -f "tsx" > /dev/null || exit 1

# Start the application
CMD ["npx", "tsx", "src/index.ts"]
