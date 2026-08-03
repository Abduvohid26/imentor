# Backend Migration Plan: Django/DRF → FastAPI + SQLAlchemy + Alembic

## Maqsad
Hozirgi Django + DRF backendni FastAPI + SQLAlchemy (ORM) + Alembic (migratsiya)
stackiga o'tkazish, funksionallikni yo'qotmasdan, bosqichma-bosqich va test qilinadigan
tarzda.

## Hozirgi holat (audit natijasi)

| Qism | Hajm | Izoh |
|---|---|---|
| Models (`core/models.py`) | 870 qator, 23 model | pgvector (`BookChunk`), FK'lar ko'p |
| Views (`core/views.py` + 20+ alohida `*_views.py`) | ~1300+ qator asosiy faylda | DRF ViewSet/APIView aralash |
| Serializers | 709 qator | DRF serializers |
| URLs | 249 qator | DRF router + custom path'lar |
| Migrations | 35 ta | Django migration tarixi |
| Auth | `djangorestframework-simplejwt` | JWT, telefon raqam asosida login |
| Admin panel | `django-jazzmin` | Hozircha FastAPI'da to'g'ridan-to'g'ri o'rni yo'q |
| Background jobs | Celery + Redis | AI job'lar (`ai_async.py`, `ai_jobs.py`, `tasks.py`) |
| AI/RAG | OpenAI client + pgvector (`book_retrieval.py`) | Vector qidiruv logikasi |
| Testlar | `test_*.py` bir nechta fayl | pytest/Django test client asosida |

## Strategik qarorlar

1. **Katta portlash yo'q** — eski Django backend va yangi FastAPI backend vaqtincha
   yonma-yon yashaydi. Migratsiya modul-modul (domen bo'yicha) amalga oshiriladi.
2. **DB sxemasi saqlanadi** — Postgres jadval nomlari, ustunlar, FK'lar bir xil qoladi.
   SQLAlchemy modellarini mavjud sxemaga moslab yozamiz (Alembic'ni "boshlang'ich
   snapshot" migratsiyasidan boshlaymiz — `alembic revision --autogenerate` mavjud DB'ga
   qarab, keyin qo'lda tekshiriladi).
3. **Auth**: JWT logikasi FastAPI'da `fastapi-users` yoki qo'lda `python-jose` +
   `passlib` bilan qayta yoziladi; token formatini (claims) DRF-simplejwt bilan
   moslashtiramiz, shunda frontend token formatini o'zgartirmasdan ishlaydi (yoki
   frontend'da bitta joyni yangilash kifoya).
4. **Admin panel**: Jazzmin o'rniga variant kerak — variantlar: (a) Django admin'ni
   alohida "faqat admin" mikroservis sifatida vaqtincha saqlab qolish, (b) SQLAdmin /
   FastAPI-Admin ga o'tish. Qaror kerak — hozircha reja B(2)-fazada aniqlanadi.
5. **Celery** — FastAPI bilan ham ishlaydi (framework-agnostik), shuning uchun
   Celery worker qismini deyarli o'zgarishsiz ko'chiramiz, faqat Django ORM chaqiruvlarini
   SQLAlchemy session'ga almashtiramiz.
6. **pgvector** — `pgvector-sqlalchemy` (yoki `pgvector.sqlalchemy.Vector` type)
   orqali SQLAlchemy'da qo'llab-quvvatlanadi.
7. **Testlar** — har bosqichda mos FastAPI TestClient (`httpx.AsyncClient` /
   `starlette.testclient.TestClient`) testlari yoziladi, eski Django testlari mos
   funksionallik ko'chirilgach o'chiriladi.

## Yangi backend tuzilishi (taklif)

```
backend_fastapi/
  app/
    main.py                 # FastAPI() ilova, router ulash
    core/
      config.py             # Pydantic Settings (env o'qish)
      security.py            # JWT, parol hash
      db.py                  # SQLAlchemy engine/session
    models/                  # SQLAlchemy ORM modellari (Django models.py ekvivalenti)
      prepared_content.py
      syllabus.py
      staff.py
      clinical_group.py
      subject_book.py
      ...
    schemas/                 # Pydantic schemas (DRF serializers ekvivalenti)
    api/
      routes/
        auth.py
        prepared_content.py
        staff_location.py
        clinical_group.py
        syllabus_catalog.py
        live_test.py
        startup.py
        subject_book.py
        device_pairing.py
        external_api.py
      deps.py                # get_db, get_current_user va h.k.
    services/                 # business logic (book_retrieval, location_service va h.k.)
    tasks/                     # Celery tasklari (yoki FastAPI BackgroundTasks/arq)
  alembic/
    versions/
    env.py
  alembic.ini
  requirements.txt
  Dockerfile
```

## Domen bo'yicha migratsiya tartibi (fazalar)

Har bir faza: SQLAlchemy model → Pydantic schema → route → service logika → test →
frontend bilan tekshirish (agar endpoint frontend ishlatsa).

### Faza 0 — Skelet va infratuzilma
- [ ] `backend_fastapi/` loyihasini yaratish (FastAPI, SQLAlchemy, Alembic, Uvicorn/Gunicorn)
- [ ] `alembic init` va mavjud Postgres sxemasidan boshlang'ich revision yaratish
- [ ] `config.py` — barcha env o'zgaruvchilarni Django settings'dan ko'chirish
- [ ] DB session, dependency injection (`get_db`)
- [ ] Health-check endpoint (`/api/health/`) — mavjud nginx/monitoring bilan mos
- [ ] Docker Compose'ga ikkinchi backend xizmatini (parallel port) qo'shish

### Faza 1 — Auth
- [ ] `User`/`StaffProfile` modeli (Django `auth_user` jadvali + `StaffProfile`)
- [ ] JWT login/refresh (`phone` asosida, DRF-simplejwt formatiga mos claims)
- [ ] Permission/role tizimi (`core/permissions.py` ekvivalenti)
- [ ] Throttling (`core/throttling.py` ekvivalenti — `slowapi` yoki qo'lda)

### Faza 2 — Asosiy kontent modeli (kam bog'liqlik)
- [ ] `PreparedContent`, `SyllabusDocument`, `AcademicDepartment`, `CourseSyllabus`,
      `StaffCourseSelection`
- [ ] Syllabus catalog va topic parse xizmatlari (`syllabus_catalog_views.py`,
      `syllabus_topic_parse.py`)
- [ ] `TopicHandout`, `TopicPresentation`, `TopicVideo`

### Faza 3 — Xodimlar joylashuvi (Staff Location)
- [ ] `CampusBuilding`, `StaffScheduleSlot`, `StaffLocationPing`, `StaffLocationAlert`
- [ ] `location_service.py`, `location_policy.py`, `geo.py`, `week_schedule.py` logikasi
- [ ] Frontend: `AdminStaffLocationConsole.tsx`, `staffLocationApi.ts` bilan integratsiya
      testi

### Faza 4 — Live Test
- [ ] `LiveTestSession`, `LiveTestSubmission`, `LiveTestDraft`
- [ ] `live_test_service.py`, `online_test_client.py` (tashqi API integratsiyasi)

### Faza 5 — Startup / Klinik guruh modullari
- [ ] `StartupProjectApplication` + `startup_ai_views.py`, `startup_ai_prompts.py`
- [ ] `ClinicalGroup`, `ClinicalGroupMember`, `ClinicalGroupPayment`

### Faza 6 — Kitob/AI-RAG (eng murakkab qism)
- [ ] `SubjectBook`, `BookChunk` (pgvector)
- [ ] `book_retrieval.py` — vektor qidiruv, embedding logikasi
- [ ] `openai_client.py`, `education_ai_utils.py`, `education_ai_views.py`
- [ ] Celery: `ai_async.py`, `ai_jobs.py`, `ai_job_views.py`, `tasks.py`

### Faza 7 — Qurilma ulash (Device pairing) va tashqi API
- [ ] `DevicePairingSession` + `device_pairing_views.py`
- [ ] `external_api_views.py`, `external_catalog_service.py`, `manba_catalog_utils.py`

### Faza 8 — Admin panel qarori va implementatsiyasi
- [ ] Qaror: SQLAdmin / FastAPI-Admin / alohida saqlanadigan Django-admin-only servis
- [ ] Tanlangan yechimni implementatsiya qilish

### Faza 9 — Cutover
- [ ] Barcha endpoint parity tekshiruvi (checklist: har bir eski URL yangi backendda bormi)
- [ ] Frontend `VITE_API_BASE_URL`ni yangi backendga o'tkazish
- [ ] Nginx routing'ni yangilash, eski Django backendni o'chirish/arxivlash
- [ ] To'liq regression test (frontend + backend)

## Xavf va e'tibor talab qiladigan joylar
- **pgvector** SQLAlchemy integratsiyasi — `pgvector` python paketining SQLAlchemy
  qo'shimchasi kerak (`pip install pgvector`), `Vector` type ustunlar uchun.
- **JWT format moslashuvi** — frontend token parsing kodini tekshirish kerak
  (`frontend/src/utils/*Api.ts`).
- **Celery + SQLAlchemy** — Django ORM'ning "har so'rovda avtomatik connection"
  xatti-harakati yo'q; SQLAlchemy session lifecycle'ni to'g'ri boshqarish kerak
  (ayniqsa Celery worker ichida).
- **Migration tarixi** — Alembic boshlang'ich revisioni "hozirgi holatni suratga olish"
  bo'lishi kerak, Django'ning 35 ta migratsiyasini birma-bir takrorlash shart emas.
- **Testlar** — mavjud `test_*.py` fayllar Django test runner'ga bog'liq; ular FastAPI
  uchun pytest + httpx asosida qayta yoziladi (frecvensiya: har faza oxirida).

## Progress kuzatuvi
Amaliy progress [docs/FASTAPI_MIGRATION_PROGRESS.md](FASTAPI_MIGRATION_PROGRESS.md)
faylida yuritiladi — har bosqich yakunlanganda shu yerda belgilanadi.
