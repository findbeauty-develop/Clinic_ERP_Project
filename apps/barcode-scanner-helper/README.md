# Barcode Scanner Helper (macOS)

Kichik macOS ilovasi: barcode scanner’dan kelgan HID input’ni **US layout** sifatida o‘qiydi, shuning uchun tizimda Hangul (yoki boshqa layout) tanlangan bo‘lsa ham barcode to‘g‘ri (inglizcha) matn sifatida olinadi.

## Qanday ishlaydi

- **IOHIDManager** orqali faqat sizning scanner’ingiz (VID 9969, PID 34817 — "HIDKeyBoard") tanlanadi.
- Scanner tugmalarini **HID usage** (keycode) darajasida o‘qiydi va **US keyboard** jadvali bo‘yicha belgiga o‘giradi.
- Enter (0x28) kelganda scan tugaydi; natija `lastBarcode` da saqlanadi va ixtiyoriy HTTP server orqali beriladi.

## Talablar

- macOS 10.15+
- Scanner USB’da ulangan (va `ioreg` da ko‘ringan "HIDKeyBoard" — VID 9969, PID 34817).

## Build va ishga tushirish

**Loyiha ildizidan** (Clinic_ERP_Project):

```bash
cd apps/barcode-scanner-helper
swift build -c release
.build/release/BarcodeScannerHelper
```

**Agar terminal allaqachon `barcode-scanner-helper` papkasida bo‘lsa** (`... %` oldida `barcode-scanner-helper` yozilgan), `cd` ishlatmasdan:

```bash
swift build -c release
.build/release/BarcodeScannerHelper
```

Ishga tushgach:

- Terminal’da `Scanned: <barcode>` chiqadi.
- **HTTP:** `GET http://127.0.0.1:38473/barcode` — JSON: `{"barcode":"<oxirgi skanerlangan matn>"}`.

## Boshqa scanner (VID/PID) ishlatish

`main.swift` ichida `scannerVendorID` va `scannerProductID` ni o‘z scanner’ingizning qiymatiga o‘zgartiring (masalan, `ioreg -r -c IOUSBDevice -l | grep -E "VendorID|ProductID|Product"` orqali topiladi).

## Frontend (veb ilova) bilan ulash

1. Helper’ni ishga tushiring (yuqoridagi kabi).
2. Veb sahifada (masalan, inbound) oxirgi barcode’ni olish uchun:
   - **Polling:** ma’lum intervalda `fetch('http://127.0.0.1:38473/barcode')` qilib JSON’dan `barcode` olish.
   - Yoki **focus/click** paytida bir marta so‘rov yuborish.

Misol (JavaScript):

```js
const res = await fetch('http://127.0.0.1:38473/barcode');
const { barcode } = await res.json();
if (barcode) {
  // input’ga yozish yoki search/product lookup
}
```

CORS: brauzer boshqa origin’dan `127.0.0.1` ga so‘rov yuborishi mumkin; agar kerak bo‘lsa, helper’ga `Access-Control-Allow-Origin` header qo‘shish mumkin.

## Ruxsatlar

Ba’zan macOS **Privacy & Security → Input Monitoring** (yoki **Accessibility**) da ilova uchun ruxsat so‘raydi. Agar scanner event’lari kelmasa, tizim sozlamalarida ruxsat bering.
