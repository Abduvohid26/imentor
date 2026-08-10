import logging, sys
logging.basicConfig(level=logging.WARNING, format='%(message)s')
from app.core.db import SessionLocal
from app.api.routes.syllabus_catalog import CourseSyllabus
from app.services.syllabus_i18n import ensure_syllabus_translations, collect_topic_titles

ids = [int(x) for x in sys.argv[1:]]
db = SessionLocal()
for sid in ids:
    o = db.get(CourseSyllabus, sid)
    if o is None:
        print(f'{sid}: YO\'Q'); continue
    n = len(collect_topic_titles(o))
    try:
        ensure_syllabus_translations(db, o, ('ru', 'en'))
        db.refresh(o)
        en = len((o.topics_i18n or {}).get('en') or {})
        ru = len((o.topics_i18n or {}).get('ru') or {})
        print(f'{sid}: {o.subject_name[:34]:34s} mavzu={n:3d} en={en:3d} ru={ru:3d} nom_en={bool((o.name_i18n or {}).get("en"))}', flush=True)
    except Exception as e:
        print(f'{sid}: XATO {e}', flush=True)
