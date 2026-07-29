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

  print('\n=== 2. Kafedralar (1-qadam: tanlash) ===')
  departments = request_json('/v1/external/catalog/departments/')
  print(f"  Jami: {departments.get('count', 0)}")
  for dept in departments.get('results', [])[:5]:
    print(f"  - {dept['name']} ({dept['code']}) — {dept.get('subjects_count', 0)} fan")

  if not departments.get('results'):
    print('  Kafedra topilmadi')
    return

  dept_code = departments['results'][0]['code']
  dept_name = departments['results'][0]['name']
  print(f"\n=== 3. Fanlar — tanlangan kafedra: {dept_name} ===")
  subjects = request_json(f'/v1/external/catalog/departments/{dept_code}/subjects/', params={'page_size': 10})
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
    print(f"\n=== 4. Fan tanlandi: {subject_code} ===")
    print("  (Yo'nalish/mavzu shart emas — faqat fan bilan testlar olinadi)")

    print('\n=== 5. Testlar statistikasi ===')
    test_stats = request_json('/v1/external/tests/stats/')
    print(f"  Jami test: {test_stats.get('totals', {}).get('test_count', 0)}")

    print("\n=== 6. Testlar ro'yxati (faqat fan — ichidan random) ===")
    tests = request_json(
        '/v1/external/tests/',
        params={
            'subject_code': subject_code,
            'page_size': 10,
        },
    )
    test_rows = tests.get('results', [])
    if not test_rows:
        print('  Hali e\'lon qilingan test yo\'q (1 soat kutish yoki hodim test yaratishi kerak)')
        return

    import random

    pick = random.choice(test_rows)
    test_id = pick['id']
    print(
        f"  Random tanlandi: test id={test_id}, "
        f"variant={pick.get('variant_label') or '—'}, "
        f"topic={pick.get('topic_code') or '—'}, "
        f"savollar={pick.get('question_count')}"
    )

    print(f'\n=== 7. Test savollari (id={test_id}, limit=10) ===')
    payload = request_json(f'/v1/external/tests/{test_id}/', params={'question_limit': 10})
    questions = (payload.get('payload') or {}).get('questions') or []
    print(f"  Qaytarildi: {payload.get('question_count_returned')} / {payload.get('question_count_available')}")
    if questions:
        print(f"  Birinchi savol: {questions[0].get('question', '')[:80]}…")
    print(f"  document_id: {payload.get('document_id')}")


if __name__ == '__main__':
    main()
