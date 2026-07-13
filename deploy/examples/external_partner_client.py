#!/usr/bin/env python3
"""
iMentor tashqi API — to'liq integratsiya namunasi (hamkor servis).

Ishlatish:
  export IMENTOR_API_BASE=https://imentor.devflix.uz/api
  export IMENTOR_API_KEY=your-partner-key
  python deploy/examples/external_partner_client.py

  # yoki local:
  IMENTOR_API_BASE=http://localhost:8080/api IMENTOR_API_KEY=dev-key python deploy/examples/external_partner_client.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def api_base() -> str:
    return (os.environ.get('IMENTOR_API_BASE') or 'http://localhost:8080/api').rstrip('/')


def api_key() -> str:
    key = (os.environ.get('IMENTOR_API_KEY') or os.environ.get('IMENTOR_EXTERNAL_API_KEYS') or '').strip()
    if not key:
        # birinchi kalit (vergul bilan ajratilgan bo'lsa)
        key = (os.environ.get('IMENTOR_EXTERNAL_API_KEYS') or '').split(',')[0].strip()
    if not key:
        print('IMENTOR_API_KEY o\'rnating', file=sys.stderr)
        sys.exit(1)
    return key


def request_json(path: str, *, params: dict | None = None) -> dict | list:
    query = f'?{urllib.parse.urlencode(params)}' if params else ''
    url = f'{api_base()}{path}{query}'
    req = urllib.request.Request(
        url,
        headers={'Accept': 'application/json', 'X-Api-Key': api_key()},
        method='GET',
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode('utf-8', errors='replace')
        raise SystemExit(f'HTTP {exc.code} {path}: {body}') from exc


def main() -> None:
    print('=== 1. Katalog statistikasi (kafedra / fan / yo\'nalish / mavzu) ===')
    catalog_stats = request_json('/v1/external/catalog/stats/')
    print(json.dumps(catalog_stats, ensure_ascii=False, indent=2))

    print('\n=== 2. Kafedralar ===')
    departments = request_json('/v1/external/catalog/departments/')
    for dept in departments.get('results', [])[:5]:
        print(f"  - {dept['name']} ({dept['code']})")

    print('\n=== 3. Fanlar (birinchi sahifa) ===')
    subjects = request_json('/v1/external/catalog/subjects/', params={'page_size': 5})
    rows = subjects.get('results', [])
    if not rows:
        print('  Fan topilmadi')
        return

    for row in rows:
        print(
            f"  - {row['subject_name']} [{row['subject_code']}] "
            f"— {row['variants_count']} yo'nalish, {row['topics_count']} mavzu"
        )

    subject_code = rows[0]['subject_code']
    print(f"\n=== 4. Fan tafsiloti: {subject_code} ===")
    detail = request_json(f'/v1/external/catalog/subjects/{urllib.parse.quote(subject_code, safe="")}/')
    first_variant = (detail.get('variants') or [{}])[0]
    variant_label = first_variant.get('label') or 'PI'
    topics = first_variant.get('topics') or []
    topic_code = (topics[0].get('id') if topics else 'm1').lower()
    print(f"  Yo'nalish: {variant_label}, birinchi mavzu: {topic_code}")

    print('\n=== 5. Testlar statistikasi ===')
    test_stats = request_json('/v1/external/tests/stats/')
    print(f"  Jami test: {test_stats.get('totals', {}).get('test_count', 0)}")

    print('\n=== 6. Testlar ro\'yxati (fan + yo\'nalish + mavzu bo\'yicha) ===')
    tests = request_json(
        '/v1/external/tests/',
        params={
            'subject_code': subject_code,
            'variant_label': variant_label,
            'topic_code': topic_code,
            'page_size': 3,
        },
    )
    test_rows = tests.get('results', [])
    if not test_rows:
        print('  Hali e\'lon qilingan test yo\'q (1 soat kutish yoki hodim test yaratishi kerak)')
        return

    test_id = test_rows[0]['id']
    print(f"  Topildi: test id={test_id}, savollar={test_rows[0].get('question_count')}")

    print(f'\n=== 7. Test savollari (id={test_id}, limit=10) ===')
    payload = request_json(f'/v1/external/tests/{test_id}/', params={'question_limit': 10})
    questions = (payload.get('payload') or {}).get('questions') or []
    print(f"  Qaytarildi: {payload.get('question_count_returned')} / {payload.get('question_count_available')}")
    if questions:
        print(f"  Birinchi savol: {questions[0].get('question', '')[:80]}…")
    print(f"  document_id: {payload.get('document_id')}")


if __name__ == '__main__':
    main()
