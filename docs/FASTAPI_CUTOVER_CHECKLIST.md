# FastAPI Cutover Checklist — production ga o'tish

Ushbu hujjat `docs/FASTAPI_MIGRATION_PLAN.md` va `docs/FASTAPI_MIGRATION_PROGRESS.md`ning
davomi: migratsiya funksional jihatdan tugagach, **production**da Django backendni
FastAPI bilan almashtirish uchun aniq, tekshiruvchan qadamlar ro'yxati.

Hozirgi holat: dev muhitda `nginx_fastapi` (port 8081) orqali FastAPI+asl frontend
bilan parallel sinovdan o'tkazilmoqda (production nginx/`docker-gateway.conf`ga
tegilmagan). Bu hujjat — o'sha sinovdan **production**ga o'tish uchun qolgan ishlar.

---

## 0. Qisqa xulosa: nima tayyor, nima yo'q

| Holat | Band |
|---|---|
| ✅ Tayyor | JWT compat, parol hash compat, barcha 91 endpoint path-audit qilingan, pagination shakli, nested serializer parity (27+ serializer + clinical-group domeni), real UI test (admin + hodim) |
| ✅ Tayyor (2026-08-03) | **Media fayllarni serve qilish** — `app/main.py`da `StaticFiles` mount qo'shildi, real fayl (90 MB PDF) `200 OK` bilan tekshirildi |
| ✅ Tayyor (2026-08-03) | **Alembic baseline** — `alembic stamp head` bilan belgilandi (no-op revision, pastda 1.2-bo'limda tafsilot) |
| ✅ Tayyor (2026-08-03) | **Multi-worker** — `entrypoint.sh`/`migrate-entrypoint.sh` qo'shildi, gunicorn + `uvicorn.workers.UvicornWorker`, `GUNICORN_WORKERS_FASTAPI` env orqali sozlanadi (1.3-bo'lim) |
| ✅ Tayyor (2026-08-03) | `docker-compose.prod.yml`ga `backend_fastapi` + `migrate_fastapi` xizmatlari qo'shildi (1.4-bo'lim) — **hali nginx trafik yubormaydi**, faqat ishga tushirishga tayyor |
| ⚠️ Qaror kerak | Celery/`celery_worker` — FastAPI AI endpointlari sinxron ishlaydi, Celery ishlatilmaydi. Prod compose'dan olib tashlansa bo'ladimi yoki boshqa maqsadda (masalan hali portlanmagan job) kerakmi? |
| ⚠️ Qaror kerak | `ai-jobs/{id}/` endpoint har doim 404 qaytaradi (arxitektura farqi — quyida) |

---

## 1. Kod tayyorligi (cutover'dan OLDIN bajarilishi shart)

### 1.1 Media serving — ✅ HAL QILINDI (2026-08-03)
FastAPI'da `/media/` uchun static mount yo'q edi. **(b) variant** tanlandi —
`app/main.py`ga `app.mount(settings.django_media_url, StaticFiles(directory=media_root()), name="media")`
qo'shildi (dev compose'da `nginx_fastapi` konfiguratsiyasi allaqachon `/media/`ni
`backend_fastapi:8100`ga proksi qilar edi — shu sababli (a) emas (b) variant tanlandi,
ular bir-biriga mos).

Tekshirildi: `admin/subject-books/` javobidagi `file_url` (masalan
`http://.../media/books/7/....pdf`) haqiqiy 90 MB PDF faylni `200 OK`,
to'g'ri `content-type: application/pdf` bilan qaytardi.

**Eslatma production uchun**: agar prod'da nginx to'g'ridan-to'g'ri fayllarni
`alias`dan berish tavsiya etilsa (backend load'ini kamaytirish uchun), bu FastAPI
mount'ini o'chirishga hojat yo'q — ikkalasi ham bir xil `media_data` volume'ni
o'qiydi, nginx location ustunlik qiladi xolos.

### 1.2 Alembic baseline — ✅ HAL QILINDI (2026-08-03)
`backend_fastapi/alembic/versions/` bo'sh edi. Ish qilingan qadamlar:

1. `app/models/__init__.py` bo'sh edi — barcha 11 model modulini import qiluvchi
   qilib to'ldirildi (aks holda `Base.metadata` bo'sh bo'lib, autogenerate/stamp
   hech narsani ko'rmas edi). `alembic/env.py`ga `import app.models` qo'shildi.
2. `alembic revision --autogenerate` ishga tushirildi — natija **928 qatorli**,
   asosan shovqin edi: Django `BigAutoField` (`BIGINT`) vs SQLAlchemy
   modellaridagi oddiy `Integer` PK farqi hamda modellarda bevosita
   e'lon qilinmagan ko'plab Django indekslari "olib tashlanadi" deb
   ko'rsatilgan edi. Bu migratsiyani **ishga tushirish xavfli** bo'lardi —
   ishlab turgan production sxemasidagi indekslarni o'chirib yuborardi.
3. Shu sababli avtogenerate qilingan fayl **o'chirildi**, o'rniga qo'lda
   bo'sh (no-op) baseline revision yaratildi:
   `alembic/versions/853f673227d8_baseline_existing_django_managed_schema_.py`
   — `upgrade()`/`downgrade()` ikkalasi ham `pass` (hech qanday DDL bajarmaydi,
   faqat "boshlang'ich nuqta" belgisi).
4. `alembic stamp head` bilan dev DB shu revisionga belgilandi — `alembic_version`
   jadvalida tasdiqlandi (`853f673227d8`).

**Kelajakda schema o'zgarishi kerak bo'lsa**: yangi `alembic revision --autogenerate`
qilinganda ham xuddi shu BIGINT/Integer va indeks-shovqin muammosi takrorlanadi
(model darajasida hal qilinmagan — bu bilib turilgan cheklov). Har bir yangi
autogenerate natijasini **albatta qo'lda tekshirish va faqat kerakli
`op.*` chaqiruvlarini qoldirish** shart — avtomatik holda ishga tushirmaslik.
Xohlasa, kelajakda modellardagi `id: Mapped[int]`larni `BigInteger`ga
o'tkazish bu shovqinni kamaytiradi, lekin bu alohida, ehtiyotkorlik bilan
qilinishi kerak bo'lgan ish (barcha FK turlariga ham ta'sir qiladi).

### 1.3 Production Dockerfile — multi-worker — ✅ HAL QILINDI (2026-08-03)
`backend_fastapi/Dockerfile` endi `ENTRYPOINT ["sh", "/app/entrypoint.sh"]`
ishlatadi (Django `backend/entrypoint.sh` bilan bir xil naqsh):

- `entrypoint.sh` — `RUN_MIGRATIONS=1` bo'lsa `alembic upgrade head`ni ishga
  tushiradi, keyin `gunicorn app.main:app --worker-class
  uvicorn.workers.UvicornWorker --workers $GUNICORN_WORKERS ...` bilan ishga
  tushadi. Bir martalik buyruqlar uchun (`docker compose run backend_fastapi
  alembic ...`) argument bo'lsa to'g'ridan-to'g'ri shuni bajaradi.
- `migrate-entrypoint.sh` — faqat `alembic upgrade head`, chiqadi (Django
  `migrate` xizmati kabi bir martalik bosqich uchun).

Ishlatiladigan env: `GUNICORN_WORKERS` (default 3 prod, dev'da
`GUNICORN_WORKERS_FASTAPI` orqali 2), `GUNICORN_TIMEOUT` (default 300),
`RUN_MIGRATIONS` (default 1, lekin `backend_fastapi` xizmatida `0` — chunki
migratsiya alohida `migrate_fastapi` bosqichida bajariladi, xuddi Django
naqshiga o'xshab).

Real sinov: dev compose'da rebuild qilinib, gunicorn 2 ta uvicorn worker
process bilan ko'tarilgani (`Booting worker with pid: 8/9`) va barcha
endpointlar (health, auth, admin/staff, media file) `200 OK` qaytargani
tasdiqlandi.

### 1.4 `docker-compose.prod.yml`ga `backend_fastapi` xizmatini qo'shish — ✅ HAL QILINDI (2026-08-03)
`migrate_fastapi` (bir martalik, `restart: "no"`) va `backend_fastapi`
xizmatlari qo'shildi — ikkalasi ham mavjud `backend-env` anchor'idan
o'zgarishsiz foydalanadi (Django va FastAPI env nomlari bir xil bo'lgani
uchun). `backend_fastapi` `migrate_fastapi`ning muvaffaqiyatli
tugashiga (`service_completed_successfully`) bog'liq, xuddi Django
`backend`ning `migrate`ga bog'liqligi kabi. `healthcheck`
`curl -f http://127.0.0.1:8100/api/health/`.

**Muhim**: bu xizmatlar hozircha faqat **ishga tushirishga tayyor** — hech
qanday nginx konfiguratsiyasi trafikni ularga yubormaydi. Haqiqiy trafik
almashtirish hali 3-bo'limdagi qadamlar bo'yicha, alohida tasdiq bilan
amalga oshiriladi.

### 1.5 Celery/`celery_worker` — qaror kerak
FastAPI barcha AI (ma'ruza, test, keys, taqdimot matni) so'rovlarini **sinxron**
bajaradi (dizayn qarori — `docs/FASTAPI_MIGRATION_PLAN.md`da qayd etilgan).
Django'dagi `celery_worker` xizmati va Celery job queue FastAPI tomonida
ishlatilmaydi.

**Qaror:** Agar boshqa hech narsa (masalan xat yuborish, fon vazifalari) Celery'ga
tayanmasa, `celery_worker` xizmatini prod compose'dan **olib tashlash** mumkin —
lekin buni olib tashlashdan oldin `backend/core/tasks.py`ni tekshirib, boshqa
Celery task yo'qligiga ishonch hosil qilish kerak.

### 1.6 `ai-jobs/{job_id}/` — bilib turilgan arxitektura farqi
Django'da bu endpoint Celery job holatini so'raydi. FastAPI'da sinxron
javob qaytarilgani uchun bu endpoint har doim 404 qaytaradi (frontend buni
kutmaydi — chunki FastAPI javobi darhol keladi, frontend polling qilmaydi).
**Tekshirish:** frontendda `ai-jobs/` ga polling qiluvchi eski kod qolmaganini
tasdiqlash (`grep -rn "ai-jobs" frontend/src`).

---

## 2. Muhit o'zgaruvchilari (env) — moslik jadvali

`backend_fastapi/app/core/config.py` Django bilan **bir xil nomlarda** yozilgan
(qasddan) — shuning uchun `docker-compose.prod.yml`dagi `x-backend-env` anchor'i
deyarli o'zgarishsiz `backend_fastapi` xizmatiga ham beriladi. Tekshirish kerak
bo'lgan farqlar:

| Django env | FastAPI ekvivalenti | Izoh |
|---|---|---|
| `DJANGO_ALLOW_LEGACY_PREPARED_CONTENT_API` | `django_allow_legacy_prepared_content_api` | Prod'da Django `"False"` qilib o'chirilgan — FastAPI'da ham xuddi shunday `False` bo'lishi kerak (legacy endpoint prod'da yopilgan bo'lishi kerak) |
| `GUNICORN_WORKERS`/`GUNICORN_THREADS` | yo'q (1.3-band) | Yangi ekvivalent qo'shish kerak yoki xuddi shu nomdan foydalanish |
| `CELERY_CONCURRENCY` | ishlatilmaydi | 1.5-bandga bog'liq |
| — | `django_jwt_access_minutes`/`django_jwt_refresh_days` | Django tokenlarining TTL bilan **aniq bir xil** qiymat bo'lishi kerak (aks holda eski tokenlar yangi backend'da noto'g'ri muddatda tugaydi) — joriy qiymat Django'dagi SIMPLE_JWT sozlamasi bilan solishtirilsin |

**Ish:** `backend/config/settings/base.py`dagi `SIMPLE_JWT` TTL qiymatlarini
`backend_fastapi/app/core/config.py`dagi standart qiymatlar bilan qatorma-qator
solishtirib chiqish.

---

## 3. Cutover ketma-ketligi (bosqichma-bosqich, orqaga qaytarish imkoni bilan)

Bu qadamlar **faqat foydalanuvchi tasdiqlagandan keyin**, production muhitida
bajariladi — hech biri hozircha avtomatik amalga oshirilmagan.

1. **Snapshot**: production Postgres'ning to'liq backup'ini olish
   (`pg_dump`), alohida joyga saqlash. Media volume'ning ham nusxasini olish.
2. **1-bo'lim**dagi barcha kod tayyorligi bandlarini production kod bazasida
   yakunlash va staging/dev muhitida to'liq sinovdan o'tkazish.
3. `docker-compose.prod.yml`ga `backend_fastapi` xizmatini qo'shib, **hali
   nginx trafik yubormasdan** uni ishga tushirish (`docker compose up -d
   backend_fastapi`) — parallel, Django bilan bir xil DB'ga ulanadi (read-only
   sinov: faqat ichki tarmoqdan curl bilan tekshirish).
4. Health-check: `curl http://backend_fastapi:8100/api/health/` va bir nechta
   asosiy endpoint (`/api/v1/auth/local-login/`, `/api/v1/course-syllabuses/catalog/`)
   production ma'lumotlari bilan ishlashini tasdiqlash.
5. **Trafikni almashtirish** — `deploy/nginx/docker-gateway.conf`da
   `set $backend_upstream backend:8000;` ni `backend_fastapi:8100;`ga
   o'zgartirish (`/api/` va `/media/` location'lari uchun). Bu **yagona joy**
   — boshqa hech narsa o'zgarmaydi (frontend, domen, SSL — bari saqlanadi).
6. Nginx konteynerini qayta build/reload qilish
   (`docker compose -f docker-compose.prod.yml up -d --build nginx`).
7. **Darhol tekshirish** (birinchi 5 daqiqa): login (admin/hodim/startuper/
   klinika_admin), asosiy sahifalar, fayl yuklab olish (`/media/`), AI
   generatsiya (kamida bitta so'rov).
8. Monitoring: log'larda 500/422 xatoliklar sonini kuzatish
   (`docker compose logs -f backend_fastapi nginx`), kamida 1 soat.

---

## 4. Rollback rejasi

Agar 3.7 yoki 3.8 bosqichida jiddiy muammo topilsa:

1. `deploy/nginx/docker-gateway.conf`dagi `backend_upstream`ni **darhol**
   `backend:8000`ga qaytarish (Django hali ham ishlab turibdi — o'chirilmagan).
2. Nginx'ni qayta reload qilish — bu **~1 daqiqalik** operatsiya, ma'lumotlar
   yo'qolmaydi (ikkala backend bir xil Postgres'ga yozadi/o'qiydi, chunki
   sxema umumiy).
3. Muammoni FastAPI logларида diagnostika qilish, tuzatish, 3-bo'limni qaytadan
   boshlash.

**Muhim**: Django backend va konteynerlari cutover paytida **o'chirilmasin** —
kamida 1-2 hafta parallel "sovuq zaxira" sifatida saqlab turish tavsiya etiladi,
shundan keyingina `docker-compose.prod.yml`dan olib tashlash haqida qaror
qabul qilinsin.

---

## 5. Cutover'dan keyingi tozalash (faqat rollback muddati o'tgach)

- `backend/` (Django), `celery_worker` (agar ishlatilmasa), Django'ga tegishli
  `migrate` xizmatini `docker-compose.prod.yml`dan olib tashlash.
- `deploy/nginx/docker-gateway.fastapi.conf` va `nginx_fastapi` (dev-only
  cutover rehearsal) xizmatlarini `docker-compose.dev.yml`dan olib tashlash —
  endi kerak emas, chunki asosiy `nginx` FastAPI'ga yo'naltirilgan.
- `docs/FASTAPI_MIGRATION_PROGRESS.md`ga yakuniy "Faza 9: Production cutover —
  YAKUNLANDI" yozuvi qo'shish, sana bilan.

---

## 6. Ochiq savollar (foydalanuvchi bilan tasdiqlash kerak)

1. Celery worker prod compose'dan olib tashlansinmi (1.5-band) yoki kelajakda
   fon vazifalar uchun saqlab turilsinmi?
2. ~~Media serving — nginx `alias` yoki FastAPI `StaticFiles`?~~ — **hal qilindi**:
   FastAPI `StaticFiles` (1.1-band).
3. `GUNICORN_WORKERS_FASTAPI` production'da nechaga o'rnatilsin (hozircha
   default 3 — Django'ning `GUNICORN_WORKERS=2`sidan biroz ko'proq, chunki
   FastAPI thread emas, worker-based; server resurslariga qarab sozlash kerak)?
4. Rollback uchun Django backend'ni necha kun/hafta "sovuq zaxira" sifatida
   saqlab turish kerak?
5. **Trafik almashtirish qachon amalga oshiriladi?** — kod/infra tayyor
   (1-bo'limning barcha bandlari hal qilindi), lekin 3-bo'limdagi haqiqiy
   nginx upstream almashtirish hali bajarilmagan — bu alohida, aniq tasdiq
   bilan qilinishi kerak bo'lgan bosqich.
