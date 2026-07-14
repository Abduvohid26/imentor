from django.db import migrations


def backfill_subject_codes(apps, schema_editor):
    PreparedContent = apps.get_model("core", "PreparedContent")
    CourseSyllabus = apps.get_model("core", "CourseSyllabus")
    by_pk = {c.pk: c.subject_code for c in CourseSyllabus.objects.all()}
    for item in PreparedContent.objects.filter(subject_code="").exclude(syllabus_id=None).iterator():
        code = by_pk.get(item.syllabus_id) or ""
        if code:
            item.subject_code = code
            item.save(update_fields=["subject_code"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0032_academic_department"),
    ]

    operations = [
        migrations.RunPython(backfill_subject_codes, noop),
    ]
