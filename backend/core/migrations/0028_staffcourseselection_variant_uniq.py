from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0027_staffcourseselection_variant_label"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="staffcourseselection",
            name="core_staff_course_selection_uniq",
        ),
        migrations.AddConstraint(
            model_name="staffcourseselection",
            constraint=models.UniqueConstraint(
                fields=["owner_key", "syllabus", "variant_label"],
                name="core_staff_course_selection_variant_uniq",
            ),
        ),
    ]
