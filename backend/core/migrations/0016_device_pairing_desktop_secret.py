from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0015_topic_presentation'),
    ]

    operations = [
        migrations.AddField(
            model_name='devicepairingsession',
            name='desktop_secret',
            field=models.CharField(blank=True, db_index=True, max_length=64),
        ),
    ]
