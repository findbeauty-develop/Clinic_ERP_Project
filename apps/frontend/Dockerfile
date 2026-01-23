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
# Build-time environment variables for Next.js
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPPLIER_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SUPPLIER_API_URL=${NEXT_PUBLIC_SUPPLIER_API_URL}
COPY . .
RUN pnpm --filter @erp/frontend build

FROM node:20-bullseye AS runner
ENV NODE_ENV=production
# Runtime environment variable (can be overridden)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPPLIER_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SUPPLIER_API_URL=${NEXT_PUBLIC_SUPPLIER_API_URL}
WORKDIR /app/apps/frontend

COPY --from=builder /workspace/node_modules /app/node_modules
COPY --from=builder /workspace/apps/frontend/node_modules ./node_modules
COPY --from=builder /workspace/apps/frontend/.next ./.next
COPY --from=builder /workspace/apps/frontend/package.json ./package.json
COPY --from=builder /workspace/apps/frontend/next.config.js ./next.config.js
COPY --from=builder /workspace/apps/frontend/tailwind.config.ts ./tailwind.config.ts
COPY --from=builder /workspace/apps/frontend/postcss.config.js ./postcss.config.js
COPY --from=builder /workspace/apps/frontend/public ./public

EXPOSE 3001
CMD node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3001

