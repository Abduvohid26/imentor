from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0029_preparedcontent_syllabus"),
    ]

    operations = [
        migrations.CreateModel(
            name="TopicVideo",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("owner_key", models.CharField(db_index=True, max_length=128)),
                ("author_name", models.CharField(blank=True, max_length=255)),
                ("topic", models.CharField(max_length=255)),
                ("topic_norm", models.CharField(db_index=True, max_length=255)),
                ("title", models.CharField(blank=True, max_length=255)),
                ("youtube_url", models.CharField(max_length=512)),
                ("youtube_id", models.CharField(db_index=True, max_length=32)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
            ],
            options={
                "verbose_name": "Mavzu videosi",
                "verbose_name_plural": "Mavzu videolari",
                "ordering": ["sort_order", "created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="topicvideo",
            index=models.Index(
                fields=["topic_norm", "sort_order", "created_at"],
                name="core_topicv_topic_n_6e0c9e_idx",
            ),
        ),
    ]
