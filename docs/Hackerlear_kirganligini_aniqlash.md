1. Kimlar login qilganini ko'rish
   last -n 20
   So'nggi 20 ta login ko'rsatadi — kim, qaysi IP, qachon.

2. Muvaffaqiyatsiz login urinishlari
   sudo grep "Failed password" /var/log/auth.log | tail -20
3. Hozir kim ulangan
   who
   w
4. Shubhali faoliyat — tizimda nima o'zgardi

# So'nggi 24 soatda o'zgargan fayllar

find /etc /usr /bin /sbin -newer /tmp -type f 2>/dev/null | head -20

# Yangi user yaratilganmi

cat /etc/passwd | grep -v "nologin\|false"

# Root bo'lgan userlar

grep ":0:" /etc/passwd 5. Tarmoq ulanishlarini ko'rish

# Hozir kim ulanib turibdi

netstat -tnp 2>/dev/null | grep ESTABLISHED

# Yoki

ss -tnp | grep ESTABLISHED 6. Docker container ichiga kirishganmi
docker logs clinic-erp-backend-prod --since 1h | grep -i "login\|auth\|token\|admin" 7. Grafana Security Monitoring
https://grafana.jaclit.com → Security Monitoring dashboard

Failed Logins — noto'g'ri parol kiritishlar
Successful Logins — muvaffaqiyatli loginlar
Top IPs — qaysi IP loginlangan
Eng muhim belgilar — hacker kirgan bo'lsa:
Belgi Tekshirish
Noma'lum IP last da last -n 20
Yangi user yaratilgan cat /etc/passwd
Tun yarim kechada login last vaqtlari
Fayllar o'zgargan find buyrug'i
Noma'lum process ps aux
