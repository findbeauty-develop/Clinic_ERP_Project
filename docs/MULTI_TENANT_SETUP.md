# Multi-Tenant Tizim - Keyingi Qadamlar

## ✅ Bajarilgan ishlar:

1. ✅ Database schema'da barcha modellarda `tenant_id` majburiy qilindi
2. ✅ Repository'larda barcha query'larda `tenant_id` filtri qo'shildi
3. ✅ Service'larda `tenant_id` majburiy qilindi
4. ✅ Controller'larda `tenant_id` guard'dan olinadi
5. ✅ Upload utils'da tenant-specific papkalar yaratildi
6. ✅ Frontend'da API helper yaratildi
7. ✅ Member login endpoint'i tenant_id qaytaradi
8. ✅ Frontend'da login bo'lganda tenant_id saqlanadi

## 🔧 Keyingi qadamlar:

### 1. Member Authentication Tizimini To'liq Tashkil Qilish

**Muammo:** Member login Supabase token qaytarmaydi, lekin backend'da `JwtTenantGuard` token talab qiladi.

**Yechimlar:**

#### Variant A: Member Login uchun Alohida Guard (Tavsiya etiladi)
- Member login bo'lganda, member'ning `tenant_id` va `member_id`'sini qaytarish
- Frontend'da bu ma'lumotlarni localStorage'da saqlash
- API chaqiriqlarida `X-Tenant-ID` header'ini yuborish
- Backend'da `MemberTenantGuard` yaratish - bu guard token o'rniga `X-Tenant-ID` header'ini tekshiradi

#### Variant B: Supabase Token Integration
- Member login bo'lganda, Supabase'dan token olish
- Bu uchun Supabase'da har bir member uchun user yaratish kerak
- Token'da `tenant_id` va `member_id` bo'ladi

### 2. Frontend'da Barcha API Chaqiriqlarini Yangilash

Hozircha faqat `/inbound/new` sahifasi yangi API helper'dan foydalanadi. Boshqa sahifalarni ham yangilash kerak:

- `/clinic/register` - Clinic registration
- `/clinic/register/member` - Member creation
- `/clinic/register/complete` - Clinic complete
- `/clinic/register/success` - Success page
- `/inbound` - Inbound list

### 3. Backend'da Public Endpoint'larni Aniqlash

Ba'zi endpoint'lar public bo'lishi kerak (masalan, clinic registration, member login). Bu endpoint'larni `@Public()` decorator bilan belgilash kerak.

### 4. Test Qilish

1. **Member Login Test:**
   ```bash
   # Postman yoki curl bilan test qiling
   POST http://localhost:3000/iam/members/login
   {
     "memberId": "owner1@clinic-xxx",
     "password": "your-password"
   }
   ```

2. **Product Create Test:**
   ```bash
   # Token bilan test qiling
   POST http://localhost:3000/products
   Authorization: Bearer <token>
   {
     "name": "Test Product",
     "brand": "Test Brand",
     "category": "Test Category",
     ...
   }
   ```

3. **Multi-Tenant Test:**
   - Ikki xil tenant_id bilan product yarating
   - Bir tenant'ning product'larini ikkinchi tenant ko'ra olmasligi kerak

## 📝 Kod O'zgarishlari:

### Backend - MemberTenantGuard yaratish (Variant A uchun):

```typescript
// src/common/guards/member-tenant.guard.ts
import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from "@nestjs/common";

@Injectable()
export class MemberTenantGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const tenantId = req.headers["x-tenant-id"] as string | undefined;
    
    if (!tenantId) {
      throw new ForbiddenException("Tenant ID is required");
    }
    
    req.tenantId = tenantId;
    return true;
  }
}
```

### Frontend - API Helper'ni yangilash:

```typescript
// lib/api.ts - apiRequest funksiyasini yangilash
export const apiRequest = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  const apiUrl = getApiUrl();
  const token = getAuthToken();
  const tenantId = getTenantId();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  
  // Add tenant ID header if available
  if (tenantId) {
    headers["X-Tenant-ID"] = tenantId;
  }

  const url = endpoint.startsWith("http") ? endpoint : `${apiUrl}${endpoint}`;
  return fetch(url, { ...options, headers });
};
```

## 🚀 Tezkor Boshlash:

1. **Backend'ni ishga tushiring:**
   ```bash
   cd apps/backend
   pnpm dev
   ```

2. **Frontend'ni ishga tushiring:**
   ```bash
   cd apps/frontend
   pnpm dev
   ```

3. **Test qiling:**
   - Login qiling
   - Product yarating
   - Boshqa tenant'ning product'larini ko'ra olmasligini tekshiring

## ⚠️ Muhim Eslatmalar:

1. **Xavfsizlik:** `X-Tenant-ID` header'ini faqat trusted source'dan qabul qiling
2. **Validation:** Har bir API chaqiriqda `tenant_id`'ni tekshiring
3. **Error Handling:** Tenant ID topilmasa, aniq xato qaytaring
4. **Logging:** Barcha tenant-related operatsiyalarni log qiling

## 📚 Qo'shimcha Ma'lumot:

- [NestJS Guards Documentation](https://docs.nestjs.com/guards)
- [Prisma Multi-Tenancy](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management#multi-tenancy)
- [Supabase JWT](https://supabase.com/docs/guides/auth/jwts)

