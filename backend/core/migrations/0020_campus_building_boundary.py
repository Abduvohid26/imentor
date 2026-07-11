# Generated manually — campus building polygon boundary

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0019_campus_radius_default_100'),
    ]

    operations = [
        migrations.AddField(
            model_name='campusbuilding',
            name='boundary',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Bino chegarasi: [[lat, lng], ...] kamida 3 nuqta.',
            ),
        ),
    ]
