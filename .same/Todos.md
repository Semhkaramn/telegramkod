# Telegram Bot Admin Panel - Proje Analizi ve Yapılacaklar

## 📊 MEVCUT DURUM ANALİZİ

### ✅ TAMAMLANMIŞ KISIMLAR

#### Veritabanı (Prisma)
- [x] Prisma schema tanımlanmış
- [x] User, Channel, UserChannel, ListeningChannel modelleri
- [x] AdminLink, ChannelStats, SentCode modelleri
- [x] Keyword, BannedWord modelleri
- [x] Seed dosyası (admin/admin123)

#### Auth Sistemi
- [x] JWT tabanlı authentication
- [x] Login/Logout API routes
- [x] Session yönetimi (7 gün)
- [x] Password hashing (bcrypt)
- [x] Middleware route protection
- [x] Impersonation fonksiyonları (auth.ts'de mevcut ama UI yok)

#### Admin Paneli Sayfaları
- [x] /admin - Dashboard (istatistikler)
- [x] /admin/users - Kullanıcı listesi, ekleme, düzenleme, silme
- [x] /admin/channels - Kanal yönetimi, kullanıcı atama
- [x] /admin/listening - Dinleme kanalları yönetimi
- [x] /admin/keywords - Anahtar kelimeler ve yasak kelimeler

#### API Routes
- [x] /api/auth/login, /api/auth/logout, /api/auth/me
- [x] /api/users (GET, POST), /api/users/[id] (GET, PATCH, DELETE)
- [x] /api/channels (GET, POST, PATCH, DELETE)
- [x] /api/listening-channels (GET, POST, PATCH, DELETE)
- [x] /api/keywords, /api/banned-words
- [x] /api/admin-links
- [x] /api/stats

#### UI Components
- [x] Button, Input, Card, Dialog, Badge
- [x] Skeleton, Switch, Tabs, Textarea
- [x] Admin Sidebar

#### Bot Dosyaları (uploads/lykibomkod-main/)
- [x] bot.py - Tam özellikli bot (dinleme + komutlar)
- [x] forwarder.py - Sadece dinleme yapan hafif versiyon
- [x] requirements.txt, Procfile, runtime.txt

---

### ❌ EKSİK KISIMLAR

#### Dashboard (Kullanıcı) Paneli
- [ ] /dashboard - Ana dashboard sayfası
- [ ] /dashboard/channels - Kullanıcının atanmış kanalları
- [ ] /dashboard/links - Link özelleştirme sayfası
- [ ] /dashboard/stats - Kendi istatistikleri
- [ ] /dashboard/settings - Şifre değiştirme

#### Admin Ek Sayfalar
- [ ] /admin/users/[id]/view - Kullanıcının panelini görüntüleme
- [ ] /admin/stats - Detaylı istatistik sayfası (grafikler)

#### API Routes
- [ ] /api/user-channels - Kullanıcı-kanal ilişkisi API (fonksiyonlar var, route yok!)
- [ ] /api/impersonate - Kullanıcı olarak giriş yapma

#### Bot Entegrasyonu
- [ ] Bot dosyalarını projeye taşıma (/bot klasörüne)
- [ ] Bot'u sadece dinleme moduna çevirme (Telegram komutları kaldırılacak)
- [ ] Prisma uyumlu veritabanı sorguları

---

## 📋 DETAYLI YAPILACAKLAR LİSTESİ

### FAZI 1: Kritik Eksikler (API ve Dashboard)

#### 1.1 User-Channels API Oluşturma
```
/api/user-channels
├── GET  - Kullanıcının kanallarını getir
├── POST - Kullanıcıya kanal ata
└── DELETE - Kullanıcıdan kanal kaldır
```
- [ ] Route dosyasını oluştur
- [ ] Session bazlı yetkilendirme ekle
- [ ] Superadmin tüm işlemleri yapabilsin
- [ ] Normal kullanıcı sadece kendi kanallarını görsün

#### 1.2 Dashboard Layout ve Sayfalar
- [ ] /src/app/dashboard/layout.tsx oluştur
- [ ] Dashboard sidebar component oluştur
- [ ] Loading ve error state'leri

##### 1.2.1 Dashboard Ana Sayfa (/dashboard)
- [ ] Kullanıcının kanallarını göster
- [ ] Bugün/Hafta/Ay gönderilen kod sayısı
- [ ] Bot durumu (aktif/durdurulmuş kanallar)

##### 1.2.2 Kanallarım (/dashboard/channels)
- [ ] Atanan kanalları listele
- [ ] Kanal durumu değiştirme (durdur/başlat)
- [ ] Kanal istatistikleri

##### 1.2.3 Link Özelleştirme (/dashboard/links)
- [ ] Kanal seçimi (dropdown)
- [ ] Link kodu + URL ekleme formu
- [ ] Mevcut linkleri görme/düzenleme/silme
- [ ] Toplu link ekleme (textarea ile)

##### 1.2.4 İstatistiklerim (/dashboard/stats)
- [ ] Kendi kanallarının istatistikleri
- [ ] Günlük/Haftalık/Aylık görünüm
- [ ] Kod listesi (son gönderilen kodlar)

##### 1.2.5 Ayarlar (/dashboard/settings)
- [ ] Şifre değiştirme formu
- [ ] Profil bilgileri güncelleme

### FAZ 2: Admin Panel Geliştirmeleri

#### 2.1 Kullanıcı Paneli Görüntüleme
- [ ] /admin/users/[id]/view sayfası oluştur
- [ ] Impersonation sistemi aktifleştir
- [ ] "Paneli Görüntüle" butonu ekle
- [ ] Üst banner: "X kullanıcısı olarak görüntülüyorsunuz"
- [ ] "Kendi Panelime Dön" butonu

#### 2.2 Admin İstatistik Sayfası
- [ ] /admin/stats sayfası oluştur
- [ ] Grafik/Chart gösterimi (recharts veya chart.js)
- [ ] Kanal bazlı istatistikler
- [ ] Kullanıcı bazlı istatistikler
- [ ] Tarih aralığı seçimi

#### 2.3 Kullanıcı Listesi İyileştirme
- [ ] "Paneli Görüntüle" butonu
- [ ] Kanal atama butonu (direk users sayfasından)
- [ ] Arama/filtreleme

### FAZ 3: Bot Entegrasyonu

#### 3.1 Bot Dosyalarını Projeye Taşıma
- [ ] /bot klasörü oluştur
- [ ] bot.py ve forwarder.py kopyala
- [ ] requirements.txt, Procfile, runtime.txt

#### 3.2 Bot'u Sadece Dinleme Moduna Çevirme
```python
# KALDIRILACAK: Tüm @client.on(events.NewMessage()) komut işleyicileri
# KALACAK: Sadece dinleme ve kod gönderme fonksiyonları
```
- [ ] Telegram komutlarını kaldır (ekle, çıkar, yardım, vb.)
- [ ] Soru-cevap state yönetimini kaldır
- [ ] Sadece process_old_format ve send_to_all_channels kalsın
- [ ] Kelime dinleme sistemi kalsın

#### 3.3 Veritabanı Uyumluluğu
Bot'un mevcut SQL sorguları Prisma schema'sıyla uyumlu olmalı:
- [ ] channels tablosu -> Channel modeli
- [ ] channel_admins -> UserChannel modeli
- [ ] admin_links -> AdminLink modeli
- [ ] listening_channels -> ListeningChannel modeli
- [ ] keywords, banned_words -> Keyword, BannedWord modelleri
- [ ] sent_codes, channel_stats, joined_channels

### FAZ 4: UI/UX İyileştirmeleri

#### 4.1 Eksik UI Components
- [ ] Toast notifications (sonner veya react-hot-toast)
- [ ] Dropdown Menu
- [ ] Select component
- [ ] Label component
- [ ] Separator
- [ ] Avatar
- [ ] Scroll Area
- [ ] Alert Dialog (onay dialogları için)

#### 4.2 Genel İyileştirmeler
- [ ] Responsive tasarım kontrolü
- [ ] Loading states tüm sayfalarda
- [ ] Error handling iyileştirme
- [ ] Confirmation dialogs (silme işlemleri)
- [ ] Breadcrumbs
- [ ] Search/Filter fonksiyonları

### FAZ 5: Deployment Hazırlıkları

#### 5.1 Netlify (Web Panel)
- [ ] netlify.toml kontrol et (bun kullan)
- [ ] Environment variables tanımla:
  - DATABASE_URL
  - JWT_SECRET
- [ ] Build command: `prisma generate && next build`

#### 5.2 Heroku (Bot)
- [ ] /bot klasörü yapısını kontrol et
- [ ] Procfile: `worker: python bot.py`
- [ ] runtime.txt: `python-3.11.x`
- [ ] Environment variables:
  - DATABASE_URL (aynı Neon DB)
  - API_ID, API_HASH
  - SESSION_STRING

#### 5.3 GitHub Yapısı
```
/
├── src/                 # Next.js web panel
├── prisma/              # Prisma schema
├── bot/                 # Python bot
│   ├── bot.py          # Ana bot (sadece dinleme)
│   ├── requirements.txt
│   ├── Procfile
│   └── runtime.txt
├── package.json
├── netlify.toml
└── README.md
```

### FAZ 6: Güvenlik

- [ ] API rate limiting
- [ ] Input validation (tüm formlar)
- [ ] CORS ayarları
- [ ] Environment variables kontrolü

---

## 🔄 İŞ AKIŞI (Hatırlatma)

### Süper Admin İş Akışı:
1. `/login` -> Süper admin şifresiyle giriş
2. `/admin` -> Dashboard (genel bakış)
3. `/admin/users` -> Kullanıcı listesi
4. Kullanıcıya tıkla -> `/admin/users/[id]/view` -> Kullanıcının panelini gör
5. Düzenleme yap -> Kaydet
6. Yeni kullanıcı ekle -> Kanal ata

### Normal Kullanıcı İş Akışı:
1. `/login` -> Kendi şifresiyle giriş
2. `/dashboard` -> Kendi dashboard'u
3. `/dashboard/channels` -> Atanan kanalları yönet
4. `/dashboard/links` -> Link özelleştirmeleri
5. Durum değiştir, link ekle/sil

### Bot İş Akışı (Heroku):
1. Dinleme kanallarından mesaj al
2. Kod formatını kontrol et (kelime+kod+link veya kod+link)
3. Yasak kelime kontrolü
4. Veritabanından aktif kanalları çek
5. Her kanal için admin'in link özelleştirmesini kontrol et
6. Kodu uygun linkle tüm aktif kanallara gönder
7. İstatistik kaydet
8. **HİÇBİR TELEGRAM KOMUTU YOK - Tüm yönetim web panelden**

---

## 🚀 BAŞLANGIÇ SIRASI

1. [x] Projeyi analiz et
2. [ ] **Şu an: user-channels API route oluştur**
3. [ ] Dashboard layout ve sidebar oluştur
4. [ ] Dashboard ana sayfa
5. [ ] Dashboard kanallarım sayfası
6. [ ] Dashboard link özelleştirme sayfası
7. [ ] Admin kullanıcı paneli görüntüleme
8. [ ] Bot dosyalarını projeye taşı ve düzenle
9. [ ] Test et
10. [ ] Deploy et

---

## 📝 NOTLAR

- **ÖNEMLİ:** Telegram botu sadece kod dinleme/gönderme yapacak
- **ÖNEMLİ:** Tüm yönetim web panelden olacak (hiç Telegram komutu yok)
- Süper admin diğer kullanıcıların panelini görebilecek
- Her kullanıcı sadece kendi kanallarını yönetebilecek
- Ortak veritabanı kullanılacak (Neon Tech PostgreSQL)
- Mevcut bot.py'deki SQL sorguları Prisma schema ile uyumlu
