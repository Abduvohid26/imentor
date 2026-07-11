from django.db import migrations, models

import core.models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0011_device_pairing_session"),
    ]

    operations = [
        migrations.CreateModel(
            name="TopicHandout",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("owner_key", models.CharField(db_index=True, max_length=128)),
                ("author_name", models.CharField(blank=True, max_length=255)),
                ("topic", models.CharField(max_length=255)),
                ("topic_norm", models.CharField(db_index=True, max_length=255)),
                ("title", models.CharField(blank=True, max_length=255)),
                (
                    "kind",
                    models.CharField(
                        choices=[("pdf", "PDF"), ("image", "Image")],
                        default="pdf",
                        max_length=16,
                    ),
                ),
                ("file", models.FileField(max_length=512, upload_to=core.models.handout_upload_to)),
                ("file_name", models.CharField(max_length=512)),
                ("file_size", models.PositiveIntegerField(default=0)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
            ],
            options={
                "ordering": ["sort_order", "created_at"],
                "indexes": [
                    models.Index(fields=["topic_norm", "sort_order", "created_at"], name="core_topich_topic_n_0a8f2d_idx"),
                    models.Index(fields=["owner_key", "-created_at"], name="core_topich_owner_k_7c4e91_idx"),
                ],
            },
        ),
    ]
