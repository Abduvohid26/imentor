from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0010_campus_building_and_slot_fk'),
    ]

    operations = [
        migrations.CreateModel(
            name='DevicePairingSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('pairing_token', models.CharField(db_index=True, max_length=64, unique=True)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('confirmed', 'Confirmed'), ('picked_up', 'Picked up'), ('expired', 'Expired')], db_index=True, default='pending', max_length=16)),
                ('owner_key', models.CharField(blank=True, db_index=True, max_length=128)),
                ('role', models.CharField(default='hodim', max_length=16)),
                ('profile_snapshot', models.JSONField(default=dict)),
                ('access_token', models.TextField(blank=True)),
                ('refresh_token', models.TextField(blank=True)),
                ('expires_at', models.DateTimeField(db_index=True)),
                ('confirmed_at', models.DateTimeField(blank=True, null=True)),
                ('picked_up_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
            ],
            options={
                'ordering': ['-created_at'],
                'indexes': [models.Index(fields=['status', 'expires_at'], name='core_device_status_8a1f2c_idx')],
            },
        ),
    ]
