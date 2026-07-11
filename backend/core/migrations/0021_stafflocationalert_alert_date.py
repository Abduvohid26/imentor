# Generated manually — kunlik ogohlantirish dublikatini oldini olish

import datetime

from django.db import migrations, models
from django.utils import timezone


def fill_alert_dates(apps, schema_editor):
    Alert = apps.get_model("core", "StaffLocationAlert")
    for row in Alert.objects.all().only("id", "created_at"):
        row.alert_date = timezone.localtime(row.created_at).date()
        row.save(update_fields=["alert_date"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0020_campus_building_boundary"),
    ]

    operations = [
        migrations.AddField(
            model_name="stafflocationalert",
            name="alert_date",
            field=models.DateField(db_index=True, default=datetime.date(2000, 1, 1)),
            preserve_default=False,
        ),
        migrations.RunPython(fill_alert_dates, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="stafflocationalert",
            constraint=models.UniqueConstraint(
                fields=("owner_key", "slot", "alert_date"),
                name="core_stafflocationalert_owner_slot_day_uniq",
            ),
        ),
    ]
