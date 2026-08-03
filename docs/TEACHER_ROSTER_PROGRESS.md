# Progress — O'qituvchilar ro'yxati, dars jadvali, jonli monitoring

To'liq reja: [`TEACHER_ROSTER_PLAN.md`](TEACHER_ROSTER_PLAN.md)

Holat belgilari: `[ ]` boshlanmagan · `[~]` jarayonda · `[x]` tayyor

## Tayyorgarlik (tugallangan, shu sessiyada)
- [x] `data/Mart 2026.docx` tahlil qilindi: 792 qator, 55 bo'lim, 6 ustun
  (№, F.I.Sh x2, Lavozimi, Tug'ilgan yili)
- [x] Kafedra oralig'i aniqlandi: 133–687-qatorlar (46 kafedra), OnlineTest'ga
  sinxronlangan kafedra nomlari bilan mos keladi
- [x] Lavozimlar tahlil qilindi (516 ta xodim, ko'p imloviy variant) —
  o'qituvchi/emas ro'yxati tuzildi (PLAN.md §1 jadvaliga qarang)
- [x] Foydalanuvchi bilan 4 ta asosiy qaror aniqlashtirildi:
  1. Lavozim filtri: Kafedra mudiri, Professor, Dotsent, Katta o'qituvchi,
     O'qituvchi, Assistent, Stajyor-o'qituvchi = o'qituvchi
  2. Bo'lim oralig'i: 133–687 (Davolash ishi dekanat → Malaka oshirish)
  3. Login/parol: vaqtinchalik placeholder telefon + standart parol
  4. Jonli monitoring mantig'i: jadval (vaqt) + GPS solishtirish

## Bosqich A — `import_teachers_from_docx` buyrug'i
- [x] iMentor'da xodim yaratish uchun to'g'ri model aniqlandi — `AdminProvisionStaffView`
  (`backend/core/views.py:481`) mantig'i o'rganildi: Django `auth.User`
  (`username`=telefon, `set_password`, `first_name`/`last_name`) + `Group`
  (rol) + `StaffProfile` (`owner_key`=username, `department`/`job_title`
  va h.k.) — buyruq shu naqshni to'g'ridan-to'g'ri ORM orqali takrorlaydi
- [x] Lavozim normallashtirish funksiyasi yozildi (`normalize()` — apostrof/
  tinish belgilarini olib tashlaydi, kichik harf) + kalit so'z ro'yxatlari
  (`TEACHING_KEYWORDS`, `EXCLUDE_KEYWORDS`)
- [x] docx parser yozildi: bo'lim sarlavha qatorini aniqlash
  (`extract_section_name`), kafedra oralig'i "DAVOLASH ISHI"+"DEKANAT" dan
  "MALAKA OSHIRISH"gacha (nom bo'yicha, qator raqami emas — fayl versiyasi
  o'zgarsa ham ishlaydi)
- [x] `AcademicDepartment` bilan nom moslashtirish (case-insensitive,
  mos kelmasa xom nom + "MOS KELMAGAN KAFEDRA" ogohlantirish ro'yxati)
- [x] Placeholder telefon (`998900000XXX`, mavjudlar bilan to'qnashmasdan
  ketma-ket) va standart parol (`--default-password` bilan o'zgartirilishi
  mumkin) generatsiyasi
- [x] F.I.Sh ni ism/familiya bo'lish (`split_person_name`, birinchi so'z =
  ism, qolgani = familiya)
- [x] Dry-run (default) / `--apply`, idempotentlik uchun mavjud xodimni
  F.I.Sh orqali taxminiy moslashtirish (`existing_by_name` — username FK
  emasligi uchun qo'lda bog'langan)
- [x] `python-docx` `requirements.txt`ga qo'shildi
- [ ] **Lokal sinov hali yakunlanmagan** — birinchi urinishda bug topildi va
  tuzatildi (`StaffProfile.owner_key` User'ga FK emas, `staffprofile__isnull`
  filtri xato berdi — `existing_by_name` qurish usuli to'g'irlandi), lekin
  tuzatilgandan keyingi qayta sinov **foydalanuvchi so'rovi bilan
  to'xtatildi** ("o'qituvchilarni qo'shmay turaylik"). Kod yozilgan, ammo
  **hali birorta muvaffaqiyatli end-to-end sinovdan o'tmagan**.
- [ ] Serverda ishga tushirish — kutilmoqda (avval sinov yakunlanishi kerak)

**Muhim eslatma keyingi safar uchun**: qayta boshlaganda avval
`core/tests_teacher_import_smoke.py` (vaqtinchalik, `manage.py test` orqali
sqlite in-memory'da ishlaydigan) sinov faylini qayta yozib, to'liq
dry-run→apply→idempotent zanjirini tasdiqlash kerak — bu safar oxirigacha
yetkazilmadi.

## Bosqich B — O'qituvchilar boshqaruvi + dars jadvali UI
- [x] Import qilingan o'qituvchilar mavjud "Hodimlar joylashuvi" ro'yxatida
  to'g'ri ko'rinishi tasdiqlandi (kod darajasida) — `fetchStaffDirectory()`
  `role === 'hodim'` bo'yicha filtrlaydi, `import_teachers_from_docx` xuddi
  shu rolni (`Group(name="hodim")`) beradi — mos keladi. **Amalda hali
  tekshirilmadi** (o'qituvchilar hali import qilinmagan, Bosqich A to'xtatilgan).
- [x] Kafedra bo'yicha filtr qo'shildi (`AdminStaffLocationConsole.tsx`) —
  "Hodimni tanlang" tepasida yangi "Kafedra bo'yicha filtr" dropdown,
  qo'shimcha API so'rovsiz (`StaffDirectoryEntry.department` allaqachon bor).
  Faqat 2+ noyob kafedra bo'lsa ko'rinadi (hozir kam hodim borligi uchun
  yashiringan bo'lishi mumkin). i18n: `admin.filterByKafedra`,
  `admin.allKafedraOption` (uz/ru/en).
- [x] `tsc --noEmit` va `npm run build` — toza.
- [ ] Pagination — o'qituvchilar hali import qilinmagani uchun **hozircha
  kerak emas deb topildi**, teachers import qilingandan keyin qayta baholanadi.
- [ ] Brauzerda real sinov — o'qituvchilar hali yo'qligi sababli **hozircha
  o'tkazilmadi**.

## Bosqich C — "Katta ekran" jonli monitoring
- [x] Yangilanish chastotasi: **oddiy polling, 20 soniyada bir** (WebSocket
  emas — soddaroq, bu masshtabda (bir necha yuz o'qituvchi) yetarli)
- [x] Backend agregatsiya funksiyasi: `get_live_teaching_status()`
  (`backend/core/location_service.py`) — hozirgi vaqtga to'g'ri keladigan
  `StaffScheduleSlot`larni topib, har biri uchun eng oxirgi
  `StaffLocationPing`ni tekshiradi (20 daqiqadan yangi + bino radiusida
  bo'lsa "joyida"). Mavjud `contains_in_radius`/`current_week_phase_code`
  funksiyalaridan qayta foydalanildi — yangi ma'lumot modeli kerak bo'lmadi.
- [x] Backend endpoint: `GET /api/v1/admin/live-teaching-status/`
  (`AdminLiveTeachingStatusView`, `IsAuthenticated + IsAdminRole`)
- [x] Frontend: `AdminLiveTeachingBoard.tsx` — katta raqamlar (jami/joyida/
  yo'q), rang kodlash (yashil/qizil), ikkita ustun (Yo'q — birinchi, e'tibor
  talab qilgani uchun; Joyida — ikkinchi), 20s avto-yangilanish
- [x] Menyuga qo'shildi: `admin-live-teaching` View, `Monitor` ikonka,
  `nav.admin-live-teaching`/`navMobile.admin-live-teaching` (uz/ru/en)
- [x] `tsc --noEmit` va `npm run build` — toza
- [x] **Backend to'liq sinovdan o'tdi** (`manage.py test`, real senariy):
  3 xodim — biri joyida (yangi ping, radiusda) ✅, biri yo'q (ping bor-u
  radiusdan tashqarida) ✅, biri hozir umuman darsi yo'q (to'g'ri chiqarib
  tashlandi, ro'yxatda ko'rinmadi) ✅. `display_name`/`department` to'g'ri
  qo'shildi (User + StaffProfile join).
- [ ] **Brauzerda to'liq E2E sinov o'tkazilmadi** — bu safar faqat backend
  unit-darajasida (`manage.py test`, sqlite in-memory) tekshirildi; to'liq
  Postgres+Redis+frontend stack bilan real ko'rish keyingi safarga qoldi.
- Qaror: login talab qilinadi (oddiy admin sahifasi) — alohida "kiosk rejimi"
  (login'siz, faqat ko'rish uchun ochiq sahifa) so'ralmadi, kerak bo'lsa
  keyinroq qo'shiladi.

---

**Oxirgi yangilanish:** 2026-08-02 — **Bosqich B va C kod darajasida
tugallandi va sinovdan o'tdi** (backend unit-test darajasida). Bosqich A
(`import_teachers_from_docx`) yozilgan, lekin foydalanuvchi so'rovi bilan
sinovdan o'tkazilmasdan **to'xtatildi** — o'qituvchilar hali import
qilinmagan. Keyingi qadamlar: (1) Bosqich A'ni yakunlash (sinov + serverga
chiqarish), (2) Bosqich C uchun to'liq brauzer E2E sinovi, (3) real
o'qituvchilar import qilingandan keyin Bosqich B'dagi pagination qarorini
qayta ko'rib chiqish.
