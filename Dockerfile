FROM node:20-alpine AS base

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite-dev

WORKDIR /app

# ── deps stage ───────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ── builder stage ─────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build with standalone output
ENV NEXT_OUTPUT=standalone
RUN npm run build

# ── runner stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache sqlite-libs

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy native addons (better-sqlite3)
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

EXPOSE 3000

CMD ["node", "server.js"]
