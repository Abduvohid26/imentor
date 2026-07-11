from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0024_prepared_content_catalog_meta"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="livetestsession",
            index=models.Index(
                fields=["owner_key", "is_closed", "-created_at"],
                name="core_lts_owner_closed_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="livetestsubmission",
            constraint=models.UniqueConstraint(
                condition=~models.Q(participant_key=""),
                fields=("session", "participant_key"),
                name="uniq_live_test_submission_participant",
            ),
        ),
    ]
