# O‘qituvchi (hodim) dars flow

Bu hujjat iMentor da **o‘qituvchi** moduli uchun hozirgi mahsulot qoidasi.
Kod o‘zgarganda shu faylni ham yangilang.

## Asosiy model

| Tushuncha | Ma’nosi |
|-----------|---------|
| **Kafedra** | Academic catalog / `AcademicDepartment` |
| **Fan** | Bitta `CourseSyllabus` — odatda **bitta PDF** (syllabus) |
| **Mavzu** | Syllabus ichidagi `L1` / `M1` / `A1` band |
| **Yo‘nalish** | **UI da yo‘q.** Ichki `variant_label` faqat storage kaliti uchun (avtomatik birinchi PDF) |

Har bir yuklangan PDF katalogda **alohida fan** bo‘ladi. Fan nomi = fayl nomi (`.pdf`siz).

## Fan tanlash (birinchi kirish + Profile)

1. Admin o‘qituvchiga **kafedra** biriktiradi (`StaffProfile.department_id`).
2. Birinchi kirishda (QR login / desktop pair dan keyin) `StaffCourseSelection` bo‘sh bo‘lsa — to‘liq ekran onboarding: kafedra fanlari kartochkalari, **multi-select**, kamida 1 ta.
3. Keyinroq **Profile → O‘qitadigan fanlar → Tahrirlash** orqali o‘zgartirish mumkin.
4. API: `GET /course-syllabuses/department/`, `PUT /course-syllabuses/my/` (`syllabus_ids`).
5. Kafedra o‘zgaganda eski tanlovlar **tozalanadi** (qayta tanlash majburiy); barcha kafedra fanlari avtomatik yozilmaydi.
6. Admin «Fan–o‘qituvchi» orqali ixtiyoriy qo‘lda biriktirishi mumkin.

## O‘qituvchi UI flow

```
1. Fan tanlash  →  2. Mavzu tanlash  →  Keyingi  →  Ma'ruza matni
```

1. **Mening fanlarim** (`SyllabusView`): o‘qituvchi tanlagan (yoki admin biriktirgan) fanlar.
2. Fan tanlanadi → mavzular (ma’ruza / amaliy) chiqadi.
3. Mavzu tanlanadi → tanlangan blokda:
   - **Keyingi** → `lectures` (ma’ruza matni / AI)
   - Shu yerda **video** va **tarqatma** preview (mavzuga biriktirilgan)
4. Alohida nav: `handouts` — to‘liq tarqatma ko‘rish (mavzu konteksti kerak).

**Yo‘nalish bosqichi yo‘q.** `Ma’ruza matni` / `Tarqatma` alohida tugmalar o‘rniga mavzu tanlanganda **Keyingi**.

## Admin flow (moslash)

### Fanlar katalogi
- Kafedra ochiladi → syllabus yuklash (ko‘p PDF).
- Previewda **Fan nomi** maydoni yo‘q — har PDF alohida fan.
- Yo‘nalish (PI/DI) badge / filter UI da ko‘rsatilmaydi.

### Fan–o‘qituvchi
- O‘qituvchi → Kafedra → Fan(lar) checkbox (multi) — ixtiyoriy admin biriktirish.
- Asosiy oqim: o‘qituvchi o‘zi kafedra fanlaridan tanlaydi.
- Yo‘nalish tanlanmaydi — butun fan biriktiriladi.

### Videolar / Tarqatmalar
- Forma: **1 · Fan → 2 · Mavzu** (+ YouTube yoki fayl).
- Yo‘nalish select yo‘q; ichki `variant_label` = fanning birinchi varianti.
- O‘qituvchi bir xil kalit bilan materialni ko‘radi.

## Storage kaliti (`topic_norm`)

```
{syllabus_id}::{variant}::{topic_code}
```

- `variant` bo‘sh bo‘lsa → `asosiy` (FE + FastAPI).
- Teacher va admin **bir xil** avto-variant ishlatishi kerak (birinchi PDF).
- Ko‘p-variantli eski fanlarda admin #2 ga yuklasa, teacher #1 ni ko‘radi — yangi modelda har PDF alohida fan.

## Tegishli fayllar

| Joy | Fayl |
|-----|------|
| Teacher syllabus | `frontend/src/components/SyllabusView.tsx` |
| Fan onboarding / profile picker | `frontend/src/components/staff/StaffTeachingSubjectsPicker.tsx` |
| Topic context | `frontend/src/utils/syllabusTopicContext.ts` |
| Admin video | `frontend/src/components/admin/AdminTopicVideos.tsx` |
| Admin tarqatma | `frontend/src/components/admin/AdminTopicHandouts.tsx` |
| Norm (API) | `backend_fastapi/app/services/topic_norm.py` |
| Fan katalogi | `frontend/src/components/admin/AdminSyllabusCatalog.tsx` |
| Biriktirish | `frontend/src/components/admin/AdminCourseAssignments.tsx` |
| Staff kafedra | `backend_fastapi/app/services/staff_department.py` |
| Fan API | `backend_fastapi/app/api/routes/syllabus_catalog.py` |

## Qoidalar (qisqa)

1. Yangi UI da **yo‘nalish** bosqichi / select qo‘shmang.
2. Fan = PDF/syllabus; mavzu = topic code.
3. Material biriktirish: fan + mavzu; variant avtomatik.
4. Teacher keyingi qadam: **Keyingi** → ma’ruza matni.
5. FastAPI-first; yangi endpointlarni Django ga ulamang.
6. O‘qitadigan fanlar — kafedra kesimida staff self-select; Profile da tahrir.
