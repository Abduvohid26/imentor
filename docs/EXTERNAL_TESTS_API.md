# iMentor — Tashqi API (partner integratsiya)

Hamkor tizimlar uchun to‘liq qo‘llanma.

| Blok | Mazmun |
|------|--------|
| **A. Katalog** | Kafedra / fan / yo‘nalish / mavzu nomlari |
| **B. Testlar** | Hodimlar yaratgan test savollari (uz / ru / en) |
| **C. Keys** | Klinik keys (case study) savollari bazasi — `scenario` + `answer` |

| | |
|---|---|
| **Auth** | Header `X-Api-Key: <kalit>` (JWT kerak emas) |
| **Server `.env`** | `IMENTOR_EXTERNAL_API_KEYS=kalit1,kalit2` |
| **Base URL (prod)** | `https://imentor.devflix.uz/api` |
| **Base URL (local)** | `http://127.0.0.1:88/api` |

Kalit yo‘q / noto‘g‘ri → **HTTP 403**. Yangi testlar darhol e’lon qilinadi (`PUBLISH_DELAY=0`).

---

## 0. Endpointlar

### Katalog (nomlar + tuzilma, savolsiz)

| Method | Path |
|--------|------|
| GET | `/v1/external/catalog/stats/` |
| GET | `/v1/external/catalog/departments/` |
| GET | `/v1/external/catalog/departments/<department_code>/` |
| GET | `/v1/external/catalog/subjects/<subject_code>/` |
| GET | `/v1/external/catalog/subjects/?department_code=...` |
| GET | `/v1/external/catalog/departments/<department_code>/subjects/` |

### Testlar

| Method | Path | Izoh |
|--------|------|------|
| GET | `/v1/external/tests/stats/` | Statistika |
| GET | `/v1/external/tests/` | Ro‘yxat (savolsiz meta) |
| GET | `/v1/external/tests/<id>/?question_limit=10..30&language=uz\|ru\|en` | Bitta test; `language` ixtiyoriy |
| GET | `/v1/external/questions/sample/?subject_code=...&count=10..30` | Unique aralash bank; **har savol avto 3 tilda** |

### Keys (case study)

| Method | Path | Izoh |
|--------|------|------|
| GET | `/v1/external/keys/stats/` | Statistika |
| GET | `/v1/external/keys/` | Ro‘yxat (savolsiz meta) |
| GET | `/v1/external/keys/<id>/?question_limit=1..50` | Bitta keys + savollar |
| GET | `/v1/external/keys/scenarios/` | **Tekis savollar banki** — UI da to‘g‘ridan-to‘g‘ri chiqarish uchun |

---

## 1. Ierarxiya va kalit maydonlar

```
Kafedra → Fan → Yo‘nalish → Mavzu → Test savollari / Keys savollari
```

| Maydon | Ma’nosi |
|--------|---------|
| `department_code` | Kafedra kodi (`fiziologiya`) |
| `department_name` | Kafedra nomi |
| `subject_code` | Fan kodi (`fiziologiya__anatomiya`) |
| `subject_name` | Fan nomi |
| `variant_label` | Yo‘nalish (`PI`, `DI`, …) |
| `topic_code` | Mavzu kodi (`m1`, `l2` — kichik harf) |
| `topic` | Mavzu sarlavhasi |
| `syllabus_id` | Fan yozuvi PK |
| `topic_norm` | `{syllabusId}::{variant}::{topicCode}` |

`subject_code` / `department_code` — barqaror integratsiya kalitlari.

---

## 2. Savol soni chegarasi (testlar 10–30, keys 1–50)

| Parametr | Vazifa |
|----------|--------|
| `question_limit` | Detail: nechta savol (10–30) |
| `question_count` | `question_limit` alias |
| `min_questions` / `max_questions` | Ro‘yxat filtri (10–30) |
| `count` | Sample endpointda savol soni (10–30) |

Har javobda: `"question_limit_bounds": { "min": 10, "max": 30 }`.

> **Keys uchun chegara boshqacha: 1–50.** `/v1/external/keys/...` javoblarida
> `"question_limit_bounds": { "min": 1, "max": 50 }` qaytadi — keysda odatda
> 3–5 ta savol bo‘ladi, shuning uchun 10 lik pastki chegara qo‘yilmagan.

---

## 3. Tillar (uz / ru / en)

### Qoidalar

1. **`GET /external/questions/sample/`** — `language` **shart emas**. Har savol `languages.uz` / `languages.ru` / `languages.en` ichida birga qaytadi.
2. **`GET /external/tests/<id>/`** — ixtiyoriy `?language=ru` (alias: `lang`) top-level `payload.questions` ni shu tilga chiqaradi.
3. `correctOptionIndex` **barcha tillarda bir xil** (faqat matn tarjima).
4. Tarjima yo‘q yoki **sifat past** (masalan, `ru` kaliti ostida o‘zbekcha matn) bo‘lsa — shu til **chiqarilmaydi**. `available_languages` faqat haqiqiy tillarni ko‘rsatadi (ba’zan `["uz","en"]` bo‘lishi mumkin).

### Sample savol shakli

```json
{
  "correctOptionIndex": 2,
  "available_languages": ["uz", "ru", "en"],
  "languages": {
    "uz": {
      "question": "...",
      "options": ["A", "B", "C", "D", "E"],
      "explanation": "...",
      "optionExplanations": ["...", "...", "...", "...", "..."]
    },
    "ru": {
      "question": "...",
      "options": ["А", "Б", "В", "Г", "Д"],
      "explanation": "..."
    },
    "en": {
      "question": "...",
      "options": ["A", "B", "C", "D", "E"],
      "explanation": "..."
    }
  },
  "references": [{ "title": "...", "pages": "..." }],
  "source_test_id": 24
}
```

Hamkor: kerakli til → `questions[i].languages.uz|ru|en`.

---

## 4. Katalog API (A)

### 4.1 `GET /v1/external/catalog/stats/`

Kafedra / fan / yo‘nalish / mavzu sonlari.

### 4.2 `GET /v1/external/catalog/departments/`

1-qadam — kafedra tanlash.

```json
{
  "count": 28,
  "next_step": "GET /v1/external/catalog/departments/<department_code>/subjects/",
  "results": [
    {
      "code": "fiziologiya",
      "name": "Fiziologiya kafedrasi",
      "sort_order": 1,
      "subjects_count": 12,
      "tests_count": 4
    }
  ]
}
```

| Maydon | Ma'nosi |
|--------|---------|
| `subjects_count` | Shu kafedra ochilganda **qaytadigan** fanlar soni (mavzusi bor sillabuslar). `.../subjects/` natijasi bilan doim mos. |
| `tests_count` | Shu kafedrada e'lon qilingan testlar soni. `0` bo'lsa — kafedrani tanlashning ma'nosi yo'q, savol chiqmaydi. |

### 4.3 `GET /v1/external/catalog/departments/<department_code>/`

2-qadam — kafedra + barcha fanlar (`variants[].topics[]` bilan).

### 4.4 `GET /v1/external/catalog/subjects/<subject_code>/`

Bitta fan (to‘liq).

### 4.5 `GET /v1/external/catalog/subjects/`

Fanlar summary (`department_code`, `q`, `page`, `page_size`).

---

## 5. Testlar API (B)

### 5.1 `GET /v1/external/tests/stats/`

E’lon qilingan testlar statistikasi: `totals`, `by_subject`, `by_variant`, `by_topic`, `by_author`, `recent`.

### 5.2 `GET /v1/external/tests/`

Ro‘yxat (savolsiz meta).

**Query:** `subject_code`, `variant_label`, `topic_code`, `syllabus_id`, `q`, `author`, `sort`, `page`, `page_size`, `min_questions`, `max_questions`.

### 5.3 `GET /v1/external/tests/<id>/`

Bitta test + savollar.

**Query:**

| Param | Izoh |
|-------|------|
| `question_limit` / `question_count` | 10–30; yo‘q = hammasi |
| `language` / `lang` | `uz` \| `ru` \| `en` — top-level `payload.questions` shu tilda. Yo‘q = primary (odatda `uz`). Yaroqsiz tarjima → primary fallback |

**Javob namunasi** (`?question_limit=20&language=ru`):

```json
{
  "id": 42,
  "kind": "test",
  "topic": "Yurak anatomiyasi",
  "subject_code": "fiziologiya__anatomiya",
  "subject_name": "Anatomiya",
  "department_code": "fiziologiya",
  "department_name": "Fiziologiya kafedrasi",
  "variant_label": "PI",
  "topic_code": "m1",
  "syllabus_id": 45,
  "language": "ru",
  "available_languages": ["uz", "ru", "en"],
  "question_count": 25,
  "question_limit": 20,
  "question_count_available": 25,
  "question_count_returned": 20,
  "question_limit_bounds": { "min": 10, "max": 30 },
  "document_id": "IM-000042-AB12CD34",
  "verification_code": "A1B2C3D4E5F6G7H8",
  "payload": {
    "topic": "Анатомия сердца",
    "primaryLanguage": "uz",
    "questions": [
      {
        "question": "Пациент 45 лет ...",
        "options": ["А", "Б", "В", "Г", "Д"],
        "correctOptionIndex": 2,
        "explanation": "Анализ правильного ответа ...",
        "optionExplanations": [
          "Почему А неверен",
          "Почему Б неверен",
          "Почему В верен",
          "Почему Г неверен",
          "Почему Д неверен"
        ]
      }
    ],
    "translations": {
      "uz": {
        "topic": "Yurak anatomiyasi",
        "questions": [{ "question": "...", "options": ["A", "B", "C", "D", "E"], "correctOptionIndex": 2, "explanation": "..." }]
      },
      "en": {
        "topic": "Heart anatomy",
        "questions": [{ "question": "...", "options": ["A", "B", "C", "D", "E"], "correctOptionIndex": 2, "explanation": "..." }]
      }
    }
  }
}
```

**Eslatmalar**

- `optionExplanations` — ixtiyoriy (eski testlarda bo‘lmasligi mumkin).
- `translations` — primary tildan tashqari tillar. Har kalit: `{ topic, questions[] }`.
- Soxta/yomon tarjima (masalan, `ru` = o‘zbekcha matn) API tomonidan **filtrlanadi** — `available_languages` va `languages` da chiqmaydi.

### 5.4 `GET /v1/external/questions/sample/` ⭐ tavsiya etiladi

Kafedra/fan doirasidagi **barcha** e’lon qilingan testlardan unique savollarni aralashtirib qaytaradi.

**Majburiy** (kamida bittasi): `subject_code` yoki `department_code`.

**Ixtiyoriy:** `count` (10–30), `variant_label`, `topic_code`, `syllabus_id`.

**Til:** `language` **shart emas** — har savol `languages` ichida mavjud tillarda (odatda uz+ru+en).

**Unique:** primary til matni (`lower` + whitespace normalize).

```bash
GET /api/v1/external/questions/sample/?subject_code=fiziologiya__anatomiya&count=20
Header: X-Api-Key: <kalit>
```

**To‘liq javob namunasi:**

```json
{
  "subject_code": "fiziologiya__anatomiya",
  "department_code": "",
  "variant_label": "",
  "topic_code": "",
  "syllabus_id": "",
  "available_languages": ["uz", "ru", "en"],
  "count_requested": 20,
  "count_available": 87,
  "count_returned": 20,
  "tests_scanned": 5,
  "question_limit_bounds": { "min": 10, "max": 30 },
  "questions": [
    {
      "correctOptionIndex": 2,
      "available_languages": ["uz", "ru", "en"],
      "languages": {
        "uz": {
          "question": "45 yoshli bemor ...",
          "options": ["A", "B", "C", "D", "E"],
          "explanation": "To‘g‘ri javob tahlili ...",
          "optionExplanations": [
            "A nega xato",
            "B nega xato",
            "C nega to‘g‘ri",
            "D nega xato",
            "E nega xato"
          ]
        },
        "ru": {
          "question": "Пациент 45 лет ...",
          "options": ["А", "Б", "В", "Г", "Д"],
          "explanation": "Анализ правильного ответа ...",
          "optionExplanations": [
            "Почему А неверен",
            "Почему Б неверен",
            "Почему В верен",
            "Почему Г неверен",
            "Почему Д неверен"
          ]
        },
        "en": {
          "question": "A 45-year-old patient ...",
          "options": ["A", "B", "C", "D", "E"],
          "explanation": "Rationale for the correct answer ...",
          "optionExplanations": [
            "Why A is wrong",
            "Why B is wrong",
            "Why C is correct",
            "Why D is wrong",
            "Why E is wrong"
          ]
        }
      },
      "references": [
        {
          "title": "Guyton and Hall Textbook of Medical Physiology",
          "authors": "John E. Hall",
          "publisher": "Elsevier",
          "year": "2021",
          "url": "https://pubmed.ncbi.nlm.nih.gov/?term=Guyton"
        }
      ],
      "source_test_id": 24
    }
  ]
}
```

Agar biror til yaroqsiz bo‘lsa, masalan faqat `uz`+`en`:

```json
{
  "available_languages": ["uz", "en"],
  "languages": {
    "uz": { "question": "...", "options": ["A", "B", "C", "D", "E"], "explanation": "..." },
    "en": { "question": "...", "options": ["A", "B", "C", "D", "E"], "explanation": "..." }
  }
}
```

**Xatoliklar**

| Kod | Sabab |
|-----|--------|
| 400 | `subject_code` va `department_code` ikkalasi ham yo‘q |
| 400 | `count` / `question_limit` 10–30 dan tashqari |
| 400 | `language` qiymati `uz\|ru\|en` emas (faqat detail) |
| 403 | `X-Api-Key` yo‘q/noto‘g‘ri |
| 404 | Test topilmadi |

---

## 6. Keys API (C) — klinik keyslar bazasi

Keys (case study) — bu bemor holati (`scenario`) va uning yechimi (`answer`)
dan iborat savollar. Testdan farqi:

| | Testlar | Keys |
|---|---|---|
| Savol maydoni | `question` + `options[]` | `scenario` (uzun matn) |
| Javob | `correctOptionIndex` | `answer` (matn) |
| Tillar | uz / ru / en (`translations`) | **Bitta til** — qaysi tilda yaratilgan bo‘lsa |
| Savol soni chegarasi | 10–30 | 1–50 |
| `kind` | `"test"` | `"case"` |

Katalog (kafedra / fan / mavzu) **umumiy** — 4-bo‘limdagi endpointlar keyslar
uchun ham ishlaydi, filtr parametrlari ham bir xil.

### 6.1 `GET /v1/external/keys/stats/`

E’lon qilingan keyslar statistikasi: `totals`, `by_subject`, `by_variant`,
`by_topic`, `by_author`, `recent`. `totals.case_count` — jami keyslar soni,
`totals.questions_total` — ular ichidagi savollar soni.

### 6.2 `GET /v1/external/keys/`

Ro‘yxat (savolsiz meta) — testlar ro‘yxati bilan bir xil shakl, `kind: "case"`.

**Query:** `subject_code`, `department_code`, `variant_label`, `topic_code`,
`syllabus_id`, `q`, `page`, `page_size`, `min_questions`, `max_questions` (1–50).

```json
{
  "count": 3,
  "page": 1,
  "page_size": 50,
  "question_limit_bounds": { "min": 1, "max": 50 },
  "results": [
    {
      "id": 12,
      "kind": "case",
      "topic": "Bioelektrik hodisalar",
      "subject_code": "fiziologiya__normal-fiziologiya",
      "subject_name": "Normal fiziologiya",
      "department_code": "fiziologiya",
      "department_name": "Fiziologiya",
      "variant_label": "DI",
      "topic_code": "m1",
      "syllabus_id": 178,
      "question_count": 3,
      "created_at": "2026-07-28T08:37:55+00:00",
      "document_id": "IM-000012-24F5B805",
      "verification_code": "24F5B805F5D287E4"
    }
  ]
}
```

### 6.3 `GET /v1/external/keys/<id>/`

Bitta keys + savollar. **Query:** `question_limit` / `question_count` (1–50).

```json
{
  "id": 12,
  "kind": "case",
  "topic": "Bioelektrik hodisalar",
  "question_count_available": 3,
  "question_count_returned": 1,
  "question_limit": 1,
  "question_limit_bounds": { "min": 1, "max": 50 },
  "document_id": "IM-000012-24F5B805",
  "payload": {
    "topic": "Bioelektrik hodisalar",
    "questions": [
      {
        "scenario": "46 yoshli erkak bemor ko‘ngil aynishi ... EKG da QT uzayishi aniqlangan.",
        "answer": "Torsades de Pointes; magniy sulfat ...",
        "focus": "tashxis"
      }
    ],
    "references": [{ "title": "Guyton and Hall ...", "year": "2021" }]
  }
}
```

### 6.4 `GET /v1/external/keys/scenarios/` ⭐ UI uchun tavsiya

Filtr doirasidagi **barcha** keyslardan savollarni bitta tekis ro‘yxatga yig‘adi
va takrorlarni olib tashlaydi (`scenario` matni bo‘yicha). UI da keysni ochib
o‘tirmasdan, to‘g‘ridan-to‘g‘ri savollar ro‘yxatini chiqarish uchun.

**Query:**

| Param | Izoh |
|-------|------|
| `subject_code` / `department_code` | Filtr (ixtiyoriy — hech biri berilmasa butun baza) |
| `variant_label`, `topic_code`, `syllabus_id`, `q` | Qo‘shimcha filtrlar |
| `count` (alias `question_limit`, `question_count`) | 1–50; yo‘q = hammasi |
| `shuffle` | Default `true`. `shuffle=false` → tartib saqlanadi (sahifalash uchun) |
| `page`, `page_size` | Sahifalash (max 200) |

> Sahifalashda `shuffle=false` bering — aks holda har so‘rovda tartib
> o‘zgaradi va sahifalar orasida savollar takrorlanishi mumkin.

```bash
GET /api/v1/external/keys/scenarios/?department_code=fiziologiya&shuffle=false&page_size=20
Header: X-Api-Key: <kalit>
```

```json
{
  "count": 9,
  "page": 1,
  "page_size": 20,
  "count_requested": null,
  "count_available": 9,
  "count_returned": 9,
  "cases_scanned": 3,
  "subject_code": "",
  "department_code": "fiziologiya",
  "question_limit_bounds": { "min": 1, "max": 50 },
  "results": [
    {
      "scenario": "46 yoshli erkak bemor ...",
      "answer": "Torsades de Pointes ...",
      "focus": "tashxis",
      "options": [],
      "explanation": "",
      "references": [{ "title": "Guyton and Hall ...", "year": "2021" }],
      "source_case_id": 12,
      "topic": "Bioelektrik hodisalar"
    }
  ]
}
```

| Maydon | Ma’nosi |
|--------|---------|
| `results[].scenario` | Bemor holati (uzun matn, `\n` bilan abzatslar) |
| `results[].answer` | Kutilayotgan javob / tahlil |
| `results[].focus` | `tashxis` \| `davolash` \| `profilaktika` (bo‘sh bo‘lishi mumkin) |
| `results[].options` / `correctOptionIndex` | Ba’zi keyslarda variantli savol bo‘ladi; odatda `options` bo‘sh |
| `results[].source_case_id` | Manba keys `id` — `/external/keys/<id>/` bilan ochiladi |
| `count` | Sahifalashdagi umumiy soni |
| `count_available` | Filtr bo‘yicha topilgan unique savollar soni (`count` kesilishidan oldin) |
| `cases_scanned` | Nechta keys ko‘rildi |

**Xatoliklar**

| Kod | Sabab |
|-----|--------|
| 400 | `count` / `min_questions` / `max_questions` 1–50 dan tashqari |
| 403 | `X-Api-Key` yo‘q/noto‘g‘ri |
| 404 | Keys topilmadi (yoki bu `id` test, keys emas) |

---

## 7. Integratsiya oqimi

1. Kalit: `IMENTOR_EXTERNAL_API_KEYS=...`
2. `GET /v1/external/catalog/departments/` → kafedra
3. `GET /v1/external/catalog/departments/<code>/` → fan (+ ixtiyoriy variant/mavzu)
4. **Imtihon banki (tavsiya):**  
   `GET /v1/external/questions/sample/?subject_code=...&count=20`  
   → har savol `languages.uz|ru|en`
5. **Keys banki (tavsiya):**  
   `GET /v1/external/keys/scenarios/?subject_code=...&shuffle=false&page_size=20`  
   → tekis `results[]`: `scenario` + `answer`
6. (Ixtiyoriy) bitta test: `GET /v1/external/tests/<id>/?question_limit=20&language=ru`
7. (Ixtiyoriy) bitta keys: `GET /v1/external/keys/<id>/`
8. `document_id` + `verification_code` saqlash

Minimal oqim: **kafedra → fan → sample / scenarios**. `variant_label` / `topic_code` shart emas.

---

## 8. curl misollar

```bash
BASE=https://imentor.devflix.uz/api
KEY=YOUR_KEY

# Katalog
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/external/catalog/stats/"
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/external/catalog/departments/"
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/external/catalog/departments/fiziologiya/"

# Testlar ro‘yxati
curl -s -H "X-Api-Key: $KEY" \
  "$BASE/v1/external/tests/?subject_code=fiziologiya__anatomiya"

# Bitta test — o‘zbek (default)
curl -s -H "X-Api-Key: $KEY" \
  "$BASE/v1/external/tests/42/?question_limit=20"

# Bitta test — rus (top-level questions)
curl -s -H "X-Api-Key: $KEY" \
  "$BASE/v1/external/tests/42/?question_limit=20&language=ru"

# Sample bank — har savol uz+ru+en birga (til param shart emas)
curl -s -H "X-Api-Key: $KEY" \
  "$BASE/v1/external/questions/sample/?subject_code=fiziologiya__anatomiya&count=10"

# Keys statistikasi
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/external/keys/stats/"

# Keyslar ro‘yxati
curl -s -H "X-Api-Key: $KEY" \
  "$BASE/v1/external/keys/?department_code=fiziologiya"

# Bitta keys
curl -s -H "X-Api-Key: $KEY" "$BASE/v1/external/keys/12/?question_limit=3"

# Keys savollar banki — UI ro‘yxati uchun (sahifalanadigan, barqaror tartib)
curl -s -H "X-Api-Key: $KEY" \
  "$BASE/v1/external/keys/scenarios/?department_code=fiziologiya&shuffle=false&page_size=20"
```

---

## 9. Namuna skript

`deploy/examples/external_partner_client.py`

```bash
export IMENTOR_API_BASE=https://imentor.devflix.uz/api
export IMENTOR_API_KEY=hamkor-kalit
python deploy/examples/external_partner_client.py
```

---

## 10. HTTP kodlar

| Kod | Ma’no |
|-----|--------|
| 200 | OK |
| 400 | Noto‘g‘ri query (`count`, `language`, …) |
| 403 | API kalit yo‘q/noto‘g‘ri: `{ "detail": "Valid X-Api-Key header required." }` |
| 404 | Topilmadi |

---

## 11. Nima yuborilmaydi

- JWT, parol, telefon
- PDF fayllar (faqat parsed mavzu ro‘yxati)
- Ma’ruza / taqdimot
- Admin ichki ma’lumotlar

---

## 12. Server sozlash

`deploy/.env.production`:

```env
IMENTOR_EXTERNAL_API_KEYS=hamkor-secret-kalit-2026
```

Bir nechta hamkor:

```env
IMENTOR_EXTERNAL_API_KEYS=kalit-lms,kalit-mobile
```

Tekshiruv:

```bash
curl -H "X-Api-Key: hamkor-secret-kalit-2026" \
  "https://imentor.devflix.uz/api/v1/external/catalog/stats/"
```

---

## Bog‘liq hujjatlar

- [FULL_PLATFORM_FLOW.txt](FULL_PLATFORM_FLOW.txt) — ichki oqim
- [README.md](README.md) — umumiy
- [ADMIN_README.md](ADMIN_README.md) — administrator

Aloqa: API kalit va texnik savollar uchun iMentor administratoriga murojaat qiling.
