# Supplier Backend

Supplier management system backend built with NestJS.

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Update `.env` with your database and configuration.

4. Run migrations:
```bash
pnpm prisma migrate dev
```

5. Start development server:
```bash
pnpm dev
```

Server will run on `http://localhost:3002`

## API Documentation

Swagger docs available at `http://localhost:3002/docs`

