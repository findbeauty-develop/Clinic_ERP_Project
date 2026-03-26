Shoshilmasdan quyidagi tartibda harakat qiling:

🚨 Hacker kirgan bo'lsa — Qadam-qadam

1. DARHOL — Begona ulanishni uzing

# Kim ulangan ko'ring

who

# Uning session'ini o'chiring (pts/1 raqamini almashtiring)

sudo pkill -9 -t pts/1 2. Internetdan uzing (vaqtincha)
AWS Console'da:

EC2 → Security Groups → Inbound rules
Barcha qoidalarni o'chiring
Faqat sizning IP'ingizni qoldiring 3. Parollarni o'zgartiring

# Ubuntu user paroli

sudo passwd ubuntu

# Docker container'larni to'xtating

cd ~/clinic-erp
docker compose -f docker-compose.prod.yml down 4. Nima qilganini tekshiring

# Oxirgi buyruqlar tarixi

sudo cat /root/.bash_history
cat ~/.bash_history

# O'zgargan fayllar

find / -newer /tmp -type f 2>/dev/null | grep -v proc | head -30

# Yangi user yaratilganmi

cat /etc/passwd | grep -v "nologin\|false" 5. .env fayllarini tekshiring

# O'zgarganmi

ls -la ~/clinic-erp/apps/backend/.env
ls -la ~/clinic-erp/apps/backend/.env.production 6. Barcha tokenlarni yangilang
Supabase → Reset database password
JWT secret key'ni yangilang
Telegram bot token'ni yangilang
AWS credentials'ni yangilang 7. Snapshot oling va tiklang
AWS Console → EC2 → Snapshots → Oxirgi clean snapshot'ga rollback

Oldindan tayyorgarlik
Hoziroq quyidagini qiling:

# Sizning IP'ingizni aniqlab olish

curl ifconfig.me
Va AWS Security Group'da faqat shu IP'ga SSH ruxsat bering — boshqa hamma IP'lar bloklansin.
