from django.db import migrations, models

import core.models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0017_course_syllabus_instruction_language"),
    ]

    operations = [
        migrations.CreateModel(
            name="StaffProfile",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("owner_key", models.CharField(db_index=True, max_length=128, unique=True)),
                (
                    "photo",
                    models.FileField(
                        blank=True,
                        max_length=512,
                        upload_to=core.models.staff_avatar_upload_to,
                    ),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["-updated_at"],
            },
        ),
    ]
