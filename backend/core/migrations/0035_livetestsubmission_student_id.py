from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0034_subject_book_chunk"),
    ]

    operations = [
        migrations.AddField(
            model_name="livetestsubmission",
            name="student_id",
            field=models.CharField(blank=True, db_index=True, default="", max_length=64),
        ),
    ]
