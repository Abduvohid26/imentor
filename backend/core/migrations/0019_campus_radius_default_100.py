# Generated manually — radius default 1000 -> 100

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0018_staff_profile'),
    ]

    operations = [
        migrations.AlterField(
            model_name='campusbuilding',
            name='radius_m',
            field=models.PositiveIntegerField(default=100),
        ),
        migrations.AlterField(
            model_name='staffscheduleslot',
            name='radius_m',
            field=models.PositiveIntegerField(default=100),
        ),
    ]
