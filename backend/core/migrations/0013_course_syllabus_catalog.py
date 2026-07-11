from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0012_topic_handout"),
    ]

    operations = [
        migrations.CreateModel(
            name="CourseSyllabus",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("subject_name", models.CharField(db_index=True, max_length=255)),
                ("subject_code", models.CharField(db_index=True, max_length=64, unique=True)),
                ("description", models.CharField(blank=True, max_length=512)),
                ("file_name", models.CharField(max_length=512)),
                ("topics", models.JSONField(default=list)),
                ("sort_order", models.PositiveSmallIntegerField(default=0)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["sort_order", "subject_name"],
                "indexes": [
                    models.Index(fields=["is_active", "sort_order", "subject_name"], name="core_course_is_acti_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="StaffCourseSelection",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("owner_key", models.CharField(db_index=True, max_length=128)),
                ("selected_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                (
                    "syllabus",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="selections",
                        to="core.coursesyllabus",
                    ),
                ),
            ],
            options={
                "ordering": ["-selected_at"],
                "indexes": [
                    models.Index(fields=["owner_key", "-selected_at"], name="core_staffc_owner_k_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("owner_key", "syllabus"),
                        name="core_staff_course_selection_uniq",
                    ),
                ],
            },
        ),
    ]
