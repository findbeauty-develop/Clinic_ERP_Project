# Ikonkalar

Bu papkaga quyidagi ikonka fayllarini qo'shish kerak:

| Fayl | O'lcham |
|------|---------|
| `32x32.png` | 32×32 px |
| `128x128.png` | 128×128 px |
| `128x128@2x.png` | 256×256 px |
| `icon.icns` | macOS uchun |
| `icon.ico` | Windows uchun |

## Ikonkalarni avtomatik yaratish

Bitta katta PNG rasm (1024×1024) bo'lsa, Tauri CLI avtomatik barcha o'lchamlarni yaratadi.

**Monorepo root'dan** (` -- ` **yo‘q** — aks holda `tauri icon -- /path` xatosi):

```bash
pnpm desktop:icon /Users/siz/path/to/logo-1024x1024.png
```

**Yoki** `apps/desktop` ichida:

```bash
cd apps/desktop
pnpm icon -- ./path/to/your-logo-1024x1024.png
```

Root'da `pnpm tauri` **ishlamaydi** — CLI `@jaclit/desktop` paketida.

Bu buyruq barcha kerakli ikonkalarni `src-tauri/icons/` papkasiga avtomatik joylashtiradi.
