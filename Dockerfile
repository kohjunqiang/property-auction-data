# ---- Stage 1: Builder ----
FROM node:20-alpine AS builder
WORKDIR /app

# Copy monorepo scaffolding
COPY package.json pnpm-lock.yaml turbo.json pnpm-workspace.yaml ./

# Copy all source (apps + packages)
COPY apps ./apps
COPY packages ./packages

# Install pnpm and all dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Build the backend (turbo's dependsOn: ["^build"] builds package dependencies first)
RUN pnpm turbo build --filter=api

# ---- Stage 2: Production ----
# Use node:20-slim (not alpine) — Playwright/Chromium requires glibc
FROM node:20-slim
WORKDIR /app

RUN npm install -g pnpm

# Copy monorepo structure files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/turbo.json ./

# Copy only packages and the backend app (not the frontend)
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Install Playwright Chromium and its system dependencies
RUN cd apps/api && pnpm exec playwright install --with-deps chromium

# Railway injects PORT at runtime
EXPOSE ${PORT}

WORKDIR /app/apps/api
CMD ["node", "dist/main"]
