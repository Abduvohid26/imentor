from django.db import migrations, models
import django.db.models.deletion


def backfill_syllabus_fk(apps, schema_editor):
    """Mavjud test/keyslarni subject_code bo'yicha fanga (CourseSyllabus) bog'lash."""
    PreparedContent = apps.get_model("core", "PreparedContent")
    CourseSyllabus = apps.get_model("core", "CourseSyllabus")
    by_code = {c.subject_code: c.pk for c in CourseSyllabus.objects.all()}
    for item in PreparedContent.objects.exclude(subject_code="").iterator():
        fan_pk = by_code.get(item.subject_code)
        if fan_pk and item.syllabus_id != fan_pk:
            item.syllabus_id = fan_pk
            item.save(update_fields=["syllabus"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0028_staffcourseselection_variant_uniq"),
    ]

    operations = [
        migrations.AddField(
            model_name="preparedcontent",
            name="syllabus",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="prepared_contents",
                to="core.coursesyllabus",
            ),
        ),
        migrations.RunPython(backfill_syllabus_fk, noop),
    ]
