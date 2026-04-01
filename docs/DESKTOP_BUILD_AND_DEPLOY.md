# Jaclit ERP — Desktop (DMG / EXE) yig‘ish va deploy qo‘llanmasi

Bu hujjat **Tauri** desktop ilovasini **macOS (.dmg)** va **Windows (.exe / .msi)** uchun qanday yig‘ish hamda foydalanuvchilarga qanday tarqatishni tushuntiradi.

---

## 1. Loyiha qanday ishlaydi (muhim)

- `apps/desktop/src-tauri/tauri.conf.json` ichida **`frontendDist`: `../dist`** — release buildda WebView birinchi navbatda `apps/desktop/dist` dagi minimal **qobiq** (`index.html`) ni ochadi.
- Bu qobiq **to‘liq redirect qilmaydi**: asosiy hujjat **Tauri asset** manbasi (`tauri://localhost` / macOS) da qoladi, **`https://clinic.jaclit.com`** esa **to‘liq o‘lchamli iframe** ichida yuklanadi. Sabab: macOS WebKit **HTTPS** sahifadan `ipc://localhost` ga `fetch` ni _mixed content_ sifatida bloklaydi — shu bois `invoke()` (jumladan native bildirishnoma) ishlamay qolardi.
- Iframe ichidagi frontend `?jaclit_desktop_shell=1` va `postMessage` orqali faqat **`show_native_notification`** ni parent freymga proksi qiladi (`apps/frontend/lib/tauri-desktop-notification.ts`).
- **Auth:** iframe “uchinchi tomon” kontekstida `api.*` ga **refresh cookie** ko‘pincha yuborilmaydi. Shuning uchun login so‘rovida `X-Jaclit-Desktop-Shell: 1` yuboriladi, backend **`refresh_token`** ni JSON da qaytaradi, frontend **`sessionStorage`** da saqlaydi va `/iam/members/refresh` + logout da **`X-Refresh-Token`** ishlatadi. **Frontend va backend** ikkalasi ham yangilangan bo‘lishi kerak (deploy).
- **Ko‘p UI/API o‘zgarishlari** hali ham **saytni deploy qilish** bilan yetadi — **har safar yangi DMG shart emas**, lekin **shell / bridge** o‘zgarganda yoki yangi `invoke` kerak bo‘lsa — `dist/index.html` yoki Rust tarafni yangilab qayta yig‘ish kerak.
- **Yangi installer** kerak bo‘ladi, agar: Rust/Tauri kodi, `tauri.conf.json`, `capabilities`, ikonka, versiya raqami yoki `dist/index.html` dagi iframe URL / bridge mantiqi o‘zgarsa.

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

### 1.2 `Refused to display … in a frame` / `X-Frame-Options: SAMEORIGIN`

Brauzer yoki Tauri konsoli shunday xato bersa, javob sarlavhasida **`X-Frame-Options: SAMEORIGIN`** (yoki `DENY`) bor — bu **iframe ichida** clinic sahifasini ochishni taqiqlaydi.

**Nima qilish kerak**

1. **Nginx** (yoki boshqa reverse proxy) da **clinic frontend** `server` bloki uchun `add_header X-Frame-Options …` qatorini **o‘chirib tashlang** yoki umuman qo‘ymang. To‘g‘ri namuna: `docs/NGINX_HTTPS_SETUP_GUIDE.md` → bo‘lim 5.2 (clinic) — u yerda bu sarlavha izoh bilan o‘chirilgan.
2. Global `snippets` / `conf.d` da ham `X-Frame-Options` clinic ga tushmasin — kerak bo‘lsa faqat API domenlari uchun alohida qoldiring.
3. Deploy qilingan **Next.js** `Content-Security-Policy` ichida `frame-ancestors` bor (`apps/frontend/next.config.js`) — u Tauri manbalariga ruxsat beradi; lekin **X-Frame-Options hali ham bo‘lsa**, ayrim brauzerlar iframe ni baribir bloklaydi.

Tekshirish:

```bash
curl -sI https://clinic.jaclit.com | grep -iE 'x-frame|content-security-policy'
```

`X-Frame-Options` chiqmasligi yaxshi; CSP da `frame-ancestors` bo‘lsa yetarli (clickjacking uchun aniqroq nazorat).

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

1. **Kod yangi bo‘lsa**, `apps/desktop/dist/index.html` ichidagi **iframe `src`** prod domeningiz bilan mos ekanini tekshiring (`https://clinic.jaclit.com/...`). Native bildirishnoma bridge'i **deploy qilingan** frontenddagi `tauri-desktop-notification.ts` bilan ishlaydi — avvalo saytni yangilang, keyin DMG ni sinang.

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
- [ ] `apps/desktop/dist/index.html` dagi **iframe `src`** prod URL bilan mos (`https://clinic…/?jaclit_desktop_shell=1`); **to‘liq redirect** ishlatilmaydi.
- [ ] Nginx da clinic uchun **`X-Frame-Options` yo‘q** (§1.2).
- [ ] `capabilities/default.json` dagi `remote.urls` prod domenni qamrab oladi.
- [ ] macOS: tray **“Test notification”** va (ixtiyoriy) §11 dagi `jaclitDebugShellInvoke()`.
- [ ] Windows: WebView2 o‘rnatilgan oddiy mashinada EXE ni sinab ko‘ring.
- [ ] Yuklab olish URL lari brauzerda 200 qaytaradi va fayl to‘liq yuklanadi.

---

## 10. Qisqa xulosa

| Savol                                                  | Javob                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| Har kuni develop qilsam, har deployda DMG/EXE kerakmi? | **Yo‘q** — asosan veb + API deploy yetadi.                              |
| Qachon qayta yig‘aman?                                 | Tauri/Rust, capabilities, ikonka, **`dist` shell (iframe)**, versiya o‘zgarganda. |
| Mac da Windows EXE olamanmi?                           | Odatda **yo‘q** — Windows da yoki CI da yig‘ing.                        |
| DMG qayerda?                                           | `src-tauri/target/release/bundle/dmg/`                                  |
| EXE qayerda?                                           | `src-tauri/target/release/bundle/nsis/` (yoki `msi/`)                   |

Qo‘shimcha qisqa eslatmalar `apps/desktop/README.md` faylida ham bor.

---

## 11. Debug: OS toast qayerda sindi?

Loyiha **`tauri-plugin-notification` ishlatmaydi** — bildirishnoma **`show_native_notification`** + macOS da `osascript` (`macos_notify.rs`). Tray menyudagi **“Test notification”** to‘g‘ridan-to‘g‘ri shu yo‘lni sinaydi (**invoke emas**).

| Qadam | Nima qilish | Natija |
| ----- | ----------- | ------ |
| 1 | Tray → **Test notification** | Chiqsa: Rust / macOS yo‘li taxminan OK. Chiqmasa: **System Settings → Notifications → Jaclit ERP**, yoki `osascript` xatosi. |
| 2 | Safari **Develop** → ilova → **yuqori** hujjat (shell) ni tanlang; konsolda: `jaclitDebugShellInvoke()` | `apps/desktop/dist/index.html` da qo‘yilgan; **`title`/`body` beriladi**. OK bo‘lsa: Tauri **IPC shell** da ishlaydi; muammo **iframe / clinic JS** tomonda. |
| 3 | Clinic (iframe) konsolida socket / `[Jaclit notify]` loglari | Bridge yoki auth (`X-Refresh-Token` / deploy mosligi) — batafsil §1 va frontend `tauri-desktop-notification.ts`. |
| 4 | API refresh | `POST` **`https://api…/iam/members/refresh`** (nisbiy `/iam/...` emas), `credentials: "include"`; iframe da cookie bo‘lmasa header oqimi kerak (§1). |

**Eslatma:** `invoke("show_native_notification")` **argsiz** chaqirilmasin — doim `{ title, body }` bering (shell helper ham shuni qiladi).

### DMG ni serverga qo‘yish (misol)

```bash
# Mac’da build qilingan DMG yo‘lini tekshiring:
ls "apps/desktop/src-tauri/target/release/bundle/dmg/"

# Serverga nusxa (SSH kalit va host o‘zingizniki):
# scp -i ~/.ssh/key.pem "…/Jaclit ERP_1.0.0_aarch64.dmg" ubuntu@HOST:/tmp/
# sudo mv /tmp/….dmg /var/www/…/downloads/Jaclit-ERP-1.0.0-aarch64.dmg
# sudo chmod 644 … && sudo chown www-data:www-data …

curl -I https://clinic.jaclit.com/downloads/Jaclit-ERP-1.0.0-aarch64.dmg
```

Gatekeeper: `xattr -cr /Applications/"Jaclit ERP.app"` (faqat lokal testda kerak bo‘lishi mumkin).
