# Jaclit ERP — Desktop (DMG / EXE) yig‘ish va deploy qo‘llanmasi

Bu hujjat **Tauri** desktop ilovasini **macOS (.dmg)** va **Windows (.exe / .msi)** uchun qanday yig‘ish hamda foydalanuvchilarga qanday tarqatishni tushuntiradi.

---

## 1. Loyiha qanday ishlaydi (muhim)

- `apps/desktop/src-tauri/tauri.conf.json` ichida **`frontendDist`: `../dist`** — release buildda WebView birinchi navbatda `apps/desktop/dist` dagi minimal sahifani ochadi.
- `apps/desktop/dist/index.html` hozirgi holatda brauzerni **`https://clinic.jaclit.com`** ga yo‘naltiradi.
- Demak, **ko‘p o‘zgarishlar** (UI, API, bildirishnomalar) **veb saytni deploy qilish** bilan foydalanuvchiga yetadi — **har safar yangi DMG/EXE shart emas**.
- **Yangi installer** kerak bo‘ladi, agar: Rust/Tauri kodi, `tauri.conf.json`, `capabilities`, ikonka, versiya raqami yoki `dist/index.html` dagi URL o‘zgarsa.

### 1.1 Lokal sinov (har safar deploy qilmaslik)

`tauri.conf.json`dagi **`devUrl`** odatda **`https://clinic.jaclit.com`** — shuning uchun `pnpm desktop:dev` eski deploy qilingan JS ni yuklaydi.

**Lokal Next.js + Tauri** (bildirishnoma / UI ni darhol sinash):

1. **Terminal 1** (frontend, port **3001**): repoda  
   `pnpm --filter @erp/frontend dev`
2. **Terminal 2** (desktop): repoda  
   `pnpm desktop:dev:local`  
   Bu `tauri.local.conf.json` orqali WebView **`http://localhost:3001`** dan ochiladi; **`capabilities`**da `localhost` allaqachon ruxsat etilgan.
3. API: `apps/frontend/.env.local` ichida `NEXT_PUBLIC_*` larni **staging/prod API**ga qarab sozlang (yoki lokal backend ishga tushiring).

**DevTools:** `tauri dev` / `desktop:dev:local` **debug** buildda ilova ochilganda inspector avtomatik ochiladi (`debug_assertions`). Release `pnpm desktop:build` da yo‘q — sinov uchun `pnpm --dir apps/desktop exec tauri build --debug` yoki Safari **Develop** menyusi.

---

## 2. Oldindan talablar

### 2.1. Barcha platformalar

- **Node.js** + **pnpm** (loyiha `pnpm@10` ishlatadi).
- Monorepo rootda: `pnpm install`.

### 2.2. macOS (.dmg)

- **Rust**: https://rustup.rs (`curl ... | sh`).
- **Xcode Command Line Tools**: `xcode-select --install`.

### 2.3. Windows (.exe / .msi)

- **Rust** (rustup): https://rustup.rs
- **Microsoft Edge WebView2** (runtime): Windows 11 odatda bor; Windows 10 da kerak bo‘lsa:  
  https://developer.microsoft.com/microsoft-edge/webview2/
- **Visual Studio Build Tools** (C++ workload):  
  https://visualstudio.microsoft.com/visual-cpp-build-tools/

**Eslatma:** macOS dan Windows uchun **to‘g‘ridan-to‘g‘ri** `tauri build` odatda **ishlamaydi**. Windows installer olish uchun **Windows mashinasi** yoki **CI (masalan GitHub Actions `windows-latest`)** ishlatiladi.

---

## 3. Ikonka (birinchi marta yoki logo almashganda)

Monorepo **root**dan (to‘liq yo‘l yoki nisbiy yo‘l `apps/desktop` dan hisoblanadi):

```bash
pnpm desktop:icon /path/to/logo.png
```

Yoki:

```bash
cd apps/desktop
pnpm icon -- ../frontend/public/images/logo.png
```

**`pnpm desktop:icon -- /path`** yozmang — `--` Tauri CLI ni buzadi (`unexpected argument`).

Natija: `apps/desktop/src-tauri/icons/` ichida kerakli `.icns`, `.ico`, PNG lar.

---

## 4. macOS: DMG yig‘ish

1. **Kod yangi bo‘lsa**, `apps/desktop/dist/index.html` ichidagi redirect URL to‘g‘ri ekanini tekshiring (`https://clinic.jaclit.com` yoki prod domeningiz).

2. Rootdan:

   ```bash
   pnpm desktop:build
   ```

   Yoki:

   ```bash
   cd apps/desktop && pnpm build
   ```

3. **Natija** (yo‘l versiya va arxitekturaga qarab biroz farq qilishi mumkin):

   ```
   apps/desktop/src-tauri/target/release/bundle/dmg/Jaclit ERP_1.0.0_aarch64.dmg
   ```

   yoki `x64` (Intel Mac). Apple Silicon uchun odatda `aarch64`.

### 4.1. macOS: kod imzolash (ixtiyoriy, lekin tavsiya)

- Apple Developer hisobi bilan **codesign** va **notarization** — foydalanuvchilar “unknown developer” xatosini kam ko‘radi.
- Hozir `tauri.conf.json` da `certificateThumbprint: null` — bu **imzosiz** build uchun.
- Tijoriy tarqatishda Apple hujjatlariga qarang: https://tauri.app/distribute/sign/macos/

---

## 5. Windows: EXE / MSI yig‘ish

1. **Windows** terminalida (PowerShell yoki cmd) loyiha papkasini klonlab oling.

2. `pnpm install` (root).

3. Xuddi shu buyruq:

   ```bash
   pnpm desktop:build
   ```

4. **Natijalar** (taxminiy):
   - **NSIS installer**:  
     `apps/desktop/src-tauri/target/release/bundle/nsis/Jaclit ERP_1.0.0_x64-setup.exe`
   - **MSI**:  
     `apps/desktop/src-tauri/target/release/bundle/msi/Jaclit ERP_1.0.0_x64_en-US.msi`

### 5.1. Windows: kod imzolash (ixtiyoriy)

- `tauri.conf.json` → `bundle.windows.certificateThumbprint` va `timestampUrl` — tijoriy EXE uchun.
- Hujjat: https://tauri.app/distribute/sign/windows/

---

## 6. Versiyani yangilash

Bir xil raqamni ikki joyda moslang:

| Fayl                                     | Maydon              |
| ---------------------------------------- | ------------------- |
| `apps/desktop/src-tauri/tauri.conf.json` | `version`           |
| `apps/desktop/src-tauri/Cargo.toml`      | `[package] version` |

Keyin qayta `pnpm desktop:build`. Installer fayl nomidagi versiya shu raqamga yaqinlashadi.

---

## 7. Deploy: fayllarni qayerga qo‘yish

Maqsad: foydalanuvchi **HTTPS** orqali yuklab olishi va Dashboarddagi tugmalar ishlashi.

### 7.1. Variant A — klinika sayti ostida statik papka

Masalan nginx / S3 / CloudFront:

- `https://clinic.jaclit.com/downloads/Jaclit-ERP-1.0.0-aarch64.dmg`
- `https://clinic.jaclit.com/downloads/Jaclit-ERP-1.0.0-x64-setup.exe`

Fayllarni serverga yuklang, **Content-Type** va **Content-Disposition** sozlamalari yuklab olish uchun mos bo‘lsin.

### 7.2. Variant B — object storage (S3, R2, va hokazo)

- Public URL oling (doimiy HTTPS).
- Quyidagi env larda shu URL larni yozing.

---

## 8. Frontend env: Dashboard tugmalari

`apps/frontend/.env.production` (yoki build vaqtida inject qilinadigan o‘zgaruvchilar):

```env
NEXT_PUBLIC_DESKTOP_APP_MAC_URL=https://clinic.jaclit.com/downloads/Jaclit-ERP-1.0.0-aarch64.dmg
NEXT_PUBLIC_DESKTOP_APP_WINDOWS_URL=https://clinic.jaclit.com/downloads/Jaclit-ERP-1.0.0-x64-setup.exe
```

**Muhim:** Next.js da `NEXT_PUBLIC_*` **build vaqtida** “yopishtiriladi”. URL o‘zgarganda **frontend image / build**ni qayta yig‘ishingiz kerak (masalan `deploy-production.sh` orqali `clinic-frontend`).

Bo‘sh qoldirsangiz Dashboarddagi yuklab olish tugmalari “준비 중” ko‘rinishi mumkin.

---

## 9. Tekshiruv ro‘yxati (release oldidan)

- [ ] `clinic.jaclit.com` (yoki prod URL) ochiladi va login ishlaydi.
- [ ] `apps/desktop/dist/index.html` dagi redirect shu prod URL ga yo‘naltiradi.
- [ ] `capabilities/default.json` dagi `remote.urls` prod domenni qamrab oladi.
- [ ] macOS: ilovani ochib, tray va (kerak bo‘lsa) test bildirishnomani tekshiring.
- [ ] Windows: WebView2 o‘rnatilgan oddiy mashinada EXE ni sinab ko‘ring.
- [ ] Yuklab olish URL lari brauzerda 200 qaytaradi va fayl to‘liq yuklanadi.

---

## 10. Qisqa xulosa

| Savol                                                  | Javob                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| Har kuni develop qilsam, har deployda DMG/EXE kerakmi? | **Yo‘q** — asosan veb + API deploy yetadi.                              |
| Qachon qayta yig‘aman?                                 | Tauri/Rust, capabilities, ikonka, `dist` redirect, versiya o‘zgarganda. |
| Mac da Windows EXE olamanmi?                           | Odatda **yo‘q** — Windows da yoki CI da yig‘ing.                        |
| DMG qayerda?                                           | `src-tauri/target/release/bundle/dmg/`                                  |
| EXE qayerda?                                           | `src-tauri/target/release/bundle/nsis/` (yoki `msi/`)                   |

Qo‘shimcha qisqa eslatmalar `apps/desktop/README.md` faylida ham bor.

Ha, haqiqiy path shu ekan.

Lekin bu nomdagi rw.64295. qismi vaqtinchalik yoki generator qo‘shgan prefixga o‘xshaydi. Uni shu holatda ham yuborsa bo‘ladi.
ls "apps/desktop/src-tauri/target/release/bundle/dmg/"

scp -i ~/.ssh/seoul-clinic.pem \
 "apps/desktop/src-tauri/target/release/bundle/dmg/Jaclit ERP_1.0.0_aarch64.dmg" \
 ubuntu@13.209.40.48:/tmp/

sudo mv -f "/tmp/Jaclit ERP_1.0.0_aarch64.dmg" /var/www/clinic/downloads/Jaclit-ERP-1.0.0-aarch64.dmg
sudo chmod 644 /var/www/clinic/downloads/Jaclit-ERP-1.0.0-aarch64.dmg
sudo chown www-data:www-data /var/www/clinic/downloads/Jaclit-ERP-1.0.0-aarch64.dmg

curl -I https://clinic.jaclit.com/downloads/Jaclit-ERP-1.0.0-aarch64.dmg

xattr -cr /Applications/"Jaclit ERP.app"
