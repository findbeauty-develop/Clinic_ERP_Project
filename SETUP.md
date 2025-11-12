# Setup Instructions

## Environment Variables

### Frontend (`apps/frontend/.env.local`)

Create `apps/frontend/.env.local` with:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Backend (`apps/backend/.env`)

Create `apps/backend/.env` with:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
DATABASE_URL=your_postgres_connection_string
PORT=3000
```

## Initial Setup Steps

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Initialize Prisma database:**
   ```bash
   pnpm --filter backend prisma migrate dev --name init
   ```

3. **Generate Prisma client:**
   ```bash
   pnpm --filter backend prisma generate
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

## Testing API Endpoints

All endpoints require authentication. Include the Bearer token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

The JWT token should contain:
- `user_metadata.tenant_id`: The tenant identifier
- `user_metadata.roles`: Array of user roles (e.g., `["clerk", "manager", "admin"]`)

## Example API Calls

### Create Product (requires manager/admin role)
```bash
curl -X POST http://localhost:3000/catalog/products \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "PROD-001",
    "name": "Product Name",
    "uom": "pcs",
    "barcode": "123456789"
  }'
```

### List Products (requires clerk/manager/admin role)
```bash
curl http://localhost:3000/catalog/products \
  -H "Authorization: Bearer <token>"
```

