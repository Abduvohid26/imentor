from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0035_livetestsubmission_student_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="livetestsession",
            name="subject_code",
            field=models.CharField(blank=True, db_index=True, default="", max_length=200),
        ),
    ]
