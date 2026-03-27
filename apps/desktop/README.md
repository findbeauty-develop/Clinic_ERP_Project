# Jaclit ERP — Desktop App (Tauri)

`erp.jaclit.com` ni Windows/macOS desktop ilovasi sifatida ishga tushiradi.

**DMG / EXE yig‘ish va deploy bo‘yicha to‘liq qo‘llanma:** [docs/DESKTOP_BUILD_AND_DEPLOY.md](../../docs/DESKTOP_BUILD_AND_DEPLOY.md)

## Talablar

### 1. Rust o'rnatish
```bash
# Windows (PowerShell):
winget install Rustlang.Rustup

# macOS / Linux (sizning holat — Mac):
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Eslatma:** `winget` faqat Windows uchun. Mac’da `winget` bo‘lmaydi — yuqoridagi `curl` yoki https://rustup.rs

### 2. Windows qo'shimcha talablar
- **WebView2**: Windows 11 da built-in. Windows 10 da yo'q bo'lsa:
  https://developer.microsoft.com/en-us/microsoft-edge/webview2/

- **Visual Studio Build Tools**: C++ build tools kerak:
  https://visualstudio.microsoft.com/visual-cpp-build-tools/

### 3. macOS qo'shimcha talablar
```bash
xcode-select --install
```

---

## O'rnatish

Monorepo root'dan:
```bash
pnpm install
```

Yoki faqat desktop uchun:
```bash
cd apps/desktop
pnpm install
```

---

## Ikonka qo'shish (birinchi marta)

**Root’dan `pnpm tauri` ishlamaydi** — Tauri CLI faqat `apps/desktop` paketida.

**Muhim — `desktop:icon` da ` -- ` ishlatmang.**  
`pnpm desktop:icon -- /path` yozsangiz, ichkarida `tauri icon -- /path` bo‘lib qoladi va Tauri `unexpected argument` xatosini beradi. **Yo‘lni to‘g‘ridan-to‘g‘ri yozing:**

```bash
# Monorepo root’dan (to‘liq yo‘l — eng ishonchli):
pnpm desktop:icon /Users/siz/Downloads/logo.png
```

Nisbiy yo‘l **apps/desktop** papkasidan hisoblanadi (`pnpm --dir apps/desktop`):

```bash
pnpm desktop:icon ../frontend/public/images/sizning-logo.png
```

```bash
# apps/desktop ichida:
cd apps/desktop
pnpm icon -- ../frontend/public/images/logo.png
```

Boshqa Tauri buyruqlari — yana ` -- `siz:

```bash
pnpm desktop:tauri info
```

**`No such file or directory`:** PNG shu yo‘lda **yo‘q** (nom xato, boshqa papka, yoki fayl hali yuklanmagan). Tekshirish: `ls -la "/Users/siz/Downloads/jaclit-logo.png"`.

Bu `src-tauri/icons/` papkasiga barcha kerakli formatlarni yaratadi.

---

## Development (test qilish)

```bash
# Root’dan:
pnpm desktop:dev

# Yoki:
cd apps/desktop && pnpm dev
```

`erp.jaclit.com` ni Tauri window'da ochadi.

---

## Production Build (.exe yoki .dmg)

```bash
# Root’dan:
pnpm desktop:build

# Yoki:
cd apps/desktop && pnpm build
```

Build tugagandan so'ng installer fayl:
- **Windows**: `src-tauri/target/release/bundle/msi/Jaclit ERP_1.0.0_x64_en-US.msi`
- **Windows (NSIS)**: `src-tauri/target/release/bundle/nsis/Jaclit ERP_1.0.0_x64-setup.exe`
- **macOS**: `src-tauri/target/release/bundle/dmg/Jaclit ERP_1.0.0_x64.dmg`

`.dmg` va `.exe` fayllarni CDN, S3 yoki `clinic.jaclit.com` ostidagi `public/downloads/` ga qo‘yib, **frontend** env orqali havola bering:

- `NEXT_PUBLIC_DESKTOP_APP_MAC_URL` — macOS `.dmg` to‘liq HTTPS URL
- `NEXT_PUBLIC_DESKTOP_APP_WINDOWS_URL` — Windows installer to‘liq HTTPS URL

Shunda klinika **Dashboard**da ikkita alohida tugma ko‘rinadi (Mac / Windows).

**Docker production:** `apps/frontend/.env.production` da shu ikkala `NEXT_PUBLIC_*` ni to‘ldiring, keyin `./deploy-production.sh` orqali **clinic-frontend** image ni qayta build/push qiling (`docker-compose` dagi runtime `environment` yetmaydi — Next.js build vaqtida yoziladi).

---

## Yangilanishlar qanday ishlaydi

| Nima o'zgardi | Foydalanuvchi nima qiladi |
|---------------|--------------------------|
| UI, sahifalar, funksiyalar | **Hech narsa** — server deploy qilinganda avtomatik yangilanadi |
| App nomi, oyna o'lchami, ikonka | Yangi installer yuklab o'rnatadi |

---

## URL o'zgartirish

`src-tauri/tauri.conf.json` faylida `devUrl` va `dist/index.html` dagi redirect — masalan `https://clinic.jaclit.com` bo‘lishi kerak.
