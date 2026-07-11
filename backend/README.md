# Backend (Django REST)

## Stack
- Python 3.14+
- Django 6
- Django REST Framework
- django-cors-headers
- Simple JWT
- drf-spectacular (OpenAPI/Swagger)

## Settings layout
- `config/settings/base.py`
- `config/settings/dev.py`
- `config/settings/prod.py`
- `config/settings/__init__.py` (`DJANGO_ENV=dev|prod` selector)

## Run
```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py runserver 0.0.0.0:8000
```

## API
- `GET /api/health/`
- `GET /api/prepared-content/?owner_key=<...>&kind=<lecture|presentation|case|test>&topic_norm=<...>` (legacy, disabled in prod by default)
- `POST /api/prepared-content/` (legacy, disabled in prod by default)
- `POST /api/v1/auth/token/`
- `POST /api/v1/auth/token/refresh/`
- `POST /api/v1/auth/local-login/` (bridge for local frontend auth to JWT)
- `GET /api/v1/auth/me/` (JWT + role: `admin|hodim|startuper`)
- `GET/POST /api/v1/prepared-content/` (JWT + role protected)
- `GET /api/docs/` (Swagger UI)

## Important security flag
- `DJANGO_ALLOW_LEGACY_PREPARED_CONTENT_API=False` in production.
- Frontend production flow uses JWT-protected `/api/v1/prepared-content/`.

### POST body example
```json
{
  "owner_key": "998901112233",
  "kind": "lecture",
  "topic": "Yurak yetishmovchiligi",
  "topic_norm": "yurak yetishmovchiligi",
  "payload": {}
}
```
