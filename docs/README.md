# ERP Monorepo

Production-ready ERP skeleton with Next.js frontend, NestJS backend, Prisma (Supabase Postgres), and Supabase Auth.

## Tech Stack

- **Frontend**: Next.js (App Router), Tailwind CSS, shadcn/ui ready
- **Backend**: NestJS, Prisma, Supabase Auth
- **Monorepo**: pnpm workspaces + Turborepo
- **Database**: Supabase PostgreSQL

## Quick Start

See [SETUP.md](./SETUP.md) for detailed setup instructions.

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment variables:**
   - Create `apps/frontend/.env.local` (see SETUP.md for template)
   - Create `apps/backend/.env` (see SETUP.md for template)

3. **Initialize database:**
   ```bash
   pnpm --filter backend prisma migrate dev --name init
   ```

4. **Start development servers:**
   ```bash
   pnpm dev
   ```

## Access Points

- **Frontend**: http://localhost:3001 (or Next.js default port)
- **Backend API**: http://localhost:3000
- **Swagger Docs**: http://localhost:3000/docs
- **Swagger JSON**: http://localhost:3000/docs-json

## Project Structure

```
/
├── apps/
│   ├── frontend/     # Next.js App Router
│   └── backend/      # NestJS API
├── packages/
│   ├── types/        # Shared TypeScript types
│   ├── api-client/   # OpenAPI client (future)
│   └── config/       # Shared configs (ESLint, TypeScript)
└── turbo.json        # Turborepo config
```

## Features

- Multi-tenant ready with `tenant_id` plumbing
- JWT authentication via Supabase
- Role-based access control (RBAC)
- MVC architecture: Controller → Service → Repository
- Swagger/OpenAPI documentation
- TypeScript strict mode

