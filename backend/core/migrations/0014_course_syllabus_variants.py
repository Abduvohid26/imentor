from django.db import migrations, models


def migrate_topics_to_variants(apps, schema_editor):
    CourseSyllabus = apps.get_model("core", "CourseSyllabus")
    for obj in CourseSyllabus.objects.all():
        if obj.variants:
            continue
        if obj.topics:
            obj.variants = [
                {
                    "label": "Asosiy",
                    "file_name": obj.file_name or "syllabus.pdf",
                    "topics": obj.topics,
                }
            ]
            obj.save(update_fields=["variants"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0013_course_syllabus_catalog"),
    ]

    operations = [
        migrations.AddField(
            model_name="coursesyllabus",
            name="variants",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(migrate_topics_to_variants, migrations.RunPython.noop),
    ]
