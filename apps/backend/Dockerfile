# syntax=docker/dockerfile:1

FROM node:20-bullseye AS base
WORKDIR /workspace
ENV PNPM_HOME=/usr/local/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable pnpm

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages ./packages
RUN pnpm install --no-frozen-lockfile

FROM deps AS builder
ENV NODE_ENV=production
COPY . .
RUN pnpm --filter @erp/backend exec prisma generate
RUN pnpm --filter @erp/backend build

FROM node:20-bullseye AS runner
ENV NODE_ENV=production
WORKDIR /app

# Copy entire node_modules structure from builder (includes all dependencies)
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/backend/node_modules ./apps/backend/node_modules

# Copy built application and necessary files
COPY --from=builder /workspace/apps/backend/dist ./apps/backend/dist
COPY --from=builder /workspace/apps/backend/package.json ./apps/backend/
COPY --from=builder /workspace/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /workspace/package.json ./
COPY --from=builder /workspace/pnpm-lock.yaml ./
COPY --from=builder /workspace/pnpm-workspace.yaml ./

WORKDIR /app/apps/backend
EXPOSE 3000
CMD node dist/main.js

