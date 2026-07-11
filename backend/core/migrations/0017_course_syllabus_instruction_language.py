from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0016_device_pairing_desktop_secret'),
    ]

    operations = [
        migrations.AddField(
            model_name='coursesyllabus',
            name='instruction_language',
            field=models.CharField(
                choices=[('uz', 'Uzbek'), ('en', 'English'), ('ru', 'Russian')],
                db_index=True,
                default='uz',
                max_length=8,
            ),
        ),
    ]
