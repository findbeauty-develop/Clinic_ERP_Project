# syntax=docker/dockerfile:1

FROM node:20-bullseye AS base
WORKDIR /workspace
ENV PNPM_HOME=/usr/local/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable pnpm

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/supplier-backend/package.json apps/supplier-backend/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/supplier-frontend/package.json apps/supplier-frontend/package.json
COPY packages ./packages
RUN pnpm install --no-frozen-lockfile

FROM deps AS builder
ENV NODE_ENV=production 
COPY . .
RUN pnpm --filter @erp/supplier-backend exec prisma generate
RUN pnpm --filter @erp/supplier-backend build

FROM node:20-bullseye AS runner
ENV NODE_ENV=production
WORKDIR /app

# Copy entire node_modules structure from builder (includes all dependencies)
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/supplier-backend/node_modules ./apps/supplier-backend/node_modules

# Copy built application and necessary files
COPY --from=builder /workspace/apps/supplier-backend/dist ./apps/supplier-backend/dist
COPY --from=builder /workspace/apps/supplier-backend/package.json ./apps/supplier-backend/
COPY --from=builder /workspace/apps/supplier-backend/prisma ./apps/supplier-backend/prisma
COPY --from=builder /workspace/package.json ./
COPY --from=builder /workspace/pnpm-lock.yaml ./
COPY --from=builder /workspace/pnpm-workspace.yaml ./

WORKDIR /app/apps/supplier-backend
EXPOSE 3002
CMD node dist/main.js

