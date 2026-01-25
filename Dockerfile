# ============================================
# Stage 1: Install production dependencies
# ============================================
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# ============================================
# Stage 2: Build the application
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source files
COPY . .

# Build the Mastra application
RUN npm run build

# ============================================
# Stage 3: Production runtime
# ============================================
FROM node:22-alpine AS runner

WORKDIR /app

# Install tsx for ESM TypeScript execution
RUN npm install -g tsx

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 mastra

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder /app/.mastra .//.mastra

# Copy source files (needed for tsx execution)
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./

# Set ownership to non-root user
RUN chown -R mastra:nodejs /app

# Switch to non-root user
USER mastra

# Set production environment
ENV NODE_ENV=production

# Expose port (optional, for health checks or Events API mode)
EXPOSE 3000

# Start the application
CMD ["npx", "tsx", "src/index.ts"]
