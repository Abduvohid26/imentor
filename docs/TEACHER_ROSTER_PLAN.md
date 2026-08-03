# O'qituvchilar ro'yxati, dars jadvali va jonli monitoring — reja

**Sana:** 2026-08-02
**Manba fayl:** `data/Mart 2026.docx`
**Bog'liq oldingi ish:** `onlinetest/OnlineTest/docs/KAFEDRA_HIERARCHY_PLAN.md` (Kafedra→Yo'nalish→Guruh→Talaba)

---

## 1. Manba fayl tahlili (tugallangan)

`data/Mart 2026.docx` — **bu dars jadvali EMAS**, balki butun institutning **xodimlar
ro'yxati** (bitta jadval, 792 qator, 6 ustun: `№, F.I.Sh (x2 takror), LAVOZIMI,
Tug'ilgan yili`). Bo'limlar jadval ichida sarlavha-qator sifatida keladi
(masalan `"14 ta\tAKUSHERLIK VA GINEKOLOGIYA"`).

**55 ta bo'lim** bor, ulardan:
- **Boshida (1-132-qatorlar)**: Rahbariyat, Kadrlar bo'limi, Xisobxona, Devonxona,
  Reja moliya, Ta'lim sifati nazorati, Ma'naviyat-ma'rifat, va h.k. — **ma'muriy**,
  o'qituvchi emas.
- **O'rtada (133-687-qatorlar)**: **46 ta kafedra** — nomlari OnlineTest'ga
  sinxronlangan kafedralar bilan mos keladi (masalan "AKUSHERLIK VA GINEKOLOGIYA",
  "NORMAL ANATOMIYA", "STOMATOLOGIYA VA OTORINOLARINGOLOGIYA"). **Shu oraliq —
  import qilinadigan manba.**
- **Oxirida (688-792-qatorlar)**: Malaka oshirish fakulteti, 1/2/3-TTJ,
  "Asosiy bino xodimlari", "2-bino AXO xodimlari", "Vivariy" — yana ma'muriy/
  texnik xodimlar, import qilinmaydi.

### Lavozimlar (133-687 oralig'ida, 516 ta xodim qatori) — juda nostandart yozilgan

Eng ko'p uchraydiganlari (imloviy variantlar bilan):

| Guruh | Variantlar | Qaror |
|---|---|---|
| Assistent | Assistent, assistent, Assistant, Assisten, assist | ✅ o'qituvchi |
| Stajyor-o'qituvchi | Stajyor-o'qituvchi, Stajyor o'qituvchi, O'qituvchi-stajyor, O'qituvchi stajor, Stajor o'qituvchi, va h.k. (10+ yozilish varianti) | ✅ o'qituvchi |
| Katta o'qituvchi | Katta o'qituvchi, katta o'qituvchi | ✅ o'qituvchi |
| O'qituvchi | O'qituvchi, o'qituvchi | ✅ o'qituvchi |
| Dotsent | Dotsent, dotsent, v.v.dotsent, v/b/Dotsent, v.v.b. dotsent | ✅ o'qituvchi |
| Kafedra mudiri | Kafedra mudiri, Kafedra mudiri, k/o' | ✅ o'qituvchi (odatda dars ham beradi) |
| Dekan / Dekan o'rinbosari | Dekan, Dekan o'rinbosari, Dekan,v.v.dotsent | ⚠️ ko'pincha dotsent bilan birga — ✅ o'qituvchi deb hisoblanadi |
| Tyutor | Tyutor (31 ta!) | ❌ **o'qituvchi emas** (guruh murabbiysi/maslahatchi, dars bermaydi) |
| Kabinet mudiri | Kabinet mudiri, kabinet mudiri | ❌ texnik xodim |
| Laborant / Laboratoriya mudiri | Laborant, Laboratoriya mudiri, Lab.mud., Labor mudiri, Loboarant | ❌ texnik xodim |
| Kotiba / Ish yurituvchi | Kotiba-ish yurituvchi, Ish yurituvchi | ❌ ma'muriy xodim |

**Qaror (foydalanuvchi tasdiqladi)**: Kafedra mudiri, Professor, Dotsent, Katta
o'qituvchi, O'qituvchi, Assistent, Stajyor-o'qituvchi — **o'qituvchi** hisoblanadi.
Kabinet mudiri, Laborant/Laboratoriya mudiri, Kotiba/Ish yurituvchi, **Tyutor** —
**o'qituvchi emas**, import qilinmaydi.

⚠️ **Muhim**: bu lug'at imloviy xatolarga chidamli bo'lishi kerak — oddiy
`in` solishtirish yetarli emas (masalan "Assisten" so'zidagi typo). Buyruqda
**normallashtirish** (kichik harf, apostrof/tire birxillashtirish, unicode
normalize) + **kalit so'z asosida (regex/substring) moslashtirish** ishlatiladi,
va **noaniq qolgan lavozimlar** (hech qaysi ro'yxatga to'liq mos kelmagan)
alohida "QO'LDA TEKSHIRISH KERAK" ro'yxatiga chiqariladi — avtomatik
noto'g'ri tasniflanmasin.

---

## 2. Bosqich A — `import_teachers_from_docx` buyrug'i (iMentor)

**Maqsad**: `data/Mart 2026.docx` dan 133-687 oraliqdagi (46 kafedra) xodimlarni
o'qib, yuqoridagi lavozim filtri bo'yicha **faqat o'qituvchilarni** ajratib,
iMentor'ning `StaffProfile` (yoki mos keladigan xodim modeli — aniq model nomi
tekshirilishi kerak, ehtimol `AppUser`/`Teacher` ekvivalenti) ga yozadi.

### Amalga oshirish tafsilotlari

1. **Fayldan o'qish**: `python-docx` bilan jadvalni parse qilish (yuqoridagi
   tahlil kodiga o'xshab) — bo'lim sarlavha qatorlarini (`cells[0]` bo'sh
   bo'lmagan qatorlar) aniqlab, har bir xodimni shu oxirgi ko'rilgan bo'lim
   nomiga bog'lash.
2. **Bo'lim oralig'ini cheklash**: faqat 133–687 qatorlar (yoki qator raqami
   emas, "DAVOLASH ISHI DEKANAT" dan "MALAKA OSHIRISH..." gacha bo'lgan
   bo'limlar nomi bo'yicha, qator raqami emas — fayl versiyasi o'zgarsa ham
   ishlashi uchun ancha barqaror).
3. **Kafedra nomini AcademicDepartment bilan moslashtirish**: bo'lim sarlavhasi
   (masalan "AKUSHERLIK VA GINEKOLOGIYA") allaqachon sinxronlangan
   `AcademicDepartment.name` bilan (masalan "Akusherlik va ginekologiya")
   **katta-kichik harfga sezgir emas** solishtiriladi. Mos kelmasa — xodim
   baribir yaratiladi, faqat kafedrasiz (keyin qo'lda bog'lanadi), va
   natijada "mos kelmagan bo'lim nomlari" ro'yxatida ko'rsatiladi.
4. **Login/parol** (foydalanuvchi tasdiqladi — vaqtinchalik placeholder):
   - Telefon: `998900000XXX` shaklida, ketma-ket avtomatik generatsiya
     (mavjud raqamlar bilan to'qnashmasligini tekshirib).
   - Parol: standart placeholder (masalan `TeacherTemp2026!`), yoki
     `DEMO_ADMIN_PASSWORD` uslubidagi konventsiya — **sessiya boshida aniq
     qaror qilinadi**.
   - **F.I.Sh** ni ism/familiya/otasining ismiga bo'lish kerak bo'ladi
     (`split_person_name()` funksiyasi allaqachon `online_test_client.py`da
     bor, xuddi shu logikadan foydalanish mumkin).
5. **Dublikat nazorati**: bir xil F.I.Sh + kafedra kombinatsiyasi ikkinchi
   marta import qilinsa — yangilanadi (idempotent), qayta yaratilmaydi.
6. **Buyruq interfeysi** (loyihadagi boshqa buyruqlar bilan bir xil naqsh):
   ```
   python manage.py import_teachers_from_docx --file "data/Mart 2026.docx"
   python manage.py import_teachers_from_docx --file "data/Mart 2026.docx" --apply
   ```
   Dry-run default, natija oxirida: yaratilgan/yangilangan/noaniq-lavozim/
   mos-kelmagan-kafedra sonlari va ro'yxatlari.

### Ochiq savol (sessiya boshida hal qilinadi)
- iMentor'da xodim (`StaffProfile`) yaratish uchun aniq qaysi model/serializer
  ishlatiladi — `AdminStaffUpsertSerializer` (`backend/core/serializers.py`)
  orqalimi, yoki to'g'ridan-to'g'ri modelmi? Buni sessiya boshida tekshirib,
  mavjud "xodim qo'shish" API/oqimidan foydalanish kerak (ikki xil yo'l
  bo'lmasligi uchun).

---

## 3. Bosqich B — O'qituvchilar boshqaruvi + dars jadvali UI

**Muhim topilma**: iMentor'da **dars jadvali (geofencing uchun) allaqachon
mavjud** — `StaffScheduleSlot` modeli va `AdminStaffLocationConsole.tsx`
("Hodimlar joylashuvi" sahifasi, "Dars jadvali" tab) orqali. Bu docx fayl esa
jadval (vaqt/xona) ma'lumotini **umuman bermaydi** — faqat F.I.Sh/lavozim/
kafedra. Ya'ni:

- **Bosqich A** — o'qituvchilarni tizimga kiritadi (kim bor, qaysi kafedrada).
- **Dars jadvalining o'zi (vaqt, xona)** — bu **qo'lda** to'ldiriladi, mavjud
  "Hodimlar joylashuvi → Dars jadvali" UI orqali (bu funksiya allaqachon
  ishlaydi, alohida qurish shart emas).

### Bu bosqichda qilinadigan ish
- [ ] Import qilingan o'qituvchilar `AdminStaffLocationConsole`dagi "Hodimni
  tanlang" ro'yxatida to'g'ri ko'rinishini tekshirish (chunki ro'yxat
  `fetchStaffDirectory()` orqali keladi — role='hodim' filtri bilan; import
  qilingan o'qituvchilar shu rolga to'g'ri kelishini tasdiqlash kerak).
- [ ] Agar xohlansa: kafedra bo'yicha filtr/guruhlash (hozir faqat tekis
  ro'yxat) — o'qituvchi ko'p bo'lgani uchun (500+) qidiruv/filtr foydali
  bo'lishi mumkin.
- [ ] **Pagination** — bu ro'yxat ham (OnlineTest'da bugun qilingan ishga
  o'xshab) 500+ element bo'lishi mumkin, xuddi shunday `usePagedList`/
  `AdminPagination` naqshi qo'llanilishi kerak (agar iMentor'da bunday
  komponent hali yo'q bo'lsa, OnlineTest'dagi patterndan ilhomlanib yozish
  mumkin).

---

## 4. Bosqich C — "Katta ekran" jonli monitoring bo'limi

**G'oya**: admin panelda alohida bo'lim — hozir qancha o'qituvchi dars
o'tyapti, qancha o'qituvchi jadvalda bor-u lekin yo'q — kino-ekran kabi,
bir qarashda tushunarli katta vizual taxta.

**Qaror (foydalanuvchi tasdiqladi)**: mantiq — **Dars jadvali (vaqt) + GPS
joylashuv solishtirilib**: jadvalda hozir shu vaqt oralig'ida darsi bor, lekin
GPS binoda emas → "YO'Q" deb ko'rsatiladi. Bu allaqachon mavjud ma'lumotlarga
tayanadi:
- `StaffScheduleSlot` — kimning hozir darsi bor.
- `StaffLocationPing` — oxirgi GPS joylashuv.
- `StaffLocationAlert` — allaqachon "jadvalda bor-u joyida yo'q" holatini
  aniqlaydigan mexanizm bor (`location_policy.py`).

Ya'ni **yangi ma'lumot modeli deyarli kerak emas** — bu asosan **yangi
frontend sahifa + backend agregatsiya endpoint** (real vaqtda: "hozir necha
kishi darsda", "necha kishi yo'q", ro'yxat bilan).

### Taxminiy ishlar ro'yxati
- [ ] Backend: `GET /api/admin/live-teaching-status/` (yoki shunga o'xshash) —
  hozirgi vaqtga mos `StaffScheduleSlot`larni topib, har biri uchun eng oxirgi
  `StaffLocationPing`ni tekshirib, bino radiusida/emasligini hisoblaydi.
  Javob: `{ jami_darsda: N, joyida: N, joyida_emas: N, royxat: [...] }`.
- [ ] Frontend: yangi katta, soddalashtirilgan sahifa (masalan
  `AdminLiveTeachingBoard.tsx`) — katta raqamlar, rang kodlash (yashil=joyida,
  qizil=yo'q), avtomatik yangilanish (masalan har 15-30 soniyada polling,
  `AdminStaffLiveMapPanel.tsx`dagi mavjud pattern'ga o'xshab).
  - Dizayn: "kino ekran" — katta shrift, kam matn, uzoqdan ham o'qiladigan.
- [ ] Menyuga yangi bo'lim qo'shish.

### Ochiq savollar (keyingi sessiyada aniqlanadi)
- Yangilanish chastotasi (real-time WebSocket kerakmi, yoki oddiy polling
  yetarlimi)?
- Faqat joriy holat ko'rsatilsinmi, yoki kunlik/haftalik statistika
  (masalan "bu hafta eng ko'p yo'q bo'lgan o'qituvchilar") ham kerakmi?
- Bu sahifa alohida, login talab qilmaydigan "katta ekran rejimi"da
  (masalan devorga osilgan monitor uchun, hech kim tugma bosmaydi) bo'lishi
  kerakmi, yoki oddiy admin sahifasi sifatida yetarlimi?

---

## 5. Tartib (tavsiya)

1. **Bosqich A** — `import_teachers_from_docx` (eng katta amaliy qiymat,
   kod yozish + sinov kerak).
2. **Bosqich B** — mavjud dars jadvali UI'ni tekshirish/kichik yaxshilash
   (pagination, filtr) — kichik ish.
3. **Bosqich C** — jonli monitoring — eng katta, yangi funksiya, alohida
   sessiya talab qilishi mumkin.

Progress kuzatuvi: [`TEACHER_ROSTER_PROGRESS.md`](TEACHER_ROSTER_PROGRESS.md)
