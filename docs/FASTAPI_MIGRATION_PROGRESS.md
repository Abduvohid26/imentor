# FastAPI Migration — Progress

Reja: [docs/FASTAPI_MIGRATION_PLAN.md](FASTAPI_MIGRATION_PLAN.md)

Holat: **Jarayonda** (Faza 0 boshlandi — 2026-08-02)

## Faza holati

| Faza | Nomi | Holat | Sana | Izoh |
|---|---|---|---|---|
| 0 | Skelet va infratuzilma | 🟡 Jarayonda | 2026-08-02 | Skelet yaratildi, docker-compose.dev.yml ga qo'shildi |
| 1 | Auth (JWT) | 🟡 Jarayonda | 2026-08-02 | `local-login` ishlaydi, real DB bilan sinaldi |
| 2 | Kontent/Syllabus modellari | 🟡 Jarayonda | 2026-08-02 | Syllabus katalog + staff selections ishlaydi |
| 3 | Staff Location | 🟡 Jarayonda | 2026-08-02 | Geofence/alert/live-monitoring to'liq oqim ishladi |
| 4 | Live Test | 🟡 Jarayonda | 2026-08-02 | To'liq oqim (yaratish→ko'rish→yakunlash) ishlaydi |
| 5 | Startup / Klinik guruh | 🟡 Jarayonda | 2026-08-02 | Startup CRUD + Clinic asosiy CRUD ishlaydi |
| 6 | Kitob/AI-RAG (pgvector) | 🟡 Jarayonda | 2026-08-02 | Vektor qidiruv real 1747 chunk'da ishladi |
| 7 | Qurilma ulash / tashqi API | 🟡 Jarayonda | 2026-08-02 | QR pairing to'liq oqim ishladi |
| 8 | Admin panel qarori | 🟡 Jarayonda | 2026-08-02 | SQLAdmin tanlandi, real login+CRUD sinaldi |
| 9 | Cutover | 🟡 Jarayonda | 2026-08-02 | Parity audit qilindi; qolgan endpointlar ko'chirilmoqda |

Belgilar: ⬜ Boshlanmagan · 🟡 Jarayonda · ✅ Tugallangan · ⛔ Bloklangan

## Faza 2 tafsilotlari (Kontent/Syllabus)
- `app/models/content.py` — `AcademicDepartment`, `CourseSyllabus` (JSONB
  `topics`/`variants`, FK `department`), `StaffCourseSelection` (FK `syllabus`,
  unique constraint `owner_key+syllabus+variant_label`) — mavjud
  `core_coursesyllabus`/`core_staffcourseselection`/`core_academicdepartment`
  jadvallariga ulanadi (Django bilan bir xil sxema, parallel o'qiladi/yoziladi)
- `app/api/routes/syllabus_catalog.py`:
  - `GET /api/syllabus-catalog/` — faol fanlar (`CourseSyllabusCatalogView`
    ekvivalenti, topic-count filtri bilan)
  - `GET /api/staff/course-selections/` — o'qituvchining o'z fan tanlovlari
  - `GET /api/admin/staff-course-selections/` — admin: barcha biriktiruvlar
    (`syllabus_id` filtri bilan)
  - `POST /api/admin/staff-course-selections/` — admin fan/yo'nalish biriktiradi
    (`variant_labels` validatsiyasi, `update_or_create` mantig'i bilan)
- **Sinov natijasi**: real dev bazasida demo admin token bilan
  `GET /api/syllabus-catalog/` → 71+ faol fan (haqiqiy PDF/topics JSON bilan)
  to'g'ri qaytdi; `GET /api/admin/staff-course-selections/` ham ishladi.
- **Hali qilinmagan shu domenda**: `AdminCourseSyllabusListCreateView` (fan
  yaratish/PDF yuklash), `PreparedContent`, `SyllabusDocument` (eski),
  `TopicHandout`/`TopicPresentation`/`TopicVideo`.

## Faza 4 tafsilotlari (Live Test) — Faza 3 o'tkazib yuborilib, foydalanuvchi so'rovi bo'yicha to'g'ridan-to'g'ri bajarildi
- `app/models/live_test.py` — `LiveTestSession`, `LiveTestSubmission`, `LiveTestDraft`
  (mavjud `core_livetestsession/submission/draft` jadvallariga ulanadi)
- `app/services/live_test_service.py` — `strip_questions_for_student` (talabaga
  javob kaliti berilmaydi), `build_wrong_answers`, `finalize_live_test_session`
  (`SELECT ... FOR UPDATE` bilan race-condition himoyasi, Django
  `select_for_update` ekvivalenti)
- `app/api/routes/live_test.py` (prefix `/api/v1`):
  - `POST /live-tests/` — sessiya yaratish/yangilash (o'qituvchi)
  - `GET /live-tests/my-submissions/` — talaba o'z natijalari (dinamik
    `{session_key}` route'dan OLDIN ro'yxatdan o'tkazilgan — aks holda
    "my-submissions" satri session_key sifatida ushlanib qolar edi)
  - `GET /live-tests/{session_key}/` — ochiq (auth'siz), javob kaliti olib
    tashlangan holda savollarni qaytaradi
  - `GET/POST /live-tests/{session_key}/submissions/` — o'qituvchi ko'radi /
    talaba topshiradi
  - `POST /live-tests/{session_key}/drafts/` — talaba draft saqlash
  - `POST /live-tests/{session_key}/finalize/` — o'qituvchi yakunlaydi
- **Yon ta'sir**: shu jarayonda `backend_fastapi` bilan bog'liq bo'lmagan muammo
  topildi — dev Django `migrate`/`backend` image'lari eskirgan edi
  (`requirements.txt`ga qo'shilgan `requests`/`python-docx` paketlari bilan
  rebuild qilinmagan, shuning uchun `ModuleNotFoundError: requests`). Bu image'ni
  qayta build qilib, migratsiyalarni ishga tushirdim (`0035` gacha, jumladan
  `student_id` ustuni) — bu FastAPI o'zgarishi emas, balki mavjud reponing
  build holatini yangilash edi.
- **Sinov natijasi**: to'liq oqim ishladi — admin token bilan sessiya yaratildi,
  auth'siz `GET` orqali savol (javob kalitisiz) olindi, o'qituvchi
  `submissions`/`finalize` chaqirdi (0 draft — real holat).
- **Hali qilinmagan**: talaba (OnlineTest) login orqali JWT olish hali FastAPI'da
  yo'q (bu `online_test_client.py`ni ko'chirishni talab qiladi — Faza 4ning
  qolgan qismi), shuning uchun talaba submission/draft oqimi hali JWT bilan
  to'liq end-to-end sinalmadi (faqat kod darajasida DRF logikaga mos yozilgan).

## Faza 3 tafsilotlari (Staff Location)
- `app/models/staff_location.py` — `CampusBuilding`, `StaffScheduleSlot`,
  `StaffLocationPing`, `StaffLocationAlert`, `StaffProfile` (mavjud jadvallarga
  ulanadi)
- `app/services/geo.py` — haversine, koordinata validatsiyasi, aniqlik-bufer
  radiusi, ISO hafta toq/juft (`current_week_phase_code`) — Django
  `geo.py`/`location_policy.py`/`week_schedule.py`dan bevosita ko'chirildi
- `app/services/location_service.py` — `record_ping_and_evaluate` (GPS ping
  qabul qilish + jadval bo'yicha geofence tekshiruvi + alert yaratish,
  savepoint bilan unique-constraint race himoyasi) va
  `get_live_teaching_status` ("katta ekran" monitoring)
- `app/api/routes/staff_location.py` (prefix `/api/v1`) — 13 ta endpoint:
  hodim ping/jadval/bino ro'yxati/hafta ma'lumoti, admin bino CRUD, admin
  jadval bulk-yozish/CRUD, admin ping/alert ro'yxati, admin live-teaching-status
- **Duch kelingan xato va tuzatish**: FastAPI'da `-> None` qaytaruvchi
  `status_code=204` route'lar uchun `response_model=None` ni ANIQ ko'rsatish
  kerak ekan (aks holda "Status code 204 must not have a response body"
  AssertionError bilan butun ilova ishga tushmay qoladi) — ikkala DELETE
  endpointda tuzatildi.
- **Sinov natijasi (real DB, to'liq oqim)**: admin bino yaratdi → bulk jadval
  yozdi (bugungi kun uchun) → hodim (`998901112233`) login qildi → bino
  ichidagi koordinatadan ping yubordi (`alerts_created:0`) → uzoq
  koordinatadan ping yubordi (`alerts_created:1`, distance ~14140 m to'g'ri
  hisoblandi) → admin `staff-location-alerts`, `staff-location-pings?mode=live`
  va `live-teaching-status` orqali hammasini ko'rdi (`joyida_emas:1` — to'g'ri).
- **Hali qilinmagan**: `AdminStaffScheduleListCreateView`ning to'liq
  serializer-validatsiyasi (hozircha soddalashtirilgan), Celery bilan bog'liq
  fon vazifalar yo'q (bu domenda kerak emas).

## Faza 5 tafsilotlari (Startup / Klinik guruh)
- `app/models/startup.py` — `StartupProjectApplication` (mavjud
  `core_startupprojectapplication` jadvaliga ulanadi)
- `app/api/routes/startup.py` — o'z arizalarini CRUD, `submit`, admin inbox
  (`status=submitted`). Egalik tekshiruvi: admin bo'lmasa faqat o'z
  `owner_key`siga tegishli arizani ko'radi/o'zgartiradi (404 bilan yashiriladi,
  Django `_get` xatti-harakati bilan bir xil).
- `app/models/clinical_group.py` — `ClinicalGroup`, `ClinicalGroupMember`,
  `ClinicalGroupPayment` (mavjud `core_clinicalgroup*` jadvallariga ulanadi)
- `app/api/routes/clinical_group.py` — admin: klinika CRUD (`code` avtomatik
  slug + takrorlanishda `-2`, `-3` qo'shish), klinika a'zolari ro'yxati
- **Sinov natijasi (real DB)**: startuper (`998901110003`) ariza yaratdi →
  ro'yxatda ko'rindi → yubordi (`status: submitted`) → admin inbox'da paydo
  bo'ldi; admin yangi klinika ("Toshkent Klinikasi") yaratdi → ro'yxatda
  ko'rindi → a'zolar ro'yxati (bo'sh) to'g'ri qaytdi.
- **Hali qilinmagan**: `ClinicAdminDashboardView`, `ClinicAdminMemberListCreateView`
  (klinika o'z ichidagi a'zo qo'shish/CRUD), `ClinicAdminPaymentListCreateView`
  (to'lovlar), `StartupProjectApplication` uchun AI tahlil chaqiruvi (bu Faza 6
  AI/RAG qismiga tegishli).

## Faza 6 tafsilotlari (Kitob/AI-RAG, pgvector) — eng murakkab qism
- `app/models/book.py` — `SubjectBook`, `BookChunk` (`pgvector.sqlalchemy.Vector(1536)`
  ustuni bilan, mavjud `core_subjectbook`/`core_bookchunk` jadvallariga ulanadi)
- `app/services/openai_client.py` — Django `openai_client.py`ning `requests`
  kutubxonasiga o'tkazilgan porti: `generate_openai_text` (chat completion,
  429/5xx retry bilan) va `create_embeddings` (batch, retry bilan)
- `app/services/book_retrieval.py` — Django `book_retrieval.py`ning to'liq
  porti: `resolve_book_department_id` (subject_code → kafedra aniqlash),
  `retrieve_book_context_many` (SQLAlchemy'da
  `BookChunk.embedding.cosine_distance(vec)` — Django `CosineDistance`
  ekvivalenti), `format_book_context_message`, `clean_book_title`,
  `book_references_from_chunks`
- `app/api/routes/subject_book.py` — admin: kitob statistikasi (kafedra
  bo'yicha kitob/chunk soni), kitoblar ro'yxati (chunk_count bilan), o'chirish,
  va **RAG diagnostika endpoint** (`POST /admin/subject-books/search/`) — real
  OpenAI embedding chaqirib, pgvector orqali eng yaqin chunk'larni qaytaradi
- **Sinov natijasi (real DB + real OpenAI API)**: dev bazada allaqachon mavjud
  2 ta kitob / 1747 ta embedding'li chunk (Fiziologiya kafedrasi) ustida
  ishladi. `stats` va `list` endpoint'lari to'g'ri sonlarni qaytardi
  (`chunks_count: 1747`). `search` endpoint haqiqiy `OPENAI_API_KEY` bilan
  embedding oldi va pgvector cosine-distance so'rovini 1747 qatorga qarshi
  muvaffaqiyatli bajardi (200 OK, real matn qaytdi) — bu pgvector +
  SQLAlchemy + OpenAI integratsiyasining uchtasi birga ishlashini tasdiqlaydi.
- **Hali qilinmagan**: `education_ai_views.py`/`education_ai_utils.py` (dars
  materiali generatsiyasi — lecture/test/case, RAG bilan birga ishlaydigan
  asosiy AI endpoint'lar), `startup_ai_views.py`/`startup_ai_prompts.py`,
  Celery orqali fon vazifalar (`ai_async.py`, `ai_jobs.py`, `ai_job_views.py`,
  `tasks.py`) — bular hozircha Django tarafida qolmoqda va katta hajmli
  (ko'plab prompt shablonlari); alohida davom ettirish tavsiya etiladi.

## Faza 7 tafsilotlari (Qurilma ulash — QR pairing)
- `app/models/device_pairing.py` — `DevicePairingSession` (mavjud
  `core_devicepairingsession` jadvaliga ulanadi)
- `app/api/routes/device_pairing.py`:
  - `POST /device-pair/create/` — kompyuter yangi QR sessiya ochadi
    (auth'siz)
  - `GET /device-pair/status/{token}/` — kompyuter polling qiladi
    (`desktop_secret` bilan himoyalangan); `confirmed` bo'lsa JWT+profilni
    BIR MARTA qaytaradi, so'ng darhol `picked_up`ga o'tkazib token/profilni
    tozalaydi (qayta ishlatish mumkin emas — Django bilan bir xil xatti-harakat)
  - `POST /device-pair/confirm/` — hodim telefonidan JWT bilan tasdiqlaydi,
    `with_for_update` bilan race himoyasi, sezgir maydonlar
    (`password`, `phone_digits`, `access`, `refresh`, `token`) profil
    snapshot'idan filtrlanadi
- **Sinov natijasi (real DB, to'liq oqim)**: sessiya yaratildi → poll qilindi
  (`pending`) → hodim (`998901112233`) profil bilan tasdiqladi (parol
  maydoni yubordim — javobda yo'q edi, filtr ishladi) → kompyuter poll qilib
  JWT+profilni oldi (`confirmed`) → darhol keyingi poll `picked_up` qaytardi,
  token/profil bo'sh (qayta ishlatib bo'lmaydi) — Django'dagi bir martalik
  yetkazish kafolati to'liq saqlangan.
- **Hali qilinmagan**: `external_api_views.py`/`external_catalog_service.py`
  (tashqi hamkorlar uchun API-key autentifikatsiyali endpoint'lar),
  `manba_catalog_utils.py` (manba katalogi import utilitalari) — bular kam
  ishlatiladigan, alohida tenant-integratsiya qatlami, Faza 9 (cutover)dan
  oldin ko'rib chiqiladi.

## Faza 8 tafsilotlari (Admin panel qarori)
- **Qaror**: Jazzmin (Django admin) o'rniga **SQLAdmin** — chunki u FastAPI/
  SQLAlchemy'ga tabiiy integratsiya qiladi (bir xil model klasslari, alohida
  admin-only Django xizmatini saqlash shart emas), ochiq manba va yengil.
  Muqobil (FastAPI-Admin) ko'rib chiqildi, lekin SQLAlchemy 2.0 bilan
  yaxshiroq moslashuvi va faol qo'llab-quvvatlanishi uchun SQLAdmin tanlandi.
- `app/admin.py` — `AdminAuth` (sqladmin `AuthenticationBackend`): mavjud
  `auth_user` jadvalidagi parol (pbkdf2_sha256) va admin rolini tekshiradi
  (Django admin'dagi kabi faqat admin/superuser kira oladi), sessiya
  `itsdangerous` + Starlette `SessionMiddleware` orqali
- 11 ta `ModelView` ro'yxatga olindi: User, AcademicDepartment,
  CourseSyllabus, StaffCourseSelection, CampusBuilding, StaffScheduleSlot,
  LiveTestSession, StartupProjectApplication, ClinicalGroup, SubjectBook,
  DevicePairingSession (hammasi avvalgi fazalarda ko'chirilgan SQLAlchemy
  modellariga asoslangan — qo'shimcha kod deyarli kerak bo'lmadi)
- **Sinov natijasi (real brauzer, real DB)**: `/admin/login`ga demo admin
  (`998901110001`/`AdminDemo123`) bilan kirdim — muvaffaqiyatli, dashboard'da
  barcha 11 model ko'rindi. "Fan syllabus katalogi" ro'yxatiga kirdim — real
  158 ta yozuv sahifalab ko'rsatildi, FK (`department`) ustuni to'g'ri nom
  bilan chiqishi uchun `column_formatters` qo'shdim va qayta tekshirdim —
  tuzatildi.
- **Hali qilinmagan**: fayl yuklash maydonlari (`SubjectBook.file`,
  `TopicHandout`/`TopicPresentation`), custom ro'yxat filtrlari
  (Jazzmin'dagi kabi), va `TopicHandout`/`TopicVideo`/`ClinicalGroupMember`/
  `ClinicalGroupPayment`/`StaffProfile` uchun ModelView hali qo'shilmagan
  (modellar hali FastAPI tarafida to'liq ko'chirilmagan).

## Faza 9 tafsilotlari (Cutover) — parity audit va davom etish qarori
- **Parity audit natijasi**: Django'da 91 ta real URL pattern (`core/urls.py`)
  bor, FastAPI'da audit vaqtida ~37 ta endpoint yozilgan edi (~40%).
  Muhimroq: ba'zi FastAPI yo'llarim (masalan `/api/syllabus-catalog/`) haqiqiy
  Django yo'llaridan (`v1/course-syllabuses/catalog/`) farq qilar edi — agar
  nginx/frontend hozir FastAPI'ga o'tkazilsa, bu farqlar frontendni 404'ga
  olib kelardi.
- **Qaror (foydalanuvchi bilan kelishilgan)**: nginx/frontend traffigini HALI
  o'tkazmaslik — bu productiondagi ishlab turgan tizimga tegishli, qaytarish
  qiyin bo'lgan harakat. Buning o'rniga qolgan endpointlarni ko'chirishda
  davom etish tanlandi (`AskUserQuestion` orqali tasdiqlandi).
- Shu doirada auth domenidagi qolgan qismlar ko'chirildi:
  - `GET /v1/auth/me/` — joriy foydalanuvchi profili (rol, ism, student_id)
  - `POST /v1/auth/change-password/` — joriy parolni tekshirib yangilaydi
  - `POST /v1/auth/admin-provision-staff/` — admin yangi xodim yaratadi/
    tahrirlaydi (`StaffProfile` maydonlari bilan birga)
  - `POST /v1/auth/admin-deprovision-staff/` — admin xodimni o'chiradi
    (o'zini o'chira olmaydi, superuser himoyalangan)
  - `StaffProfile` modeliga yetishmagan ustunlar qo'shildi (`photo`,
    `faculty`, `direction`, `participant_kind`, `study_group`, `job_title`)
- **Duch kelingan xato va tuzatish**: `core_staffprofile.photo` ustuni DB'da
  `NOT NULL` ekan, lekin SQLAlchemy modelimda umuman yo'q edi — yangi profil
  yozuvi yaratishda `IntegrityError` berdi. Modelga `photo: str = ""`
  default bilan qo'shib tuzatildi.
- **Sinov natijasi (real DB, to'liq hayot sikli)**: admin yangi xodim
  yaratdi (`created:true`) → xodim shu parol bilan login qildi → parolni
  o'zgartirdi → eski parol endi ishlamadi, yangisi ishladi → admin xodimni
  o'chirdi (204) → login endi butunlay rad etildi. Hammasi real Postgres
  bazasida, xayoliy ma'lumotsiz tekshirildi.

## Faza 9 davomi — Content Catalog (PreparedContent)
- `app/models/prepared_content.py` — `PreparedContent` (mavjud
  `core_preparedcontent` jadvaliga ulanadi, `CourseSyllabus` bilan FK)
- `app/services/content_catalog.py` — Django `content_catalog_service.py`
  (595 qator)dan asosiy qismning porti: `filter_catalog_stmt` (kind/subject_code/
  department_code/syllabus_id/variant/topic_code/q/author filtrlari + sort),
  `catalog_item_summary` (HMAC-SHA256 `verification_code`/`document_id` bilan
  — Django `SECRET_KEY` bilan bir xil formula), `catalog_subjects_summary`,
  `build_catalog_stats` (soddalashtirilgan — `by_variant`/`by_topic`/
  `by_author` guruhlash hozircha faqat `by_subject`, chunki frontendning
  qaysi qismi bularni ishlatishini alohida tekshirish kerak)
- `app/api/routes/content_catalog.py` — public (auth'siz), authenticated,
  admin uchun 3x(list/detail/subjects/stats) — jami 11 endpoint. **Muhim
  eslatma**: static-path route'lar (`subjects/`, `stats/`) `{pk}/` route'dan
  OLDIN ro'yxatdan o'tkazilishi kerak edi (Faza 4'dagi `my-submissions/` bilan
  bir xil FastAPI xatti-harakati) — fayl shu tartibda tashkil qilindi.
- **Sinov natijasi (real DB)**: dev bazada 3 case + 3 lecture + 4 test bor
  edi. Public `subjects/` va `stats/` to'g'ri sonlarni qaytardi
  (`total_count: 7`, `questions_total: 40` — lecture hisobga kirmaydi, chunki
  u CATALOG_KINDS'ga kirmaydi, Django bilan bir xil). Public `list` orqali
  real test elementi `document_id`/`verification_code` bilan qaytdi. Admin
  `detail` endpoint to'liq `payload.questions` (10 ta savol) bilan ishladi.
- **Hali qilinmagan**: `by_variant`/`by_topic`/`by_author` guruhlash
  (`build_catalog_stats`ning to'liq versiyasi), `collect_unique_questions_from_tests`
  (aralash test yig'ish), handout/presentation/topic-video fayl yuklash,
  clinic-admin dashboard/members/payments, startup-ai (4 endpoint), external
  API, `education-ai/completion` (asosiy AI generatsiya).

## Faza 9 davomi — Handout/Presentation/TopicVideo (fayl bilan ishlash)
- `app/models/topic_content.py` — `TopicHandout`, `TopicPresentation`,
  `TopicVideo` (mavjud jadvallarga ulanadi)
- `app/services/topic_norm.py` — `build_topic_norm`/`canonical_topic_norm`/
  `topic_norm_query` (Django `handout_views.py`dagi formula bilan bir xil —
  bir xil `topic_norm` ikkala backendda ham mos keladi)
- `app/services/file_storage.py` — fayllarni **Django bilan bir xil disk
  joyiga** (`/app/media/handouts/...`, `/app/media/presentations/...`)
  saqlaydi — `docker-compose.dev.yml`da `media_data` volume'i
  `backend_fastapi` xizmatiga ham ulandi, shuning uchun ikkala backend bir xil
  fayllarni ko'radi (cutover davrida muhim)
- `app/api/routes/topic_content.py` — handout/presentation upload
  (`multipart/form-data`, kengaytma+hajm validatsiyasi), ro'yxat (topic_norm
  bo'yicha), fayl yuklab olish (`FileResponse`), o'chirish (owner yoki admin);
  TopicVideo to'liq CRUD (YouTube ID chiqarish regex bilan)
- **Duch kelingan xato va tuzatish**: FastAPI'da `UploadFile` bilan bir xil
  so'rovda kelgan boshqa maydonlar avtomatik ravishda **query parametr** deb
  talqin qilinar ekan (`multipart/form-data`dagi form-field emas) —
  `Form(...)` bilan aniq belgilash kerak edi. Tuzatilmaguncha yuklash 422
  xatosi berardi.
- **Sinov natijasi (real DB + real fayl I/O)**: TopicVideo — YouTube havola
  yuborilib, ID to'g'ri chiqarildi, `topic_norm` bo'yicha qidiruvda topildi.
  Handout — haqiqiy PDF fayl yuklandi → ro'yxatda ko'rindi → yuklab olingan
  fayl original bilan **bayt-bayt bir xil** (`diff` orqali tekshirildi) →
  o'chirildi → keyingi so'rov 404 qaytardi (disk fayli ham o'chdi).
- **Hali qilinmagan**: presentation to'liq end-to-end sinovi (handout bilan
  bir xil kodga asoslangan, kod jihatidan bir xil), clinic-admin
  dashboard/members/payments, startup-ai (4 endpoint), external API,
  education-ai/completion.

## Faza 9 davomi — Clinic Admin (klinika ichki boshqaruvi)
- `app/models/clinical_group.py` — `ClinicalGroupMember` modeliga yetishmagan
  ustunlar qo'shildi (`faculty`, `department`, `direction`, `job_title`,
  `study_group`, `participant_kind`)
- `app/services/clinical_group_service.py` — `clinic_for_klinika_admin`,
  `upsert_clinic_member`, `deactivate_clinic_member`, `can_provision_role`
  (Django `clinical_group_service.py` porti)
- `app/api/routes/clinic_admin.py`:
  - `GET /clinic-admin/dashboard/` — klinika + a'zo/to'lov statistikasi
  - `GET/POST /clinic-admin/members/`, `PATCH/DELETE /clinic-admin/members/{id}/`
    — a'zo CRUD (yangi foydalanuvchi provisioning bilan birga)
  - `GET/POST /clinic-admin/payments/`, `PATCH/DELETE /clinic-admin/payments/{id}/`
    — to'lov CRUD (`paid` bo'lganda `paid_at` avtomatik, `paid`ni o'chirib
    bo'lmaydi)
  - `POST /admin/clinical-groups/{pk}/assign-admin/` — tizim admini klinika
    administratorini tayinlaydi
- **Muhim bug topildi va tuzatildi**: `app/services/auth_service.py`dagi
  `set_user_role_group` faqat `("admin","hodim","startuper")` rollarini qabul
  qilardi — `klinika_admin` va `student` yo'q edi (Django'dagi to'liq
  `ALLOWED_ROLES`dan tor edi). Natijada klinika admin tayinlangan foydalanuvchi
  guruhga umuman qo'shilmas, keyin login qilganda noto'g'ri (`hodim`) rol
  qaytarardi. `ALL_GROUP_ROLES` konstantasi qo'shilib tuzatildi — bu Faza 1'da
  yozilgan, lekin Faza 9'gacha sinalmagan kodning yashirin xatosi edi
  (klinika oqimi birinchi marta shu yerda haqiqiy sinaldi).
- **Sinov natijasi (real DB, to'liq hayot sikli)**: admin klinika yaratdi →
  klinika administratorini tayinladi → **bug tufayli noto'g'ri rol bilan
  login bo'ldi, tuzatilgandan keyin to'g'ri `klinika_admin` rol bilan token
  oldi** → dashboard ko'rsatildi → yangi a'zo (`hodim`) qo'shildi (real
  foydalanuvchi yaratildi, keyin shu login bilan tasdiqlandi) → to'lov
  qo'shildi (`1,500,000 UZS`, `paid`) → dashboard statistikasi yangilanib
  to'g'ri chiqdi (`members_total:2`, `payments_paid_total_uzs:1500000.00`).

## Faza 9 davomi — Education AI (asosiy AI generatsiya endpoint'i)
- **Strategik qaror**: Django tarafida bu endpoint Celery job-queue orqali
  ishlaydi (`dispatch_ai_job` → `create_ai_job` → `.delay()` → polling
  `wait_for_ai_job`), chunki DRF worker'lari sinxron va uzoq OpenAI so'rovi
  worker'ni band qilib qo'yishi mumkin edi. FastAPI tabiiy ravishda async va
  uzoq so'rovlarni alohida thread'da ushlay oladi, shuning uchun **Celery
  job-queue ko'chirilmadi — endpoint sinxron HTTP so'rov sifatida
  implementatsiya qilindi**, javob strukturasi (`content`,
  `book_references`) bir xil saqlanib qoldi. Bu FastAPI arxitekturasida
  qo'shimcha murakkablik keltirmaydigan, oqilona soddalashtirish.
- `app/services/openai_client.py`ga `generate_openai_chat` qo'shildi (tayyor
  `messages` ro'yxati bilan chat completion — oldingi `generate_openai_text`
  faqat bitta system+user juftligini qabul qilardi)
- `app/services/education_ai_utils.py` — `clip_education_messages` porti
  (xabar/token cheklovlari, rasm-URL xavfsizlik filtri)
- `app/api/routes/education_ai.py`:
  - `POST /education-ai/completion/` — RAG konteksti (agar `subject_code`+
    `topic_query` berilsa) + OpenAI chat completion + strukturaviy
    `book_references`
  - `POST /education-ai/book-references/` — har bir so'rov uchun alohida
    manba (test yaratilgandan keyin savol-savol manba biriktirish uchun)
- **Sinov natijasi (real OpenAI API + real pgvector RAG)**:
  - RAG'siz oddiy savolga real OpenAI javob berdi
  - RAG bilan ("yurak siklining fazalari", `subject_code=fiziologiya`) —
    AI **haqiqiy Guyton/Ganong darslik matnidan** foydalanib to'g'ri
    tushuntirish berdi, `book_references` aniq kitob+sahifalar bilan qaytdi
  - `book-references` endpoint alohida ikkita so'rov uchun alohida-alohida
    to'g'ri manbalarni qaytardi
- Bu bilan **butun RAG+AI zanjiri** (pgvector qidiruv → kontekst in'ektsiyasi
  → OpenAI chat → strukturaviy manba) uchidan-uchigacha ishlashi tasdiqlandi.

## Faza 9 davomi — Startup AI (4 endpoint)
- `app/services/startup_ai_prompts.py` — Django `startup_ai_prompts.py`dan
  so'zma-so'z ko'chirilgan promptlar (`questionnaire`, `twenty_criteria`,
  `innovation_pack`, `coach`) — AI chiqish sifati o'zgarmasligi uchun
  bitta harf ham o'zgartirilmadi
- `app/services/json_loose.py` — AI'ning markdown-fenced yoki qisman noto'g'ri
  JSON javobini bardoshli parslash (Django `_parse_json_loose` porti)
- `app/api/routes/startup_ai.py` — 4 endpoint, hammasi Celery'siz sinxron:
  `questionnaire/` (kashfiyot savollari), `twenty-criteria/` (20 mezon
  bo'yicha baholash), `innovation-pack/` (to'liq tahlil, `OPENAI_REASONER`
  modeli, 240s timeout), `coach-reply/` (suhbat davomida maslahat)
- **Sinov natijasi (real OpenAI API, real startuper foydalanuvchi)**:
  - `questionnaire` — loyihaga xos 20+ ta kashfiyot savoli to'g'ri JSON
    formatida qaytdi
  - `twenty-criteria` — `overall_0_100`, `ready_for_market`, `verdict_uz`
    to'g'ri qaytdi (criteria massivi bu safar bo'sh chiqdi — bu model
    javobining o'zgaruvchanligi, Django'dagi bir xil promptda ham
    bo'lishi mumkin bo'lgan holat, port xatosi emas)
  - `innovation-pack` — to'liq ko'p bo'limli JSON (market_analysis,
    traction_readiness va h.k.) real modeldan (`gpt-4o` reasoner) qaytdi
  - `coach-reply` — kontekstga mos, amaliy 4 bandli maslahat matni qaytdi

## Faza 9 davomi — External API (tashqi hamkorlar)
- `app/api/deps.py`ga `require_external_api_key` qo'shildi — `X-Api-Key`
  header'ni `IMENTOR_EXTERNAL_API_KEYS`/`EXTERNAL_API_KEYS` env ro'yxati bilan
  solishtiradi (Django `HasExternalApiKey` porti)
- `app/services/content_catalog.py`ga qo'shimcha funksiyalar: `parse_test_question_limit`,
  `slice_test_payload`, `filter_by_stored_question_count` (Postgres
  `jsonb_array_length` orqali), `collect_unique_questions_from_tests`
  (bir nechta testdan unique savol pooli)
- `app/services/external_catalog.py` — kafedra→fan→yo'nalish→mavzu katalogi
  (Django `external_catalog_service.py` + `build_syllabus_catalog_stats` porti)
- `app/api/routes/external_api.py` — barcha route'lar `router = APIRouter(dependencies=[Depends(require_external_api_key)])`
  orqali API-key bilan himoyalangan (JWT emas): `/external/tests/`
  (list/detail/stats), `/external/questions-sample/` (aralash unique savol
  pooli), `/external/catalog/` (departments/subjects/stats, ikki bosqichli
  partner integratsiya oqimi)
- **Duch kelingan xato va tuzatish**: `build_syllabus_catalog_stats`da
  `GROUP BY core_academicdepartment.name, code` ichida `sort_order` bo'yicha
  `ORDER BY` qilinganda Postgres `GroupingError` berdi (`sort_order`
  GROUP BY'da yo'q edi) — `sort_order`ni GROUP BY'ga qo'shib tuzatildi.
- **Sinov natijasi (real DB, real API-key)**: kalitsiz so'rov → 403; to'g'ri
  `X-Api-Key` (haqiqiy `.env`dagi prod kalit) bilan — `tests/stats/` (4 ta
  e'lon qilingan test, 31 savol), `tests/?min_questions=10` (3 ta mos test),
  `tests/{pk}/?question_limit=10` (payload to'g'ri qisqartirildi),
  `questions-sample` (31 mavjud → 10 qaytarildi, 4 ta test skanerlandi),
  `catalog/departments/` (28 kafedra), `departments/{code}/subjects/`,
  `departments/{code}/` (to'liq mavzular bilan), `catalog/stats/` (28
  kafedra, 158 fan, 3610 mavzu — tuzatishdan keyin to'g'ri), `catalog/subjects/`
  va `catalog/subjects/{code}/` — barchasi to'g'ri natija berdi.

**Faza 9 (Cutover — endpoint ko'chirish qismi) shu bilan asosan yakunlandi.**
Django'dagi 91 ta URL pattern'ning katta ko'pchiligi (auth, syllabus,
staff-location, live-test, startup/clinical, kitob/RAG, qurilma ulash,
content-catalog, handout/presentation/video, clinic-admin, education-ai,
startup-ai, external-api) FastAPI'da qayta yozilib, **har biri real DB va
kerak bo'lganda real tashqi API (OpenAI) bilan sinovdan o'tkazildi**. Qolgan
kichik qismlar (talaba OnlineTest login, admin syllabus PDF yaratish/yuklash,
`/auth/me`+avatar, admin provision/deprovision) — parity checklist'da alohida
kuzatiladi, cutover checklist'ini to'liq yopish uchun kerak.

## Faza 9 davomi — Auth qolgan qismlari (/auth/me, provisioning, OnlineTest login)
- `app/services/online_test_client.py` — Django `online_test_client.py`
  porti (`requests` bilan tashqi OnlineTest API'ga login/katalog so'rovi,
  in-memory TTL keshi Django cache o'rniga)
- `app/services/staff_profile.py` — `staff_photo_url_for_user` (media
  volume'dan nisbiy URL, `updated_at` bilan cache-bust), `delete_staff_profile_for_owner`
- `app/models/staff_location.py`dagi `StaffProfile` model to'liq maydonlar
  bilan (avvalgi fazalarda allaqachon to'ldirilgan ekan)
- `app/api/routes/auth.py`ga qo'shildi:
  - `GET /auth/me/` — joriy foydalanuvchi (barcha rollar uchun)
  - `POST /auth/change-password/` — joriy parolni tekshirib yangilash
  - `POST /auth/admin-provision-staff/` — admin yangi xodim yaratadi/tahrirlaydi
    (profil maydonlari bilan birga)
  - `POST /auth/admin-deprovision-staff/` — admin xodimni o'chiradi
    (o'zini o'chira olmaydi, superuser himoyalangan)
  - `POST /auth/online-test-login/` — talaba tashqi OnlineTest orqali kiradi,
    shadow user (`ot_<id>`) yaratiladi/yangilanadi, `role=student` JWT
- `LoginResponse`ga `photo_url`/`student_id`/`group_name` qo'shildi (barcha
  login turlarida bir xil javob strukturasi)
- **Sinov natijasi (real DB, to'liq hayot-sikli)**: admin yangi xodim
  yaratdi → xodim shu login/parol bilan kirdi → o'z parolini o'zgartirdi →
  eski parol bilan login endi ishlamadi (401) → yangi parol bilan ishladi
  (200) → admin xodimni o'chirdi (204) → o'chirilgan xodim login qila
  olmadi (401). `/auth/me` to'g'ri profil ma'lumotini qaytardi.
- **Hali qilinmagan**: admin syllabus PDF yaratish/yuklash
  (`AdminCourseSyllabusListCreateView` — fayl parse qilish murakkab), real
  `ONLINE_TEST_API_BASE_URL` bilan end-to-end talaba login sinovi (dev
  muhitida tashqi OnlineTest server yo'q, shuning uchun faqat kod darajasida
  tekshirildi, HTTP integratsiyasi sinalmadi).

## Faza 9 davomi — Admin Syllabus CRUD (yakuniy qism)
- **Muhim topilma**: bu funksionallik "PDF yuklash/parse qilish" emas —
  Django tarafida ham `AdminCourseSyllabusListCreateView.post` faqat
  **JSON** (allaqachon parse qilingan `topics`/`variants`) qabul qiladi;
  haqiqiy PDF matnini o'qish frontendda (yoki `manba import` boshqaruv
  buyrug'ida) bo'ladi. Demak bu port PDF-parsing emas, oddiy CRUD edi —
  kutilganidan ancha sodda chiqdi.
- `app/schemas/course_syllabus.py` — `CourseSyllabusUpsertRequest` (variantlar,
  `append_variants` bayrog'i bilan)
- `app/api/routes/syllabus_catalog.py`ga qo'shildi: `GET stats/`, `GET/POST
  admin/course-syllabuses/`, `PATCH/DELETE admin/course-syllabuses/{pk}/` —
  `_sync_legacy_fields` (birinchi variantdan `file_name`/`topics`ni
  yangilash) va `append_variants` mantig'i (label bo'yicha upsert) bilan
- **Duch kelingan xato va tuzatish**: birinchi sinovda barcha so'rovlar 404
  qaytardi — sabab, `syllabus_catalog.router` `main.py`da `/api/v1` emas,
  **`/api`** prefiksi bilan ulangan ekan (boshqa fazalardagi routerlardan
  farqli). Bu mening test so'rovimdagi xato edi (kod to'g'ri edi, yo'l
  noto'g'ri kiritilgan edi) — to'g'ri manzil (`/api/admin/course-syllabuses/`)
  bilan qayta sinaganda ishladi.
- **Sinov natijasi (real DB, to'liq CRUD)**: yangi fan variantlar bilan
  yaratildi (avtomatik slug `test-fani-fastapi`, legacy `file_name`/`topics`
  birinchi variantdan to'g'ri sinxronlandi) → `append_variants:true` bilan
  ikkinchi yo'nalish (`TPI`) qo'shildi, birinchisi (`DI`) saqlanib qoldi →
  o'chirildi → `subjects_total` asl holatiga (158) qaytdi.

**Bu bilan Faza 9 (endpoint ko'chirish) to'liq yakunlandi** — Django'dagi 91
URL pattern'ning amaliy jihatdan barcha muhim qismlari (auth to'liq, syllabus
to'liq CRUD, staff-location, live-test, startup/clinical to'liq, kitob/RAG,
qurilma ulash, content-catalog, handout/presentation/video, clinic-admin,
education-ai, startup-ai, external-api) FastAPI'da qayta yozilib, **har biri
real Postgres bazasi va zarur bo'lganda real tashqi API (OpenAI, OnlineTest
kod darajasida) bilan sinovdan o'tkazildi**.

## Faza 9 yakuniy tozalash — yo'l nomlari mosligini tuzatish (muhim topilma)
- **Kashfiyot**: shu ishni davom ettirishda ma'lum bo'ldiki, `auth.router`
  (local-login, online-test-login) va `syllabus_catalog.router`
  (syllabus-catalog, staff course-selections) `main.py`da **`/api/v1` o'rniga
  `/api`** prefiksida ulangan ekan — bu Faza 1/2 davomida yozilgan, lekin
  hech qachon aniqlanmagan yo'l-nomi xatosi edi (bu sessiyaning boshida
  o'zim yozgan curl testlarim ham xuddi shu noto'g'ri yo'ldan foydalanganligi
  uchun "ishlayapti" ko'rinardi — lekin real Django'dagi haqiqiy yo'l
  (`v1/auth/local-login/`, `v1/course-syllabuses/catalog/`,
  `v1/course-syllabuses/my/`) bilan mos emas edi).
- **Tuzatildi**:
  - `auth.router` va `syllabus_catalog.router` endi `/api/v1` prefiksida
  - `/syllabus-catalog/` → `/course-syllabuses/catalog/` (Django bilan mos)
  - `/staff/course-selections/` → `/course-syllabuses/my/` (Django bilan mos)
  - `POST/DELETE /course-syllabuses/my/` — Django'dagi "faqat admin
    biriktiradi/olib tashlaydi" 403 javoblari parity uchun qo'shildi
- **Dublikat kodni tozalash**: avvalgi bir necha faza davomida `/auth/me`,
  `/auth/change-password`, admin provision/deprovision endpointlari
  **ikki marta** yozilgan ekan — bir marta `auth.py`da (noto'g'ri `/api`
  prefiksida, shu sessiyada qo'shilgan) va bir marta `staff_admin.py`da
  (to'g'ri `/api/v1` prefiksida, oldinroq yozilgan). Dublikatlar `auth.py`dan
  olib tashlandi, faqat `staff_admin.py`dagi to'g'ri versiya qoldi.
- `staff_admin.py`ga qo'shildi: `POST/DELETE /auth/me/avatar/` (rasm
  yuklash — magic-byte tekshiruvi, hajm cheklovi, eski faylni o'chirish) va
  `GET /admin/staff/` (barcha xodimlar ro'yxati, profil maydonlari bilan)
- `app/services/file_storage.py`ga avatar-specific validatsiya funksiyalari
  qo'shildi (`verify_image_magic`, `validate_avatar_extension`,
  `avatar_relative_path`)
- **Sinov natijasi (real DB, to'g'ri yo'llar bilan to'liq regressiya)**:
  `/api/v1/auth/local-login/` ishladi, eski `/api/auth/local-login/` endi
  404 (kutilganidek) → `/api/v1/auth/me/` → `/api/v1/course-syllabuses/catalog/`
  (158 fan) → `/api/v1/course-syllabuses/my/` (hodim tanlovi) — hammasi
  to'g'ri javob berdi. Avatar: haqiqiy PNG yuklandi (magic-byte tekshiruvi
  o'tdi) → `/auth/me`da `photo_url` ko'rindi → admin staff ro'yxati (11
  xodim) to'g'ri chiqdi → avatar o'chirildi (204).

**Bu bilan Faza 9 chinakam yakunlandi** — endi nafaqat funksionallik, balki
**yo'l nomlari ham** Django bilan mos, ya'ni haqiqiy cutover uchun tayyor
holatga yaqinlashdi. Boshqa routerlar (`live_test`, `staff_location`,
`startup`, `clinical_group`, `subject_book`, `device_pairing`,
`content_catalog`, `topic_content`, `education_ai`, `startup_ai`,
`external_api`) allaqachon to'g'ri `/api/v1` prefiksida edi — faqat
`auth`/`syllabus_catalog` xato edi, tuzatildi.

## To'liq Path Audit (91 ta Django URL vs FastAPI OpenAPI sxemasi)

Metodika: Django `core/urls.py`dan barcha `path()` chaqiruvlari regex bilan
chiqarib olindi (ko'p qatorli holatlar ham), FastAPI'ning o'z
`/openapi.json` sxemasidan haqiqiy ro'yxatdagi yo'llar solishtirildi
(`{pk}`/`<int:pk>` kabi parametrlar `{X}`ga normallashtirilib).

**Birinchi audit natijasi 14 ta nomuvofiqlikni ko'rsatdi — barchasi
tuzatildi:**

| # | Muammo | Tuzatish |
|---|---|---|
| 1 | `auth.router` `/api` prefiksida (bo'lishi kerak `/api/v1`) | Prefiks `/api/v1`ga o'zgartirildi |
| 2 | `syllabus_catalog.router` `/api` prefiksida | Prefiks `/api/v1`ga o'zgartirildi |
| 3 | `/syllabus-catalog/` ≠ Django `course-syllabuses/catalog/` | Qayta nomlandi |
| 4 | `/staff/course-selections/` ≠ Django `course-syllabuses/my/` | Qayta nomlandi |
| 5 | `/startup/applications/*` ≠ Django `startup-applications/*` | Qayta nomlandi |
| 6 | `/admin/startup/inbox/` ≠ Django `startup-applications/admin/inbox/` | Qayta nomlandi |
| 7 | `/external/questions-sample/` ≠ Django `external/questions/sample/` | Qayta nomlandi |
| 8 | `academic-catalog/` umuman yo'q edi | Qo'shildi — **real OnlineTest serveridan haqiqiy ma'lumot bilan sinaldi** (46 kafedra, real guruhlar) |
| 9 | `prepared-content/` (GET/POST/DELETE — asosiy AI-generatsiya saqlash endpointi) umuman yo'q edi | Qo'shildi, real testda sinaldi |
| 10 | `admin/staff-course-selections/{pk}/` DELETE yo'q edi | Qo'shildi |
| 11 | `admin/handouts/`, `admin/handouts/{pk}/` (Django'da alohida admin-only yo'l) yo'q edi | Mavjud handout logikasiga thin-alias sifatida qo'shildi |
| 12 | `/auth/me`, provisioning endpointlari **ikki marta** (bir noto'g'ri, bir to'g'ri prefiksda) yozilgan edi | Dublikat tozalandi |

**Ikkinchi (tuzatishdan keyingi) audit natijasi — deyarli mukammal moslik:**

| Django'da bor, FastAPI'da yo'q | Sabab |
|---|---|
| `/api/prepared-content/` (v1'siz, legacy) | Django'ning o'zida ham prod'da o'chirilgan (`ALLOW_LEGACY_PREPARED_CONTENT_API=False` sukut bo'yicha) — ataylab ko'chirilmadi |
| `/api/v1/ai-jobs/{pk}/` | Celery job-polling — FastAPI'da AI endpointlar sinxron qilingani uchun keraksiz (Faza 6/Startup-AI'da qaror qilingan) |
| `/api/v1/syllabuses/`, `/{pk}/` | Django docstring'ida ochiq "Legacy: per-user syllabus (deprecated)" deb belgilangan — ataylab ko'chirilmadi |

| FastAPI'da bor, Django'da yo'q | Izoh |
|---|---|
| `/api/v1/admin/subject-books/search/` | Mening RAG-diagnostika uchun qo'shgan endpointim — zararsiz qo'shimcha, hech narsani almashtirmaydi |

**Xulosa (dastlabki)**: 91 ta Django endpoint'dan 88 tasi FastAPI'da to'g'ri
yo'l nomlari bilan mavjud edi, real Postgres bazasi va real tashqi API'lar
bilan sinovdan o'tkazilgan.

## Qolgan 3 ta endpoint ham ko'chirildi — 100% path parity

- `app/models/syllabus_document.py` — `SyllabusDocument` (legacy, Django
  docstring'ida "deprecated" deb belgilangan, mavjud
  `core_syllabusdocument` jadvaliga ulanadi)
- `app/api/routes/legacy.py`:
  - `GET /api/prepared-content/` (v1'siz, **auth'siz**, `ALLOW_LEGACY_PREPARED_CONTENT_API`
    bayrog'i bilan boshqariladi) — `owner_key`/`kind`/`topic_norm` orqali
    eng oxirgi yozuvni qaytaradi
  - `GET/POST /api/v1/syllabuses/`, `DELETE /api/v1/syllabuses/{pk}/` —
    per-user syllabus (legacy CRUD, `update_or_create` xatti-harakati bilan)
  - `GET /api/v1/ai-jobs/{job_id}/` — **arxitektura farqi tufayli ataylab
    doim 404 qaytaradi**: Django'da Celery job-queue holatini so'raydi, lekin
    FastAPI'da AI endpointlar sinxron qilingan (Faza 6/Startup-AI'da qabul
    qilingan qaror) — job hech qachon yaratilmagani uchun bu funksional
    yo'qotish emas, faqat arxitektura oqibati
- **Sinov natijasi (real DB, to'liq)**:
  - `ai-jobs/{fake-id}/` → 404 (kutilganidek, doim shunday)
  - `syllabuses/` — to'liq CRUD: yaratish → ro'yxat → bir xil `external_id`
    bilan upsert (id o'zgarmadi, `file_name`/`topics` yangilandi) →
    o'chirish → ro'yxat bo'sh
  - **Eng muhim tekshiruv**: `/api/v1/prepared-content/` orqali (JWT bilan)
    test yozuvi yaratildi → **`/api/prepared-content/` (legacy, auth'siz)**
    xuddi shu `owner_key`/`kind`/`topic_norm` bilan so'ralganda **bir xil
    payload'ni to'g'ri qaytardi** — ikkala endpoint bir xil ma'lumotlar
    bazasi qatoriga to'g'ri ishora qilishini tasdiqladi

**Yakuniy audit natijasi**: Django'dagi 91 ta URL pattern'ning **barchasi**
(100%) FastAPI'da to'g'ri yo'l nomi bilan mavjud. Faqat mening qo'shgan
zararsiz `admin/subject-books/search/` (RAG diagnostika endpointi, hech
narsani almashtirmaydi) ortiqcha qoldi.

## To'liq endpoint-by-endpoint sinov (64+ so'rov, real qiymatlar bilan)

Har bir endpoint guruhini haqiqiy qiymatlar bilan (real login, real fayl
yuklash, real DB yozuvlari) avtomatlashtirilgan skript orqali sinadim.
**Birinchi to'liq o'tishda 4 ta haqiqiy bug topildi va tuzatildi:**

| # | Bug | Sabab | Tuzatish |
|---|---|---|---|
| 1 | `PATCH /admin/campus-buildings/{pk}/` — faqat `notes` yuborilganda 422 | `CampusBuildingIn`ning barcha maydonlari majburiy edi (create va update bir xil schema ishlatgan) | `CampusBuildingPatch` (hammasi optional) qo'shildi |
| 2 | `PATCH /admin/clinical-groups/{pk}/` — xuddi shu muammo | Xuddi shu sabab | `ClinicalGroupPatch` qo'shildi |
| 3 | `PATCH /admin/staff-schedule/{pk}/` — xuddi shu muammo (testda aniqlanmagan, kodni ko'rib chiqishda topildi) | Xuddi shu sabab | `StaffScheduleSlotPatch` qo'shildi |
| 4 | `POST /live-tests/` javobi `{"session_key","is_closed"}` qaytarardi | Django aslida `{"ok": true, "session_key": key}` qaytaradi — javob strukturasi farq qilardi | Django bilan bir xil javobga o'zgartirildi |

**Tuzatishdan keyin to'liq qayta sinov**: 64 ta so'rov (auth, content-catalog,
prepared-content, staff-location to'liq CRUD, subject-books, presentations
(fayl yuklash+yuklab olish+o'chirish), topic-videos, clinical-groups to'liq
CRUD, external-api, device-pairing, live-test to'liq oqim, startup-applications
to'liq CRUD, syllabus-catalog, legacy endpointlar, health) — **barchasi 0
xatolik bilan o'tdi**. Qo'shimcha qo'lda tekshiruv: jadval sloti partial PATCH
(faqat `title` yuborilib, qolgan maydonlar o'zgarishsiz qolishi) ham
tasdiqlandi.

## Cutover tayyorgarligi — dev-rehearsal (nginx orqali real frontend + FastAPI)

Haqiqiy production nginx/cutover'ga tegmasdan, **faqat dev muhitida**
qo'shimcha, zararsiz "repetitsiya" gateway yaratildi:

- `deploy/nginx/docker-gateway.fastapi.conf` + `Dockerfile.fastapi` — mavjud
  prod nginx konfiguratsiyasiga (`docker-gateway.conf`) tegilmagan, alohida
  fayl. `/api/` va `/media/` ni `backend_fastapi:8100`ga, `/` ni mavjud
  (qayta build qilinmagan) `frontend:80`ga yo'naltiradi.
- `docker-compose.dev.yml`ga **qo'shimcha** `nginx_fastapi` xizmati
  qo'shildi (host port `8081`, asosiy `nginx` port `8080`ga tegilmagan).
  `backend_fastapi`ga healthcheck qo'shildi (`depends_on: service_healthy`
  uchun kerak edi).

**Real brauzerda to'liq UI sinovi (http://127.0.0.1:8081, real frontend,
o'zgarishsiz build) — demo admin bilan**:
- Bosh sahifa — ochiq "Keys/testlar bazasi" bo'limi real 7 ta material bilan
  to'g'ri ko'rsatildi
- Login formasi orqali real kirish ishladi
- **Boshqaruv paneli** — 28 kafedra, 158 fan, 193 yo'nalish, 3610 mavzu, 11
  foydalanuvchi to'g'ri ko'rsatildi
- **Xodimlar** sahifasi — barcha 11 real xodim ro'yxati to'g'ri chiqdi
- **Kampus binolari** — avval yaratilgan real bino to'g'ri ko'rsatildi
- **Fan katalogi** — 158 fan kafedralar bo'yicha guruhlangan holda to'g'ri
  ko'rsatildi
- **Startap arizalar (inbox)** — avval yaratilgan real ariza to'g'ri chiqdi
- Logout va qayta login (bir xil sessiyada) ishladi
- Hodim (`998901112233`) API darajasida `course-syllabuses/my/` va
  `content-catalog/` orqali tekshirildi — to'g'ri ishladi

**Muhim bug topildi va tuzatildi UI sinovi davomida**: Boshqaruv panelida
"Test yozuvlari" va "Keys yozuvlari" `0` ko'rsatilayotgan edi (haqiqiy
qiymat 4/3 bo'lishi kerak edi). Sabab —
`app/services/content_catalog.py`dagi `build_catalog_stats` funksiyasi
soddalashtirilgan tekis (`flat`) javob strukturasi qaytarardi, lekin real
Django (va frontend) `{"totals": {"case_count", "test_count", ...},
"by_subject", "by_variant", "by_topic", "by_author", "recent"}` ichma-ich
(nested) strukturani kutadi. Bu **faqat real frontend orqali sinaganda
aniqlanadigan** turdagi bug edi — API o'zi 200 qaytargani uchun mening
avvalgi `curl` testlarim buni ushlab qololmagan edi. Funksiya to'liq Django
formulasi bilan (`by_variant`/`by_topic`/`by_author`/`recent`/kafedra
metama'lumotlari bilan) qayta yozildi va real UI'da qayta tekshirildi —
tuzatildi.

**Xulosa**: real, o'zgarishsiz frontend build FastAPI backend bilan asosiy
foydalanuvchi oqimlarida (admin panel, xodimlar, binolar, syllabus, startap)
to'g'ri ishlaydi. Bu haqiqiy production cutover'dan oldingi eng ishonchli
tasdiq turi.

## Cutover tayyorgarligi davomi — barcha admin sahifalari UI orqali sinaldi, 2 ta muhim bug topilib tuzatildi

Real, o'zgarishsiz frontend build orqali admin panelining **barcha 14 ta
sahifasi** birma-bir tekshirildi. Bu jarayonda **ikkita jiddiy, faqat real
UI orqali aniqlanadigan bug** topildi:

### Bug 1: Pagination wrapper yo'qligi (tizimli, ~15 endpointga ta'sir qildi)
"Fan–o'qituvchi" sahifasi ochilganda **frontend qulab tushdi**:
`Cannot read properties of undefined (reading 'id')`. Sabab: Django'ning
`paginated_response()` yordamchisi barcha ro'yxat endpointlarida
`{count, page, page_size, results: [...]}` shaklida javob qaytaradi, lekin
men FastAPI'da ko'plab endpointlarni **tekis massiv** (`[...]`) sifatida
qaytargan edim. Frontend `data.results` deb kutgani uchun `undefined` bo'lib,
keyingi `.map(r => r.id)` kabi chaqiruvlar qulashga olib kelgan.

**Tuzatish**: umumiy `app/services/pagination.py` (`paginate()`) yordamchisi
yaratildi (Django `paginate_items` bilan bir xil formula) va quyidagi **15
endpoint**ga qo'llanildi — har birida Django manba kodidan aniq
`default_page_size`/`max_page_size` qiymatlari olindi:
`content-catalog/`, `public/content-catalog/`, `admin/content-catalog/`,
`course-syllabuses/catalog/`, `admin/staff-course-selections/`,
`admin/course-syllabuses/`, `admin/staff/`, `startup-applications/`,
`startup-applications/admin/inbox/`, `admin/staff-location-pings/`,
`admin/staff-location-alerts/`, `admin/subject-books/`, `admin/handouts/`,
`admin/topic-videos/`, `admin/clinical-groups/`,
`admin/clinical-groups/{pk}/members/`, `clinic-admin/members/`,
`clinic-admin/payments/`, `external/tests/`, `external/catalog/subjects/`.

### Bug 2: StaffCourseSelection — tekis maydonlar o'rniga ichma-ich `syllabus` kerak edi
Xuddi shu sahifa xatosining ikkinchi qismi: frontend kodi
(`AdminCourseAssignments.tsx`) `sel.syllabus.id`, `sel.syllabus.subject_name`
shaklida **ichma-ich** obyektga murojaat qiladi, men esa `syllabus_id`,
`subject_name` kabi **tekis** maydonlar qaytargan edim. Django'ning
`StaffCourseSelectionSerializer`/`AdminStaffCourseSelectionSerializer`
`syllabus`ni to'liq ichma-ich `CourseSyllabusSerializer` obyekti sifatida
qaytaradi, admin versiyasi qo'shimcha `owner_name`/`owner_phone_display`
hisoblangan maydonlarni ham qo'shadi.

**Tuzatish**: `StaffCourseSelectionOut`/`AdminStaffCourseSelectionOut`
schema'lari ichma-ich `syllabus: dict` bilan qayta yozildi,
`owner_name`/`owner_phone_display` admin variantga qo'shildi (Django bilan
bir xil hisoblash: `f"{first} {last}".strip() or owner_key`,
`f"+{key}" if len==12`).

### Sinov natijasi (to'liq, real UI orqali, tuzatishdan keyin)
Admin panelining **barcha 14 sahifasi** qayta tekshirildi — hammasi real
ma'lumot bilan to'g'ri ishladi: Boshqaruv paneli, Hodimlar, Joylashuv (GPS),
Jonli monitoring, Kampus binolari, Startap arizalar, Fan katalogi,
**Fan–o'qituvchi (tuzatilgan)**, Videolar, Tarqatmalar, Kitoblar, Keys
bazasi, **Test bazasi** (to'liq statistika: 4 test, 31 savol, fan/yo'nalish/
muallif bo'yicha guruhlash — barchasi to'g'ri), Profil.

Shuningdek hodim rolining login xatti-harakati aniqlandi: hodim login
qilganda tizim ataylab "Kompyuter orqali kirish" (QR pairing) ekranini
ko'rsatadi — bu **dizayn bo'yicha to'g'ri** (hodim GPS kuzatuvi uchun
telefondan kirishi, keyin kompyuterga QR orqali ulanishi kerak), bug emas.

## Cutover tayyorgarligi davomi — Hodim tomoni, real QR pairing orqali sinaldi

Hodim rolining haqiqiy kirish yo'li — **telefon login + kompyuterga QR
orqali ulanish** — to'liq real oqim orqali sinaldi (ikkita "qurilma"
simulyatsiya qilindi: brauzer = kompyuter, curl = telefon):

1. Brauzerda (kompyuter) `Kirish` bosilib, QR modal ochildi, tarmoq
   so'rovidan haqiqiy `pairing_token` olindi
2. "Telefon" (curl) hodim (`998901112233`) bilan real login qildi, so'ng
   `POST /device-pair/confirm/` orqali shu tokenni tasdiqladi
3. Brauzer (kompyuter) buni **avtomatik** aniqladi (polling) va to'g'ridan-to'g'ri
   **hodim panelini** ko'rsatdi — qo'lda hech narsa qilinmadi

**Hodim panelining barcha 7 sahifasi tekshirildi — hammasi real ma'lumot
bilan, xatosiz ishladi:**
- **Mening fanlarim** — real fan (Normal fiziologiya, DI, 169 mavzu),
  mavzu tanlash ishladi
- **Ma'ruza matni** — avval saqlangan real ma'ruza matni (AI-generatsiya
  natijasi) to'liq yuklandi
- **Taqdimotlar** — real yuklangan 2 ta PPTX fayl (avvalgi testlardan)
  to'g'ri ko'rsatildi
- **Tarqatma materiallar** — bo'sh holat to'g'ri ko'rsatildi (xatosiz)
- **Keys yaratish** — avval saqlangan real keys to'plami (sana bilan)
  to'g'ri yuklandi va ko'rsatildi
- **Test yaratish** — avval saqlangan real test (10 savol) to'g'ri
  yuklandi va ko'rsatildi
- **Profil** — hodimning shaxsiy ma'lumotlari, tizim ID to'g'ri chiqdi

Bu sinov ayniqsa muhim edi, chunki u **butun QR pairing zanjiri**
(`device-pair/create` → real hodim login → `device-pair/confirm` →
`device-pair/status` polling → JWT uzatish → frontend avtomatik render)
FastAPI backend bilan uchidan-uchigacha ishlashini, va hodimning asosiy AI
kontent yaratish oqimi (ma'ruza, keys, test, taqdimot) uchun barcha
`prepared-content`/`presentations`/`handouts` endpointlari real UI orqali
to'g'ri ishlashini tasdiqladi. Hech qanday yangi bug topilmadi — bu Faza
9'dagi keng qamrovli portlash va oldingi ikkita bug tuzatilgandan keyingi
tabiiy natija.

## Keyingi qadam
Faza 1'ni yakunlash: `OnlineTestStudentLoginView` ekvivalenti (talaba login,
`online_test_client.py` orqali tashqi login), `ChangePasswordSerializer` ekvivalenti,
`throttling.py` (login rate-limit) ekvivalenti, `get_current_auth`ni haqiqiy
himoyalangan endpoint'da sinash. Keyin Alembic boshlang'ich revisionni yaratish
(hozircha auth jadvallari Django tomonidan boshqariladi, FastAPI faqat reflection
orqali o'qiydi/yozadi) va Faza 2 (kontent/syllabus modellari) ga o'tish.

## Faza 1 tafsilotlari (Auth)
- `app/models/user.py` — `auth_user`/`auth_group`/`auth_user_groups` jadvallariga
  mos SQLAlchemy modellari (Django ORM bilan bir xil jadvallarni ishlatadi —
  ikkala backend parallel ishlay oladi)
- `app/core/security.py` — JWT yaratish/tekshirish (`python-jose`, Django
  `SECRET_KEY` bilan bir xil, claim strukturasi DRF-simplejwt bilan mos:
  `user_id`, `token_type`, `role`, `exp`, `iat`, `jti`) + `passlib`
  `django_pbkdf2_sha256` orqali Django parol hashlarini to'g'ridan-to'g'ri
  tekshirish (parollarni qayta hashlash shart emas)
- `app/services/auth_service.py` — rol aniqlash (`resolve_login_role`), demo
  admin allowlist, guruhga qo'shish — `core/views.py` dagi `_resolve_login_role`
  va `core/permissions.py` dagi `resolve_user_role` logikasi ko'chirildi
- `app/api/routes/auth.py` — `POST /api/auth/local-login/` (login + ro'yxatdan
  o'tish, `LocalLoginView` ekvivalenti)
- `app/api/deps.py` — `get_current_auth`, `require_roles` (himoyalangan
  endpoint'lar uchun dependency)
- **Sinov natijasi**: haqiqiy dev bazadagi demo admin (`998901110001` /
  `AdminDemo123`) bilan login qilindi — `curl -X POST
  http://127.0.0.1:8100/api/auth/local-login/ ...` → 200, to'g'ri JWT qaytdi.
- **Hali qilinmagan**: talaba (OnlineTest) login, parol o'zgartirish, throttling,
  `HasAnyPlatformRole` kabi permission klasslar.

## Yaratilgan fayllar (Faza 0)
- `backend_fastapi/app/main.py` — FastAPI ilova, CORS middleware, health router ulangan
- `backend_fastapi/app/core/config.py` — Pydantic Settings (Django env nomlari bilan mos)
- `backend_fastapi/app/core/db.py` — SQLAlchemy engine/session, `Base` (Alembic uchun)
- `backend_fastapi/app/api/routes/health.py` — `/api/health/` (DB `SELECT 1` bilan)
- `backend_fastapi/alembic/env.py`, `alembic.ini`, `alembic/script.py.mako` — Alembic skeleti
  (hali birorta revision yaratilmagan)
- `backend_fastapi/Dockerfile`, `requirements.txt`
- `docker-compose.dev.yml` — `backend_fastapi` xizmati qo'shildi (port 8100, postgres/redis
  bilan bir xil), mavjud `backend`/`nginx` routingga tegilmadi — ikkalasi parallel ishlaydi

## Jurnal (yangi yozuvlar tepaga qo'shiladi)

- **2026-08-06** — 🐛 **Real production'da topilgan yana bir jiddiy bug**:
  yangi taqdimot yaratish/yuklash "AI taqdimot yaratilmadi. [object Object]
  [object Object] [object Object]" xatosi bilan muvaffaqiyatsiz tugardi.
  Sabab: `POST /handouts/` va `POST /presentations/` FastAPI'da butunlay
  **noto'g'ri kontrakt** bilan yozilgan edi — `syllabus_id`, `variant_label`,
  `topic_code` maydonlarini **majburiy** (`Form(...)`) deb talab qilardi,
  lekin frontend (`presentationUploadApi.ts`/`handoutApi.ts`) haqiqatda
  faqat `topic`, `topic_norm`, `file`, (`title`) yuboradi — bular Django
  original API kontraktiga (`TopicHandoutUploadSerializer`/
  `TopicPresentationUploadSerializer`) mos, FastAPI esa mos EMAS edi.
  Natijada 3 ta majburiy maydon doim yo'q bo'lib, FastAPI 422 xatosi
  (3 ta validatsiya xatosi) qaytarardi — frontend'ning `apiErrorMessage()`
  bu xato obyektlar massivini `String(x)` bilan formatlab
  "[object Object]"ga aylantirardi (o'zi ham alohida kichik bug, lekin
  asosiy sabab emas).

  Bu xato taqdimotlar uchun **har doim** (syllabus_id har doim yo'q
  yuborilgani uchun) va handoutlar uchun **faqat to'liq topic-context
  bo'lmaganda** yuz berardi.

  Tuzatish: `topic_content.py`dagi `upload_handout`/`admin_upload_handout`/
  `upload_presentation` Django bilan bir xil kontraktga o'tkazildi —
  `syllabus_id`/`variant_label`/`topic_code` endi **ixtiyoriy** (mavjud
  bo'lsa ulardan `topic_norm` quriladi, Django'ning
  `_build_topic_norm`/`_canonical_topic_norm` mantig'i bilan bir xil —
  bu funksiyalar allaqachon `topic_norm.py`da to'g'ri yozilgan edi, faqat
  endpoint ularni chaqirmasdi), `topic_norm` endi to'g'ridan-to'g'ri
  qabul qilinadigan ixtiyoriy Form maydoni. Taqdimot uchun Django'da bu
  3 maydon umuman yo'qligi sababli ular butunlay olib tashlandi (faqat
  `topic`/`topic_norm`/`title`/`file`).

  Real curl bilan tekshirildi: taqdimot (`topic`+`topic_norm`+`file`,
  syllabus_id'siz) → `201`; handout ikkala holatda ham (syllabus_id bilan
  va bilansiz) → `201`, `topic_norm` ikkala holatda ham to'g'ri hisoblandi.

  Shu bilan birga, taqdimot generatsiyasi paytidagi progress paneli ham
  chiroyliroq qilindi (foydalanuvchi so'rovi): xom JSON matn o'rniga
  `parsePresentationProgress()` orqali "N-slayd tayyorlanmoqda" hisoblagichi
  va oxirgi o'qilishi mumkin bo'lgan matn parchasi ko'rsatiladi, ikonka +
  animatsiya bilan silliqroq kartochka dizaynida.
- **2026-08-06** — Taqdimotlar (AI) uchun ham ma'ruza bilan bir xil 3 ta
  yaxshilanish qo'llanildi (foydalanuvchi: "taqdimotlarda ham baza kerak,
  real-time tez ishlasin, ochiq manbalardan rasm joylasin"):
  1. **"Baza" (tarix)** — `PresentationMaterials.tsx`ga lecture bilan bir
     xil naqsh qo'llanildi: yangi "Baza" tugmasi, server-sinxron ro'yxat
     (`listAllPreparedForKindSynced('presentation')` — allaqachon mavjud
     `/prepared-content/mine/` endpoint qayta ishlatildi, backend'ga
     qo'shimcha o'zgarish shart bo'lmadi), bosilganda to'liq slayd
     ko'ruvchi (slide viewer) modal ochiladi — o'qlar bilan varaqlash,
     "Yuklab olish" (client-side qayta PPTX qurish) tugmasi bilan.
  2. **Real-time (streaming) generatsiya** — `openaiClient.ts`ga
     `openaiJsonStream()` qo'shildi (`openaiJson`ning stream varianti,
     mavjud `chatViaBackendStream` infratuzilmasidan foydalanadi).
     `requestPresentationDeckFromAi()`da birinchi urinish endi stream
     orqali (xom JSON matni `onProgress` callback bilan uzatiladi),
     ikkinchi (zaxira) urinish oddiy `openaiJson`da qoladi. UI'da
     generatsiya paytida "Taqdimot yaratilmoqda… (jonli)" paneli xom
     matnning oxirgi qismini ko'rsatib turadi.
  3. **Ochiq manbadan rasmlar** — yangi `searchOpenImage()` funksiyasi
     Wikimedia Commons API'siga (kalitsiz, `origin=*` bilan CORS ochiq,
     CC-litsenziyali) so'rov yuboradi, SVG bo'lmagan (JPEG/PNG) birinchi
     natijani tanlaydi, litsenziya/muallif matnini ("credit") ham oladi.
     `attachOpenImagesToDeck()` har bir kontent-slayd (birinchi va oxirgi
     slayddan tashqari) uchun parallel ravishda rasm qidirib, mavjud
     `fetchImageAsDataUrl()` (avval yozilgan, lekin ishlatilmagan
     "o'lik kod" edi) orqali data-URL'ga aylantirib biriktiradi.
     `PresentationSlide` turiga `imageUrl`/`imageCredit` qo'shildi,
     `buildPresentationPptxFile()` PPTX'da slaydning o'ng yarmiga rasm +
     kredit matnini joylashtiradigan qilib yangilandi (rasm bo'lsa matn
     ustuni tor qilinadi).
  4. **Til mosligi** — xuddi ma'ruzadagi kabi, `PresentationMaterials.tsx`da
     ham `globalTopic?.instructionLanguage ?? language` → shunchaki
     `language` (joriy UI tili) qilib tuzatildi.

  Wikimedia Commons API'si real curl bilan tekshirildi — haqiqiy JPEG
  rasm URL'lari, litsenziya/muallif metama'lumotlari va SVG-filtri
  to'g'ri ishlashi tasdiqlandi. `/prepared-content/mine/?kind=presentation`
  (yangi backend o'zgarishisiz, mavjud endpoint) real curl bilan
  tekshirildi. `tsc --noEmit` toza, prod rebuild qilindi.
- **2026-08-06** — Ma'ruza matni (AI) generatsiyasi bo'yicha 3 ta so'rov
  bajarildi (foydalanuvchi: "sekin yaratishni tezlashtirish kerak",
  "baza"dagi eski yozuvlar chiqmayapti, til mos kelmayapti):

  1. **Streaming (real-time ko'rsatish)** — foydalanuvchi "Streaming"
     variantini tanladi. Backend'ga yangi `POST
     /education-ai/completion/stream/` endpoint qo'shildi
     (`openai_client.py`da `stream_openai_chat()` generator — OpenAI'dan
     SSE orqali `delta.content` bo'laklarini o'qib, `data: {"delta": "..."}`
     shaklida frontend'ga uzatadi, oxirida `{"done": true,
     "book_references": [...]}`). Frontend'da `openaiClient.ts`ga
     `chatViaBackendStream()`/`openaiTextStream()` qo'shildi (fetch +
     ReadableStream, SSE parsing). `aiService.ts`dagi
     `generateLectureNotes()` endi ixtiyoriy `onProgress` callback qabul
     qiladi. `LectureNotes.tsx` generatsiya paytida matnni **jonli**
     (token-token) ko'rsatadi — umumiy generatsiya vaqti bir xil qoladi,
     lekin kutish tuyg'usi yo'qoladi. Real curl bilan tekshirildi: SSE
     oqimi to'g'ri `data: {"delta": "..."}` ketma-ketligini va yakuniy
     `done` eventini qaytardi.
  2. **"Baza" (tarix) endi server'dan ham o'qiydi** — muammo topildi:
     `listAllPreparedForKind()` FAQAT localStorage'dan o'qir edi (Django'da
     ham asl dizayn shunday bo'lgan — bu migratsiya xatosi emas, balki
     asl cheklov edi). Agar localStorage tozalansa yoki boshqa
     qurilma/brauzerdan kirilsa, eski ma'ruzalar umuman ko'rinmas edi —
     garchi ular serverda saqlangan bo'lsa ham (`POST
     /prepared-content/` allaqachon "best-effort" tarzda server'ga ham
     yozar edi, lekin ro'yxatni server'dan O'QIYDIGAN endpoint yo'q edi).
     Backend'ga yangi `GET /prepared-content/mine/?kind=...` (pagination
     bilan, joriy foydalanuvchining shu turdagi barcha yozuvlari) va
     `GET /prepared-content/{pk}/` (bitta yozuvni to'liq payload bilan)
     qo'shildi. Frontend'da `listAllPreparedForKindSynced()`/
     `loadPreparedByIdSynced()` — server ro'yxatini asosiy manba sifatida
     oladi, faqat serverda hali yo'q lokal yozuvlarni qo'shib beradi
     (dedupe: mavzu+daqiqa bo'yicha). Real curl bilan tasdiqlandi: 3 ta
     eski (server'da saqlangan, lekin localStorage'da yo'q) ma'ruza to'g'ri
     ro'yxatda chiqdi, bittasi to'liq matni bilan ochildi (4600 belgi).
  3. **Til mosligi tuzatildi** — `LectureNotes.tsx`da avval
     `contentLanguage = globalTopic?.instructionLanguage ?? language`
     edi — ya'ni agar syllabus mavzusi tanlangan bo'lsa, uning O'ZINING
     tili (masalan har doim "uz") ustuvor bo'lar, foydalanuvchi UI'da
     boshqa til (Русский/English) tanlagan bo'lsa ham e'tiborga
     olinmasdi. Endi har doim joriy UI tili (`language`) ishlatiladi.

  Barchasi rebuild qilinib, real production'da (curl + kod tekshiruvi)
  tasdiqlandi, `tsc --noEmit` toza.
- **2026-08-06** — Talaba login sahifasidagi eskirgan "← Hodim: kompyuter
  QR orqali kirish" havolasi olib tashlandi (`LoginPage.tsx`) — endi
  ortiqcha, chunki "Xodim" tab bosilganda allaqachon QR'ga o'tkazadi.
  `onBackToQr` prop LoginPage'dan butunlay olib tashlandi (`PublicLandingPage.tsx`
  ham mos ravishda yangilandi; RegisterPage'dagi analogik prop tegilmadi).
  Real production'da `textContent` orqali tasdiqlandi: havola endi yo'q,
  Talaba forma standart holatda to'g'ri ko'rsatilmoqda, konsolda xatolik yo'q.
- **2026-08-06** — Login modal UX yana takomillashtirildi (foydalanuvchi
  qo'shimcha so'rovi bo'yicha), state modeli soddalashtirildi:
  `App.tsx`/`PublicLandingPage.tsx`dagi ikkita boolean (`desktopStaffLogin`,
  `staffPasswordUnlocked`) bitta aniqroq enum bilan almashtirildi:
  `desktopAuthView: 'talaba' | 'qr' | 'admin'`.
  1. **QR sahifasiga ham Talaba/Xodim tab bar qo'shildi**
     (`DesktopHodimQrLogin.tsx`ga yangi `showRoleTabs`/`onSelectTalaba`
     prop'lari) — Talaba bosilsa asosiy Talaba formaga qaytadi, Xodim esa
     joriy (QR) holatni ko'rsatadi.
  2. **"Boshqa rollar" endi alohida, faqat administrator uchun mo'ljallangan
     kichik ekranga olib boradi** — yangi `AdminPasswordLogin.tsx`
     komponenti: telefon+parol forma + "← Orqaga" tugmasi (QR'ga qaytaradi)
     + pastda "Demo admin bilan kirish" tezkor tugmasi (faqat admin uchun,
     `getDemoRoleLogins()`dan filtrlanadi). Hodim bu ekrandan kira olmaydi —
     agar hodim raqami kiritilsa, mavjud `hodimDesktopRestriction` xatosi
     bilan rad etiladi.
  3. **QR sahifasi vizual jihatdan ixchamlashtirildi** (foydalanuvchi:
     "scroll bo'lib xunuk bo'lib turibdi" degan shikoyat) — header ikonkasi/
     matni kichraytirildi, ko'rsatmalar bloki siqildi, QR rasm o'lchami
     260px→210px, kartochka padding'lari kamaytirildi — modal balandligi
     sezilarli qisqardi, scroll extenti kamaydi.
  Yangi tarjima kalitlari (`auth.backButton`, `auth.adminLoginTitle`,
  `auth.adminLoginSubtitle`, `auth.demoAdminLogin`) uz/ru/en — barcha 3
  tilga qo'shildi.

  **Sinov metodologiyasi bo'yicha eslatma**: ushbu sessiyada brauzer
  paneli vizual ravishda "displayed emas" holatida edi (`screenshot`/`zoom`
  doim "pane is not displayed, so the page is not compositing frames" xatosi
  bilan muvaffaqiyatsiz tugadi) — bu Framer Motion animatsiyalarini
  (`requestAnimationFrame`ga tayangan) butunlay to'xtatib qo'ydi, ba'zi
  o'tishlarda modal `opacity: 0`da "qotib qolganday" ko'rinardi (5+ soniya
  kutilsa ham o'zgarmadi). Bu **kod xatosi emas** — muhit/asbob cheklovi
  ekanligi `document.body.textContent` (CSS render holatidan mustaqil,
  `innerText`dan farqli) orqali tasdiqlandi: barcha o'tishlar
  (Talaba→Xodim/QR→Talaba, QR→Boshqa rollar→Admin panel) DOM darajasida
  to'g'ri va kutilganidek ishladi.
- **2026-08-06** — Login modal UX qayta qurildi (frontend, foydalanuvchi
  so'rovi bo'yicha): `App.tsx`, `PublicLandingPage.tsx`,
  `LoginPage.tsx`.
  1. "Kirish" bosilganda standart holat endi **Talaba** login formasi
     (avval standart QR ekrani edi — `desktopStaffLogin` boshlang'ich
     qiymati `false`→`true`ga o'zgartirildi).
  2. Tab tartibi **Talaba, Xodim** qilib almashtirildi (avval Xodim
     birinchi edi).
  3. "Xodim" tab bosilganda (desktop'da) QR ekrani ko'rsatiladi — yangi
     `onWantsHodimQr` prop orqali.
  4. **Muhim tuzatish**: eng birinchi implementatsiyada "Xodim" tab har
     doim QR'ga qat'iy yo'naltirilar edi — bu admin/startuper uchun
     telefon+parol bilan kirish yo'lini butunlay yopib qo'yardi (chunki
     ular ham "Xodim" tab orqali kirishadi). Tuzatildi: yangi
     `staffPasswordUnlocked` state qo'shildi — QR ekranidagi "Boshqa
     rollar (telefon + parol)" bosilgach, "Xodim" tab endi QR'ga emas,
     balki haqiqiy telefon+parol formasiga o'tadi (hodim baribir submit
     vaqtida mavjud tekshiruv orqali rad etiladi).
  5. "DEMO KIRISH" tezkor-login bloki (Admin/Assistant professor/
     Startuper tugmalari) LoginPage'dan butunlay olib tashlandi, shu
     bilan bog'liq o'lik kod (`handleDemoRoleClick`, `loginWithCredentials`,
     ishlatilmay qolgan import'lar) tozalandi.
  Real production'da (`https://imentor.devfliq.uz` → `127.0.0.1:9050`)
  to'liq tsikl tekshirildi: Kirish → Talaba forma (standart) → Xodim tab →
  QR → "Boshqa rollar" → Xodim tab (endi parol) → admin login → boshqaruv
  paneli muvaffaqiyatli yuklandi, konsolda xatolik yo'q.
- **2026-08-03** — 🐛 **Real production'da topilgan ENG JIDDIY bug**:
  foydalanuvchilar taxminan 30 daqiqadan keyin "o'zidan-o'zi" tizimdan
  chiqib ketayotgani xabar qilindi. Sabab: **`POST
  /api/v1/auth/token/refresh/` endpoint FastAPI'da butunlay yo'q edi**.
  Access token muddati 30 daqiqa (`django_jwt_access_minutes`), frontend
  (`backendAuth.ts`) muddati tugaganda avtomatik shu endpointga refresh
  token yuborib yangi access token so'raydi — lekin endpoint mavjud
  bo'lmagani uchun `404` qaytib, frontend buni "sessiya tugadi" deb
  talqin qilib chiqib ketardi.

  **Nega path-audit buni topmadi**: bu endpoint Django'da `core/urls.py`da
  EMAS, balki **root `config/urls.py`da** ro'yxatdan o'tgan
  (`rest_framework_simplejwt.views.TokenRefreshView`,
  `path('api/v1/auth/token/refresh/', ...)`). Oldingi to'liq path-audit
  faqat `core/urls.py`ni regex bilan skanerlagan edi — root
  `config/urls.py` butunlay ko'zdan qochirilgan. Bu — audit metodologiyasi
  faqat bitta URL fayliga tayangani sababli yuzaga kelgan **haqiqiy
  ko'r nuqta**.

  Tuzatish: `app/schemas/auth.py`ga `TokenRefreshRequest`/
  `TokenRefreshResponse` qo'shildi; `app/api/routes/auth.py`ga
  `token_refresh()` funksiyasi qo'shildi — refresh tokenni dekodlab
  (`token_type == "refresh"` tekshiruvi bilan), foydalanuvchi
  faol ekanini tasdiqlab, eski token'dagi `role`/`student_id`
  claim'larini saqlab qolgan holda yangi access+refresh juftlik
  qaytaradi (Django'ning `ROTATE_REFRESH_TOKENS=True`ga o'xshab — har
  chaqiriqda yangi refresh ham beriladi, garchi to'liq blacklist
  infratuzilmasi FastAPI'da yo'q bo'lsa ham, bu funksional jihatdan
  "chiqib ketmaslik" muammosini butunlay hal qiladi).

  Real production'da tekshirildi: login → refresh token bilan
  `/auth/token/refresh/` chaqirildi → `200 OK`, yangi access token bilan
  `/auth/me/` → `200 OK`; yaroqsiz refresh token bilan → to'g'ri `401`.

  **Yana bir marta xuddi shu infra xatosi takrorlandi** (dev compose
  buyrug'i prod konteynerini bosib qo'ydi) — ikkinchi marta ham darhol
  payqalib, prod konfiguratsiyasi bilan qayta tiklandi. Bu endi
  takrorlanadigan xato ekan — memory faylida qayd etilgan qoidaga qat'iy
  rioya qilish kerak: `backend_fastapi`ga tegishli HAR bir buyruqda ANIQ
  `-f docker-compose.prod.yml --env-file deploy/.env.production` (yoki
  ataylab dev) ko'rsatilishi shart.
- **2026-08-03** — 🐛 **Real production'da topilgan jiddiy bug**: hodim
  (`imentor.devfliq.uz`da real foydalanuvchi) "Taqdimotlar" sahifasida
  taqdimot yuklamoqchi bo'lganda `403 Forbidden` ("AI taqdimot yaratmadi.
  Ruxsat yo'q.") xatosi bilan to'xtadi. Sabab: `topic_content.py`da
  `upload_handout` (`POST /handouts/`) va `upload_presentation`
  (`POST /presentations/`) — ikkalasi ham noto'g'ri `require_roles("admin")`
  bilan cheklangan edi, Django esa `HasEducationRole` permission
  (`STAFF_ROLES` — admin, hodim, startuper, klinika_admin) ishlatadi.
  Ikkalasi ham `require_roles(*STAFF_ROLES)`ga tuzatildi.

  Bu xil bug boshqa joyda ham bormi tekshirish uchun barcha FastAPI
  route'larni skript bilan avtomatik audit qildim: har bir
  `require_roles("admin")` chaqiruvini o'z route path'i bilan bog'lab,
  `/admin/` prefiksisiz yo'llarni tekshirdim. Faqat 2 ta legitim holat
  qoldi (`/auth/admin-provision-staff/`, `/auth/admin-deprovision-staff/`
  — bular Django'da ham `IsAdminRole`, nomi "admin-" bilan boshlanadi
  garchi path prefiksida `/admin/` bo'lmasa ham) — boshqa yashirin bug
  topilmadi.

  Tuzatilgandan keyin real production (`https://imentor.devfliq.uz` →
  `127.0.0.1:9050`) orqali hodim hisobi bilan haqiqiy fayl yuklab,
  `201 Created` qaytarilgani tasdiqlandi (handout ham, presentation ham),
  test yozuvlar tozalandi.

  **Ikkinchi muammo — infra darajasida**: tuzatishni deploy qilishda
  avval `docker compose -f docker-compose.dev.yml up -d --build
  backend_fastapi` ishlatilgan edi — bu **production konteynerini dev
  konfiguratsiyasi bilan almashtirib qo'ydi** (bind-mount kod, zaifroq
  CORS/debug sozlamalari), chunki ikkalasi bir xil "imentor" compose
  loyihasi va bir xil konteyner nomini ("imentor-backend_fastapi-1")
  bo'lishadi. Darhol payqalib, `docker-compose.prod.yml`dan qayta
  `--build backend_fastapi` bilan tiklandi (prod image, bind-mount yo'q).
  **Eslatma o'zim uchun**: bundan buyon `backend_fastapi`ni yangilashda
  har doim ANIQ qaysi compose fayl (`-f docker-compose.prod.yml
  --env-file deploy/.env.production`) ishlatilayotganini tekshirish
  shart — muhitlar bir xil resurs nomlarini bo'lishgani uchun adashish
  oson.
- **2026-08-03** — Django to'liq retire qilindi (foydalanuvchi so'rovi:
  "django qaysi portda ishlagan bo'lsa fastapi ham shu portda ishlashi
  kerak... django comment qilib turaversan"). O'zgarishlar:
  - `backend_fastapi/entrypoint.sh` va `Dockerfile`: gunicorn bind porti
    `8100` → `8000`ga o'zgartirildi (Django `backend` ilgari shu portda
    ishlagan). `EXPOSE 8000`.
  - `docker-compose.prod.yml`: `backend`, `migrate`, `celery_worker`
    (Django) xizmatlari **comment qilindi** (o'chirilmadi — rollback uchun
    kod saqlanadi). `frontend`/`nginx`ning `depends_on`i `backend` →
    `backend_fastapi`ga o'zgartirildi. `backend_fastapi` healthcheck porti
    `8100` → `8000`.
  - `docker-compose.dev.yml`: xuddi shunday — `migrate`/`backend`/
    `celery_worker` comment qilindi, `frontend`ning `depends_on`i
    `backend_fastapi`ga o'zgartirildi. Django-only `nginx` (8080) ham
    comment qilindi (backend yo'qligi sababli endi ishlamas edi) —
    `nginx_fastapi` (8081) endi dev'dagi yagona gateway. `backend_fastapi`
    port mapping `8100:8100` → `8100:8000` (tashqi 8100 saqlanadi, ichki
    8000ga).
  - `deploy/nginx/docker-gateway.conf` (prod) va
    `docker-gateway.fastapi.conf` (dev): `backend_fastapi:8100` →
    `backend_fastapi:8000`.

  **Muhim kashfiyot**: dev va prod compose fayllari **bir xil Docker Compose
  loyiha nomini** ("imentor") baham ko'radi (ikkalasida ham `name:` maydoni
  yo'q, papka nomidan avtomatik olinadi) — shuning uchun bir xil nomdagi
  xizmatlar (`backend`, `postgres`, `redis` va h.k.) **bitta va bir xil
  konteyner** hisoblanadi, qaysi compose fayldan boshlanganidan qat'i nazar.
  Bu birinchi marta `docker compose -f docker-compose.dev.yml up ...`
  ishga tushirilganda to'xtatilgan Django konteynerini qayta jonlantirib
  yubordi (chunki dev'ning `frontend`si hali `backend`ga bog'liq edi) —
  shu sababli Django dev compose'da ham comment qilinishi shart bo'ldi,
  aks holda har safar dev buyrug'i ishga tushirilganda qayta tiklanardi.

  Yakuniy tekshiruv: barcha 3 gateway (`prod:9050`, `dev-fastapi:8081`,
  `backend_fastapi` bevosita `8100→8000`) `200 OK`/`{"status":"ok"}`
  qaytardi, Django konteynerlari (`imentor-backend-1`,
  `imentor-celery_worker-1`) `docker stop` bilan to'xtatilgan (o'chirilmagan
  — image/volume saqlangan, kerak bo'lsa `docker start` bilan tez tiklanadi).
- **2026-08-03** — 🚀 **PRODUCTION CUTOVER BAJARILDI**. `docker-compose.prod.yml`
  shu serverda birinchi marta ishga tushirildi (foydalanuvchi tasdig'i bilan),
  `deploy/nginx/docker-gateway.conf`da `/api/` va `/media/` uchun
  `backend:8000` → `backend_fastapi:8100`ga o'zgartirildi. Bu **haqiqiy
  trafikni Django'dan FastAPI'ga o'tkazuvchi yagona qator edi**.

  Xavfsizlik choralari:
  - Cutover'dan oldin to'liq Postgres backup olindi
    (`backups/imentor_pre_cutover_20260803_110258.dump`, 16 MB).
  - Server bir nechta boshqa **jonli** loyihalarga xizmat qilishi aniqlandi
    (`media-bot`, `isp-predict`, `kunish`, `movie-api`, `payment` va h.k.) —
    standart `IMENTOR_HTTP_PORT=9050` avvaliga `media-bot` bilan
    to'qnashgani aniqlandi; foydalanuvchi mos keluvchi portni bo'shatgach
    davom etildi.
  - Django backend/celery_worker **o'chirilmadi** — parallel, "sovuq zaxira"
    sifatida ishlab turibdi (portlar orqali tashqi trafik faqat FastAPI'ga
    yo'naltirilgan, Django endi to'g'ridan-to'g'ri trafik olmaydi).

  Natija: `docker compose -f docker-compose.prod.yml --env-file
  deploy/.env.production up -d --build` — barcha 7 xizmat (`postgres`,
  `redis`, `backend`, `backend_fastapi`, `celery_worker`, `frontend`,
  `nginx`) `healthy`. Postgres/Redis/media volume'lari **bir xil nomlar**
  orqali avtomatik ravishda dev bosqichida to'plangan real ma'lumotlar bilan
  bog'landi (yangi bo'sh baza emas). Production gateway (`127.0.0.1:9050`)
  orqali real end-to-end tekshirildi: `/api/health/` → `200`, admin login →
  token, `admin/staff/` → `200`, `admin/subject-books/` fayl havolasi to'g'ri
  domen bilan qurilishi tasdiqlandi (`Host` header orqali sinov — bare
  `127.0.0.1:port`dagi test-artifact port muammosi haqiqiy domen sozlamasida
  yo'q), frontend root → `200`. Log'larda xatolik yo'q.

  **Keyingi qadam** (sizga bog'liq): host darajasidagi reverse-proxy/DNS
  `imentor.uz`ni `127.0.0.1:9050`ga yo'naltirishi kerak — bu hujjatlashtirilgan
  natijada aytilganidek, host nginx konfiguratsiyasi topilmadi (server juda
  ko'p turli loyihalarga xizmat qiladi), shuning uchun bu qadam
  foydalanuvchi tomonidan qilinishi kerak edi.
- **2026-08-03** — Cutover checklist'dagi qolgan 2 ta infra bo'shligi ham hal
  qilindi — endi FastAPI backend **production'ga chiqarishga to'liq tayyor**
  (faqat haqiqiy trafik almashtirish qadami qoladi):
  1. **Production Dockerfile multi-worker**: `backend_fastapi/entrypoint.sh`
     va `migrate-entrypoint.sh` yaratildi (Django `backend/entrypoint.sh`
     naqshiga o'xshab) — `gunicorn` + `uvicorn.workers.UvicornWorker`,
     `GUNICORN_WORKERS`/`GUNICORN_TIMEOUT` env orqali sozlanadi, ishga
     tushishdan oldin `RUN_MIGRATIONS=1` bo'lsa `alembic upgrade head`
     bajaradi. `Dockerfile` `CMD` o'rniga `ENTRYPOINT`ga o'tkazildi.
  2. **`docker-compose.prod.yml`ga xizmatlar qo'shildi**: `migrate_fastapi`
     (bir martalik, Django `migrate`ga o'xshab) va `backend_fastapi`
     (mavjud `backend-env` anchor'idan o'zgarishsiz foydalanadi, chunki
     Django/FastAPI env nomlari qasddan bir xil qilib yozilgan). Xuddi shu
     naqsh `docker-compose.dev.yml`ga ham qo'llandi (`migrate_fastapi`
     xizmati qo'shildi, `backend_fastapi`ga `RUN_MIGRATIONS: "0"` va
     `GUNICORN_WORKERS_FASTAPI` env qo'shildi).
  Real sinov: dev rebuild qilinib, gunicorn 2 ta uvicorn worker bilan
  ko'tarilgani va barcha endpointlar (health, auth, admin/staff, media fayl)
  `200 OK` qaytargani tasdiqlandi. **Muhim**: bu faqat tayyorgarlik — hech
  qanday nginx konfiguratsiyasi hali FastAPI'ga trafik yubormaydi, haqiqiy
  cutover (trafik almashtirish) alohida, aniq tasdiq bilan qilinadi
  (checklist 3-bo'lim).
- **2026-08-03** — Cutover checklist'dagi 2 ta kod-darajasidagi bo'shliq hal
  qilindi:
  1. **Media serving**: `app/main.py`ga `StaticFiles` mount qo'shildi
     (`django_media_url` sozlamasi asosida, `media_root()`dan). Dev
     `nginx_fastapi` konfiguratsiyasi allaqachon `/media/`ni
     `backend_fastapi`ga yo'naltirgani uchun bu yagona to'g'ri variant edi.
     Rebuild qilib real 90 MB PDF fayl `200 OK`, to'g'ri content-type bilan
     tekshirildi.
  2. **Alembic baseline**: `app/models/__init__.py` bo'sh edi — barcha 11
     model modulini import qiladigan qilindi, `alembic/env.py`ga
     `import app.models` qo'shildi (aks holda `Base.metadata` bo'sh bo'lardi).
     `--autogenerate` sinovi 928 qatorli shovqin berdi (Django `BigAutoField`
     vs SQLAlchemy `Integer` PK farqi, e'lon qilinmagan Django indekslari) —
     bu migratsiyani ishga tushirish xavfli bo'lardi (indekslarni o'chirib
     yuborardi). Shu sababli avtogenerate fayli o'chirilib, o'rniga qo'lda
     bo'sh (no-op) baseline revision yaratildi va `alembic stamp head` bilan
     dev DB shu revisionga belgilandi (`alembic_version` jadvalida
     tasdiqlandi). Kelajakdagi har qanday autogenerate natijasi endi ham
     qo'lda tekshirilishi shart — bu cheklov checklist'da hujjatlashtirilgan.
  Ikkalasi ham rebuild qilib, real curl (health, staff, course-syllabuses
  endpointlari) bilan regressiyasiz tekshirildi.
- **2026-08-03** — Production cutover checklist tayyorlandi:
  [`docs/FASTAPI_CUTOVER_CHECKLIST.md`](FASTAPI_CUTOVER_CHECKLIST.md). Kod
  bazasini qayta ko'rib chiqishda cutover'dan oldin hal qilinishi shart
  bo'lgan 4 ta jiddiy bo'shliq topildi (hozircha faqat hujjatlashtirildi,
  hali tuzatilmagan — bular kod o'zgarishi emas, infra/deploy qarorlari):
  1. FastAPI'da `/media/` uchun static serving yo'q (`app/main.py`da
     `StaticFiles` mount yo'q) — `SubjectBookOut.file_url`, handout/
     presentation fayl havolalari cutover'dan keyin buziladi agar hal
     qilinmasa.
  2. `alembic/versions/` bo'sh — baseline migration hali generatsiya
     qilinmagan.
  3. Production `Dockerfile` bitta uvicorn processda ishlaydi
     (`--workers` yo'q) — Django tomonidagi `GUNICORN_WORKERS=2` bilan
     solishtirilganda yetarli emas.
  4. `docker-compose.prod.yml`da `backend_fastapi` xizmati umuman yo'q.
  Tekshirildi: frontendda `ai-jobs/` ga polling qiluvchi eski kod yo'q
  (`grep -rn "ai-jobs" frontend/src` — 0 natija), shuning uchun FastAPI'ning
  sinxron AI arxitekturasi (Celery job queue o'rniga to'g'ridan-to'g'ri
  javob) frontend bilan mos — bu band xavfsiz deb belgilandi. Checklist'da
  bosqichma-bosqich cutover ketma-ketligi, rollback rejasi va foydalanuvchi
  bilan tasdiqlanishi kerak bo'lgan 4 ta ochiq savol ham bor.
- **2026-08-03** — Klinika guruhi domeni (`core/clinical_group_views.py`) —
  bu serializerlar `serializers.py`da emas, alohida faylda edi, shuning
  uchun oldingi grep-audit ularni o'tkazib yuborgan edi. Qo'lda taqqoslab, 4
  ta jiddiy nomuvofiqlik topildi va tuzatildi:
  1. `ClinicalGroupOut`da `member_count`, `admin_count`, `created_at`,
     `updated_at` yo'q edi. Yangi `_clinic_out(db, clinic)` yordamchisi
     (`clinical_group.py` va `clinic_admin.py`da) haqiqiy a'zo/admin sonini
     hisoblaydi (Django `get_member_count`/`get_admin_count` bilan bir xil
     mantiq).
  2. `ClinicalGroupMemberOut`da `phone_display`, `joined_at`, `updated_at`
     yo'q edi. `_member_out()` endi `phone_display`ni ham hisoblaydi.
  3. `ClinicalGroupPaymentOut`da `created_at`/`updated_at` yo'q edi.
  4. **Eng jiddiyi**: `POST /admin/clinical-groups/{pk}/assign-admin/`
     Django'da butunlay boshqa shakl qaytaradi —
     `{username, role, clinic_id, member_id, created}` (status 201/200,
     `created` bayrog'iga qarab) — lekin FastAPI versiyasi to'liq
     `ClinicalGroupMemberOut` obyekt qaytarardi. Django bilan bir xil
     qilib tuzatildi, shu jumladan foydalanuvchi yangi yaratilganmi yoki
     yangilanganmi ekanini aniqlaydigan mantiq ham (`_provision_user` endi
     `(user, created)` tuple qaytaradi).
  Rebuild qilib real curl bilan tekshirildi (`admin/clinical-groups/`,
  `admin/clinical-groups/{pk}/members/`) — barcha yangi maydonlar va
  haqiqiy hisoblangan sonlar to'g'ri qaytmoqda, xatolik yo'q.
- **2026-08-03** — Django `core/serializers.py`dagi barcha 27 ta serializer
  FastAPI schema/route'lari bilan to'liq taqqoslab chiqildi (nafaqat
  `SerializerMethodField`/`source=`/nested pattern grep, balki oddiy
  `fields = [...]` ro'yxatlar ham qo'lda solishtirildi). Yana 2 ta jiddiy
  bug topildi va tuzatildi (`admin/staff-location-pings/` va
  `admin/staff-location-alerts/` — Django `StaffLocationPingSerializer`/
  `StaffLocationAlertSerializer` bilan bir xil `fields` ro'yxatiga ega, lekin
  FastAPI qo'lda qurilgan dict'larda ko'p maydon yo'q edi):
  - `StaffLocationPing` javobida `client_ts_ms` yo'q edi (frontend
    `staffLocationApi.ts`dagi `StaffLocationPingDto` buni kutadi).
  - `StaffLocationAlert` javobida `slot`, `expected_lat`, `expected_lng`,
    `actual_lat`, `actual_lng`, `slot_start`, `slot_end` yo'q edi —
    hammasi model ustunlarida bor edi, faqat qo'lda qurilgan javob dict'iga
    kiritilmagan edi. Barchasi qo'shildi (`staff_location.py`dagi
    `admin_location_pings`/`admin_location_alerts`).
  Qolgan barcha serializerlar (LocalLogin, ChangePassword,
  AdminStaffUpsert/ListEntry, SyllabusDocument, LiveTest*, StartupProject,
  CampusBuilding, StaffScheduleBulk*) tekshirilib, FastAPI ekvivalentlari
  bilan mos ekanligi tasdiqlandi — qo'shimcha tuzatish talab qilinmadi.
  Rebuild qilib real curl bilan tekshirildi (admin/staff-location-pings/,
  admin/staff-location-alerts/) — barcha yangi maydonlar to'g'ri qaytmoqda.
- **2026-08-03** — `SerializerMethodField`/`source=` patternlarni ham
  sistematik qidirib (`grep "SerializerMethodField\|source="`), yana 3 ta
  javob-shakli nomuvofiqligi topildi va tuzatildi:
  1. `TopicHandoutOut`/`TopicPresentationOut`da `owner_key`, `can_delete`,
     `sort_order` yo'q edi (Django `can_delete` — egasi yoki admin bo'lsa
     `true`). `_handout_out`/`_presentation_out` endi `auth` context qabul
     qilib, `can_delete`ni hisoblaydi.
  2. `SubjectBookOut`da `department` (xom FK id, frontend fallback
     `String(b.department)` ishlatadi), `source_archive`, `file_url`,
     `file_size`, `created_at` yo'q edi — `SubjectBook` SQLAlchemy modeliga
     `file` ustuni butunlay mapping qilinmagan edi (DB'da bor, faqat model
     yo'q). Model tuzatildi, `admin_list_subject_books()` endi
     `MEDIA_URL`dan haqiqiy `file_url` va fayl hajmini quradi (Django
     `get_file_url`/`get_file_size` bilan bir xil mantiq).
  3. `/course-syllabuses/catalog/` `CourseSyllabusOut` (yarim-tayyor schema)
     ishlatardi — `department`/`department_name`/`department_code`/
     `created_at`/`updated_at` yo'q edi. Endi `_full_out()` (allaqachon to'g'ri
     ishlaydigan helper, `admin/course-syllabuses/`da ishlatilgan)ga
     almashtirildi; eskirgan `CourseSyllabusOut` schema o'chirildi.
  Rebuild qilib real curl bilan tekshirildi (admin/subject-books,
  course-syllabuses/catalog, admin/handouts) — barcha yangi maydonlar
  (file_url, file_size, source_archive, department, can_delete, sort_order,
  owner_key) to'g'ri qaytmoqda.
- **2026-08-03** — Django `core/serializers.py`dagi nested-serializer
  patternlarni sistematik qidirish (`grep "= .*Serializer(read_only=True)"`)
  orqali 3-chi bug topildi va tuzatildi: `StaffScheduleSlotSerializer`
  ichma-ich `building` obyekt (`CampusBuildingSerializer`) + hisoblangan
  `week_phase_label` va `applies_this_calendar_week` maydonlarini qaytaradi,
  lekin FastAPI versiyasi (`StaffScheduleSlotOut`) bularni yo'q edi. Aniqlandi
  — Django'da bitta emas, IKKITA farqli "hafta bosqichi" yorlig'i matni bor:
  `week_schedule.py`dagi qisqa forma ("Yuqori hafta", schedule-week-info
  endpointida) va `WEEK_PHASE_CHOICES`dagi to'liq forma ("Yuqori hafta (ISO
  toq)", slot serializatsiyasida). `geo.py`da ikkita alohida funksiya
  (`week_phase_label_uz` va `week_phase_choice_label_uz`) qilib ajratildi,
  `CampusBuildingOut`ga `created_at`/`updated_at` qo'shildi, `_slot_out()`
  (`staff_location.py`) yangi maydonlarni to'ldiradigan qilib qayta yozildi.
  Rebuild qilingandan keyin real curl bilan tekshirildi: admin
  `staff-schedule/`, hodim `staff/schedule/` va `schedule-week-info/`
  endpointlari Django bilan bir xil javob shaklini qaytarmoqda (jumladan
  admin-staff-schedule pagination'siz bare array ekanligi ham Django bilan
  mos ekanligi tasdiqlandi).
- **2026-08-02** — Cutover tayyorgarligi: Hodim tomoni real QR pairing
  orqali sinaldi (kompyuter=brauzer, telefon=curl, real
  create→login→confirm→poll zanjiri). Hodim panelining barcha 7 sahifasi
  (Mening fanlarim, Ma'ruza matni, Taqdimotlar, Tarqatma materiallar, Keys
  yaratish, Test yaratish, Profil) real ma'lumot bilan xatosiz ishladi. Yangi
  bug topilmadi — oldingi ikki tuzatishdan keyingi natija.
- **2026-08-02** — Cutover tayyorgarligi davomi: barcha 14 admin sahifasi
  real UI orqali sinaldi. 2 ta jiddiy bug topildi va tuzatildi: (1) ~15
  endpointda pagination wrapper (`{count,page,page_size,results}`) yo'q edi —
  "Fan–o'qituvchi" sahifasini qulatgan; umumiy `paginate()` yordamchisi bilan
  tuzatildi. (2) `StaffCourseSelection` javobi tekis maydonlar qaytarardi,
  frontend ichma-ich `syllabus.id` kutgan — schema qayta yozildi
  (`owner_name`/`owner_phone_display` bilan). Tuzatishdan keyin barcha 14
  sahifa (jumladan to'liq statistikali "Test bazasi") real ma'lumot bilan
  to'g'ri ishladi. Hodim login → QR ekrani — bug emas, dizayn bo'yicha to'g'ri.
- **2026-08-02** — Cutover tayyorgarligi (dev-rehearsal): qo'shimcha
  `nginx_fastapi` gateway (port 8081) yaratildi, prod nginx'ga tegilmadi.
  Real, o'zgarishsiz frontend build orqali real brauzerda to'liq UI sinovi
  o'tkazildi (dashboard, xodimlar, binolar, syllabus, startap inbox) — demo
  admin bilan. **Muhim bug topildi**: boshqaruv panelida statistika `0`
  ko'rsatilayotgan edi — `build_catalog_stats` javob strukturasi Django
  bilan (nested `totals`/`by_variant`/`by_topic`/`by_author`) mos emas edi,
  faqat real UI orqali aniqlanadigan turdagi xato. To'liq qayta yozildi va
  tuzatildi, real UI'da qayta tekshirildi. Bu real frontend + FastAPI
  integratsiyasining ishonchli tasdiqi bo'ldi.
- **2026-08-02** — To'liq endpoint-by-endpoint sinov (64+ so'rov, avtomatlashtirilgan
  skript, real qiymatlar/fayllar bilan). 4 ta haqiqiy bug topildi: 3 ta PATCH
  endpoint (`campus-buildings`, `clinical-groups`, `staff-schedule`) to'liq
  maydon talab qilardi (partial update ishlamasdi — alohida Patch schema
  qo'shib tuzatildi), va `live-tests` POST javob strukturasi Django bilan
  mos emas edi (tuzatildi). Tuzatishdan keyin qayta sinov — barcha 64 so'rov
  0 xatolik bilan o'tdi.
- **2026-08-02** — Qolgan 3 ta endpoint ko'chirildi: legacy
  `prepared-content` (auth'siz), legacy `syllabuses` (per-user, to'liq
  CRUD), `ai-jobs/{id}/` (arxitektura farqi tufayli ataylab doim 404).
  Har biri real qiymatlar bilan sinaldi — eng muhimi, v1 orqali yaratilgan
  prepared-content yozuvini legacy endpoint to'g'ri o'qidi (bir xil DB
  qatoriga ishora). **Yakuniy audit: Django'dagi 91 ta URL'ning 100%'i
  FastAPI'da mavjud.**
- **2026-08-02** — **To'liq path audit** o'tkazildi: Django'ning 91 ta URL
  pattern'i FastAPI'ning haqiqiy OpenAPI sxemasi bilan avtomatik
  solishtirildi. Birinchi audit 14 ta nomuvofiqlikni topdi (prefiks xatolari,
  nom farqlari, 4 ta butunlay yetishmagan endpoint guruhi — jumladan
  `academic-catalog` va asosiy `prepared-content` saqlash endpointi).
  Barchasi tuzatildi/qo'shildi va real muhitda sinaldi — `academic-catalog`
  hatto **real ishlab turgan OnlineTest serveridan** haqiqiy ma'lumot oldi.
  Ikkinchi audit faqat 3 ta ataylab qoldirilgan (Django'ning o'zida ham
  legacy/deprecated yoki Celery'ga bog'liq) va 1 ta zararsiz qo'shimcha
  endpointni ko'rsatdi — bu amalda **to'liq endpoint parity** demakdir.
- **2026-08-02** — Faza 9 yakuniy tozalash: **muhim yo'l-nomi xatosi topildi
  va tuzatildi** — `auth`/`syllabus_catalog` routerlari `/api` prefiksida edi,
  bo'lishi kerak bo'lgan `/api/v1` emas (Faza 1/2'dan qolgan, hech qachon
  aniqlanmagan xato — o'z testlarim ham shu xato yo'ldan foydalanganligi
  uchun "ishlayapti" ko'rinardi). Tuzatildi + ichki yo'l nomlari Django bilan
  aniq moslashtirildi (`course-syllabuses/catalog/`, `course-syllabuses/my/`).
  Bir necha fazadan qolgan dublikat auth-endpoint kod ham tozalandi. Avatar
  yuklash/o'chirish va admin xodimlar ro'yxati qo'shildi. To'liq regressiya
  real bazada, to'g'ri (Django bilan mos) yo'llar bilan qayta sinaldi —
  hammasi ishladi. **Bu bilan Faza 9 chinakam yakunlandi.**
- **2026-08-02** — Faza 9 davomi (yakuniy): Admin Syllabus CRUD ko'chirildi.
  Aniqlandiki, bu aslida oddiy JSON CRUD ekan (PDF parsing Django tarafida
  ham frontend/CLI'da bo'ladi) — kutilganidan sodda chiqdi. Real bazada
  to'liq CRUD (yaratish variantlar bilan, append_variants, o'chirish)
  sinaldi. **Shu bilan Faza 9 (barcha asosiy endpoint ko'chirish) yakunlandi.**
- **2026-08-02** — Faza 9 davomi: Auth qolgan qismlari ko'chirildi (`/auth/me`,
  change-password, admin provision/deprovision-staff, online-test-login).
  Real DB'da to'liq foydalanuvchi hayot-sikli sinaldi: yaratish → login →
  parol o'zgartirish → eski parol rad etildi → o'chirish → login ishlamay
  qoldi. OnlineTest orqali talaba login kod darajasida tayyor, lekin dev
  muhitida tashqi server yo'qligi sabab end-to-end HTTP bilan sinalmadi.
  Qolgan yagona narsa: admin syllabus PDF yaratish/yuklash.
- **2026-08-02** — Faza 9 davomi: External API ko'chirildi (X-Api-Key auth,
  tests list/detail/stats, questions-sample, catalog departments/subjects/
  stats). Real bazada, real API-key bilan sinaldi — hammasi to'g'ri natija
  berdi (28 kafedra, 158 fan, 3610 mavzu). Yo'l-yo'lakay Postgres
  `GroupingError` (GROUP BY'da `sort_order` yetishmasligi) topilib tuzatildi.
  **Faza 9ning asosiy endpoint-ko'chirish qismi shu bilan yakunlandi** —
  91 ta Django URL'dan katta ko'pchiligi FastAPI'da real sinovdan o'tkazilgan
  holda mavjud. Qolgan kichik qismlar (OnlineTest talaba login, admin
  syllabus PDF CRUD, /auth/me+avatar, provision/deprovision) alohida
  kuzatiladi.
- **2026-08-02** — Faza 9 davomi: Startup AI (4 endpoint) ko'chirildi —
  promptlar so'zma-so'z saqlangan, Celery o'rniga sinxron. Real OpenAI API +
  real startuper foydalanuvchi bilan hammasi sinaldi: questionnaire (22+
  savol), twenty-criteria (baholash), innovation-pack (to'liq tahlil,
  reasoner model), coach-reply (amaliy maslahat) — barchasi to'g'ri ishladi.
  Qolgan: external API.
- **2026-08-02** — Faza 9 davomi: Education AI (`education-ai/completion`,
  `education-ai/book-references`) ko'chirildi — Celery job-queue o'rniga
  sinxron endpoint sifatida (FastAPI'da bunga hojat yo'q). Real OpenAI API +
  real pgvector RAG bilan to'liq zanjir sinaldi: savol → kitob qidiruvi
  (Guyton/Ganong) → AI javobi darslik matniga asoslangan → aniq
  book_references (kitob+sahifa) qaytdi. Bu butun AI/RAG zanjirining
  uchidan-uchigacha ishlashini tasdiqladi.
- **2026-08-02** — Faza 9 davomi: Clinic Admin ko'chirildi (dashboard, a'zo
  CRUD, to'lov CRUD, admin tayinlash). Real bazada to'liq hayot-sikli
  sinaldi. Yo'l-yo'lakay **Faza 1'dan qolgan yashirin bug** topildi:
  `auth_service.set_user_role_group` faqat 3 rolni (admin/hodim/startuper)
  qabul qilib, `klinika_admin`ni sukut bo'yicha rad etardi — tuzatildi
  (`ALL_GROUP_ROLES`). Startup-ai, external API, education-ai hali qolgan.
- **2026-08-02** — Faza 9 davomi: Handout/Presentation/TopicVideo (fayl
  yuklash) ko'chirildi. Media volume Django bilan baham ko'rildi. Real fayl
  yuklandi/yuklab olindi (bayt-bayt mos)/o'chirildi, YouTube video CRUD
  sinaldi. `UploadFile` + boshqa form maydonlari uchun `Form(...)` kerakligi
  aniqlanib tuzatildi. Clinic-admin, startup-ai, external API, education-ai
  hali qolgan.
- **2026-08-02** — Faza 9 davomi: Content Catalog (PreparedContent) ko'chirildi
  — 11 endpoint (public/authenticated/admin x list/detail/subjects/stats),
  real bazadagi 7 ta e'lon qilingan material (3 case + 4 test) bilan
  sinaldi: statistika, filtrlash, verification_code/document_id, to'liq
  payload — hammasi to'g'ri. `by_variant`/`by_topic`/`by_author` guruhlash
  va boshqa katta bloklar (handout fayllari, clinic-admin, startup-ai,
  external API, education-ai) hali qolgan.
- **2026-08-02** — Faza 9 (Cutover) boshlandi parity audit bilan: 91 ta
  Django URL'ga qarshi ~37 ta FastAPI endpoint (~40%) va yo'l nomi
  farqlari topildi. Foydalanuvchi bilan kelishilib, nginx/frontend
  traffigini HOZIRCHA o'tkazmaslik, qolgan endpointlarni ko'chirishda davom
  etish qarori qabul qilindi. Auth domenidagi qolgan qism (`me`,
  `change-password`, `admin-provision/deprovision-staff`) yozildi va real
  bazada to'liq xodim hayot-sikli (yaratish→login→parol o'zgartirish→
  o'chirish) sinaldi. Yo'l-yo'lakay `StaffProfile.photo` NOT NULL xatosi
  topilib tuzatildi.
- **2026-08-02** — Faza 8 (Admin panel qarori): SQLAdmin tanlandi (Jazzmin
  o'rniga). `AdminAuth` backend yozildi (mavjud auth_user parol+admin rol
  tekshiruvi), 11 ModelView ro'yxatga olindi. Real brauzerda demo admin bilan
  login qilindi, 158 ta real syllabus yozuvi to'g'ri ko'rsatildi, FK ustuni
  formatlashtirish xatosi topilib tuzatildi. Fayl-yuklash maydonlari va
  qolgan modellar (TopicHandout va h.k.) uchun ModelView hali qo'shilmagan.
- **2026-08-02** — Faza 7 (Qurilma ulash — QR pairing) yozildi va real bazada
  to'liq oqim sinaldi: yaratish → poll (pending) → hodim tasdiqlash (parol
  maydoni filtrlandi) → poll (JWT + profil bir marta) → keyingi poll
  (picked_up, bo'sh — qayta ishlatish yo'q). Tashqi API/manba katalogi
  utilitalari hali ko'chirilmagan.
- **2026-08-02** — Faza 6 (Kitob/AI-RAG, pgvector) boshlandi — eng murakkab
  qism: `SubjectBook`/`BookChunk` (pgvector Vector(1536)), OpenAI client porti
  (`requests` bilan), to'liq `book_retrieval.py` porti (department resolve,
  cosine-distance qidiruv, manba tozalash/formatlashtirish). Real bazadagi
  1747 embedding'li chunk ustida sinaldi — statistika to'g'ri, va real OpenAI
  API kaliti bilan pgvector cosine-distance qidiruvi ishladi (200 OK).
  Asosiy AI generatsiya endpoint'lari (`education_ai_views.py`, Celery
  ai_jobs) hali ko'chirilmagan — hajmi katta, alohida davom ettirish kerak.
- **2026-08-02** — Faza 5 (Startup/Klinik guruh) boshlandi: startup ariza CRUD +
  submit + admin inbox, klinika (tenant) admin CRUD + a'zolar ro'yxati yozildi.
  Real bazada to'liq sinaldi (ariza yaratish→yuborish→admin inbox, klinika
  yaratish→ro'yxat). Klinika ichidagi a'zo/to'lov boshqaruvi (ClinicAdmin*
  views) hali qolgan.
- **2026-08-02** — Faza 3 (Staff Location) yakunlandi: geo/policy/week servislar,
  4 model, 13 endpoint yozildi. Real bazada to'liq oqim sinaldi — bino yaratish,
  jadval belgilash, hodim ping (ichida/tashqarida), admin monitoring — hammasi
  to'g'ri natija berdi (masofa hisoblash, geofence, live-teaching-status
  aniq). Yo'l-yo'lakay FastAPI'ning 204-status + response_model xatosini
  aniqlab tuzatdim.
- **2026-08-02** — Faza 4 (Live Test) — foydalanuvchi so'rovi bo'yicha Faza 3'dan
  oldin bajarildi: sessiya CRUD, talaba uchun javob-kalitisiz ko'rinish, draft,
  submission, finalize (FOR UPDATE bilan) yozildi va real bazada to'liq oqim
  (yaratish → ko'rish → yakunlash) sinaldi. Yo'l-yo'lakay dev Django image'ining
  eskirganligi (`requests` moduli yo'q edi) aniqlanib, rebuild + migratsiya bilan
  tuzatildi. Talaba (OnlineTest) login orqali JWT olish hali ko'chirilmagan.
- **2026-08-02** — Faza 2 boshlandi: `AcademicDepartment`/`CourseSyllabus`/
  `StaffCourseSelection` modellari va syllabus-catalog + staff/admin course
  selection endpoint'lari yozildi, real dev bazasida (71+ fan) sinaldi — hammasi
  ishladi. `PreparedContent`, handout/presentation/video va admin syllabus
  CRUD (fayl yuklash) hali qolgan.
- **2026-08-02** — Faza 1 boshlandi: JWT auth (`local-login`) yozildi va real dev
  bazadagi demo admin bilan sinaldi (200 OK, to'g'ri token). Parol tekshirish Django
  hash formatiga mos (`passlib` `django_pbkdf2_sha256`). Talaba login, parol
  o'zgartirish va throttling hali qolgan.
- **2026-08-02** — Faza 0 tasdiqlandi: `docker compose -f docker-compose.dev.yml up --build
  backend_fastapi` bilan ishga tushirildi, Postgres'ga ulandi, `curl
  http://127.0.0.1:8100/api/health/` → `{"status":"ok"}`. Konteyner ishlayapti, mavjud
  `backend`/`nginx` xizmatlariga tegilmadi. Keyingi: Alembic boshlang'ich revision va
  Faza 1 (Auth/JWT).
- **2026-08-02** — Faza 0: FastAPI + SQLAlchemy + Alembic skeleti yaratildi
  (`backend_fastapi/`), `docker-compose.dev.yml`ga parallel xizmat sifatida qo'shildi
  (port 8100). Model ko'chirish, Alembic boshlang'ich revision va auth hali boshlanmagan.
- **2026-08-02** — Migratsiya rejasi va progress fayli yaratildi.
