# Postman'da Package API'larni Test Qilish Qo'llanmasi

## 1. Backend Server Ishga Tushirish

```bash
cd apps/backend
pnpm run start:dev
```

Server `http://localhost:3000` da ishga tushadi.

---

## 2. Login Qilish va Token Olish

### Request:
- **Method:** `POST`
- **URL:** `http://localhost:3000/iam/members/login`
- **Headers:**
  ```
  Content-Type: application/json
  ```
- **Body (raw JSON):**
  ```json
  {
    "memberId": "owner1@clinicname",
    "password": "your_password"
  }
  ```

### Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "member": {
    "id": "...",
    "member_id": "owner1@clinicname",
    "tenant_id": "...",
    "role": "owner",
    "clinic_name": "..."
  }
}
```

**Token'ni saqlang** - barcha keyingi request'larda ishlatiladi!

---

## 3. Package API'larni Test Qilish

### 3.1. Barcha Paketlarni Olish

**Request:**
- **Method:** `GET`
- **URL:** `http://localhost:3000/packages`
- **Headers:**
  ```
  Authorization: Bearer YOUR_TOKEN_HERE
  Content-Type: application/json
  ```

**Response:**
```json
[
  {
    "id": "package-uuid",
    "name": "패키지명",
    "description": "설명",
    "isActive": true,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z",
    "itemsCount": 3
  }
]
```

---

### 3.2. Paket Yaratish

**Request:**
- **Method:** `POST`
- **URL:** `http://localhost:3000/packages`
- **Headers:**
  ```
  Authorization: Bearer YOUR_TOKEN_HERE
  Content-Type: application/json
  ```
- **Body (raw JSON):**
  ```json
  {
    "name": "기본 패키지",
    "description": "기본 구성 패키지",
    "items": [
      {
        "productId": "product-uuid-1",
        "quantity": 2,
        "order": 0
      },
      {
        "productId": "product-uuid-2",
        "quantity": 1,
        "order": 1
      }
    ]
  }
  ```

**Response:**
```json
{
  "id": "package-uuid",
  "name": "기본 패키지",
  "description": "기본 구성 패키지",
  "isActive": true,
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z",
  "items": [
    {
      "id": "item-uuid-1",
      "productId": "product-uuid-1",
      "productName": "제품명 1",
      "brand": "브랜드 1",
      "unit": "개",
      "quantity": 2,
      "order": 0
    },
    {
      "id": "item-uuid-2",
      "productId": "product-uuid-2",
      "productName": "제품명 2",
      "brand": "브랜드 2",
      "unit": "개",
      "quantity": 1,
      "order": 1
    }
  ]
}
```

---

### 3.3. Paket Detallarini Olish

**Request:**
- **Method:** `GET`
- **URL:** `http://localhost:3000/packages/{packageId}`
- **Headers:**
  ```
  Authorization: Bearer YOUR_TOKEN_HERE
  Content-Type: application/json
  ```

**Response:**
```json
{
  "id": "package-uuid",
  "name": "기본 패키지",
  "description": "기본 구성 패키지",
  "isActive": true,
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z",
  "items": [
    {
      "id": "item-uuid-1",
      "productId": "product-uuid-1",
      "productName": "제품명 1",
      "brand": "브랜드 1",
      "unit": "개",
      "quantity": 2,
      "order": 0
    }
  ]
}
```

---

### 3.4. Paket 구성 제품 (출고용) Olish

**Request:**
- **Method:** `GET`
- **URL:** `http://localhost:3000/packages/{packageId}/items`
- **Headers:**
  ```
  Authorization: Bearer YOUR_TOKEN_HERE
  Content-Type: application/json
  ```

**Response:**
```json
[
  {
    "productId": "product-uuid-1",
    "productName": "제품명 1",
    "brand": "브랜드 1",
    "unit": "개",
    "packageQuantity": 2,
    "currentStock": 100,
    "minStock": 10,
    "batches": [
      {
        "id": "batch-uuid-1",
        "batchNo": "BATCH-001",
        "qty": 50,
        "expiryDate": "2025-12-31T00:00:00.000Z",
        "expiryMonths": 12,
        "expiryUnit": "months",
        "storage": "선반 A-1",
        "isExpiringSoon": false,
        "daysUntilExpiry": 365
      },
      {
        "id": "batch-uuid-2",
        "batchNo": "BATCH-002",
        "qty": 50,
        "expiryDate": "2025-06-30T00:00:00.000Z",
        "expiryMonths": 6,
        "expiryUnit": "months",
        "storage": "선반 A-2",
        "isExpiringSoon": true,
        "daysUntilExpiry": 30
      }
    ]
  }
]
```

**Note:** Batches FEFO sort qilingan (유효기간 임박 제품 상단 우선 노출)

---

### 3.5. Paket Yangilash

**Request:**
- **Method:** `PUT`
- **URL:** `http://localhost:3000/packages/{packageId}`
- **Headers:**
  ```
  Authorization: Bearer YOUR_TOKEN_HERE
  Content-Type: application/json
  ```
- **Body (raw JSON):**
  ```json
  {
    "name": "업데이트된 패키지명",
    "description": "업데이트된 설명",
    "items": [
      {
        "productId": "product-uuid-1",
        "quantity": 3,
        "order": 0
      }
    ]
  }
  ```

---

### 3.6. Paket O'chirish

**Request:**
- **Method:** `DELETE`
- **URL:** `http://localhost:3000/packages/{packageId}`
- **Headers:**
  ```
  Authorization: Bearer YOUR_TOKEN_HERE
  Content-Type: application/json
  ```

**Response:**
```json
{
  "message": "Package deleted successfully"
}
```

---

## 4. Package Outbound API Test Qilish

### 4.1. Paket 출고 처리

**Request:**
- **Method:** `POST`
- **URL:** `http://localhost:3000/outbound/package`
- **Headers:**
  ```
  Authorization: Bearer YOUR_TOKEN_HERE
  Content-Type: application/json
  ```
- **Body (raw JSON):**
  ```json
  {
    "packageId": "package-uuid",
    "managerName": "담당자 이름",
    "patientName": "환자 이름 (optional)",
    "chartNumber": "차트번호 (optional)",
    "memo": "메모 (optional)",
    "items": [
      {
        "productId": "product-uuid-1",
        "batchId": "batch-uuid-1",
        "outboundQty": 5
      },
      {
        "productId": "product-uuid-2",
        "batchId": "batch-uuid-2",
        "outboundQty": 3
      }
    ]
  }
  ```

**Response (Success):**
```json
{
  "success": true,
  "outboundIds": [
    "outbound-uuid-1",
    "outbound-uuid-2"
  ],
  "message": "All items processed successfully"
}
```

**Response (Partial Success):**
```json
{
  "success": true,
  "outboundIds": [
    "outbound-uuid-1"
  ],
  "failedItems": [
    {
      "productId": "product-uuid-2",
      "batchId": "batch-uuid-2",
      "outboundQty": 100
    }
  ],
  "message": "1 items processed successfully, 1 items failed"
}
```

**Response (All Failed):**
```json
{
  "success": false,
  "message": "All items failed validation",
  "failedItems": [
    {
      "productId": "product-uuid-1",
      "batchId": "batch-uuid-1",
      "outboundQty": 1000
    }
  ],
  "outboundIds": []
}
```

---

## 5. Postman Collection Yaratish

### Environment Variables:

1. **Postman'da Environment yarating:**
   - `base_url`: `http://localhost:3000`
   - `token`: (login'dan keyin avtomatik to'ldiriladi)

2. **Pre-request Script (login uchun):**
   ```javascript
   // Login request uchun
   pm.environment.set("token", pm.response.json().token);
   ```

3. **Authorization (barcha request'lar uchun):**
   - Type: `Bearer Token`
   - Token: `{{token}}`

---

## 6. Test Qadamlari

### Step 1: Login
```
POST {{base_url}}/iam/members/login
```

### Step 2: Paket Yaratish
```
POST {{base_url}}/packages
```

### Step 3: Paketlarni Ko'rish
```
GET {{base_url}}/packages
```

### Step 4: Paket 구성 제품 Olish (출고용)
```
GET {{base_url}}/packages/{packageId}/items
```

### Step 5: Paket 출고 처리
```
POST {{base_url}}/outbound/package
```

---

## 7. Xatoliklar va Yechimlar

### 401 Unauthorized
- Token noto'g'ri yoki muddati o'tgan
- **Yechim:** Qayta login qiling

### 400 Bad Request
- Request body noto'g'ri
- **Yechim:** Body'ni tekshiring, required field'larni to'ldiring

### 404 Not Found
- Paket yoki product topilmadi
- **Yechim:** ID'larni tekshiring

### 403 Forbidden
- Tenant ID noto'g'ri
- **Yechim:** Token'da tenant_id borligini tekshiring

---

## 8. Swagger Docs

Backend'da Swagger docs mavjud:
- **URL:** `http://localhost:3000/docs`
- Bu yerda barcha API'larni ko'rishingiz va test qilishingiz mumkin

---

## 9. Example Test Flow

1. **Login qiling:**
   ```bash
   POST /iam/members/login
   Body: { "memberId": "owner1@clinic", "password": "password" }
   ```

2. **Token'ni saqlang**

3. **Product yarating yoki mavjud product ID'ni oling:**
   ```bash
   GET /products
   ```

4. **Paket yarating:**
   ```bash
   POST /packages
   Body: {
     "name": "Test Package",
     "items": [
       { "productId": "product-id-1", "quantity": 2 }
     ]
   }
   ```

5. **Paket 구성 제품 olish:**
   ```bash
   GET /packages/{packageId}/items
   ```

6. **Paket 출고:**
   ```bash
   POST /outbound/package
   Body: {
     "packageId": "package-id",
     "managerName": "Manager",
     "items": [
       { "productId": "product-id-1", "batchId": "batch-id-1", "outboundQty": 1 }
     ]
   }
   ```

---

## 10. Postman Collection JSON (Import qilish uchun)

Postman'da "Import" tugmasini bosing va quyidagi JSON'ni import qiling:

```json
{
  "info": {
    "name": "Package API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Login",
      "request": {
        "method": "POST",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"memberId\": \"owner1@clinic\",\n  \"password\": \"password\"\n}"
        },
        "url": {
          "raw": "{{base_url}}/iam/members/login",
          "host": ["{{base_url}}"],
          "path": ["iam", "members", "login"]
        }
      }
    },
    {
      "name": "Get All Packages",
      "request": {
        "method": "GET",
        "header": [{"key": "Authorization", "value": "Bearer {{token}}"}],
        "url": {
          "raw": "{{base_url}}/packages",
          "host": ["{{base_url}}"],
          "path": ["packages"]
        }
      }
    },
    {
      "name": "Create Package",
      "request": {
        "method": "POST",
        "header": [
          {"key": "Authorization", "value": "Bearer {{token}}"},
          {"key": "Content-Type", "value": "application/json"}
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"name\": \"Test Package\",\n  \"description\": \"Test\",\n  \"items\": [\n    {\n      \"productId\": \"product-id\",\n      \"quantity\": 2\n    }\n  ]\n}"
        },
        "url": {
          "raw": "{{base_url}}/packages",
          "host": ["{{base_url}}"],
          "path": ["packages"]
        }
      }
    },
    {
      "name": "Package Outbound",
      "request": {
        "method": "POST",
        "header": [
          {"key": "Authorization", "value": "Bearer {{token}}"},
          {"key": "Content-Type", "value": "application/json"}
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"packageId\": \"package-id\",\n  \"managerName\": \"Manager\",\n  \"items\": [\n    {\n      \"productId\": \"product-id\",\n      \"batchId\": \"batch-id\",\n      \"outboundQty\": 1\n    }\n  ]\n}"
        },
        "url": {
          "raw": "{{base_url}}/outbound/package",
          "host": ["{{base_url}}"],
          "path": ["outbound", "package"]
        }
      }
    }
  ]
}
```

---

**Muvaffaqiyat!** Endi barcha API'larni Postman'da test qilishingiz mumkin! 🚀

