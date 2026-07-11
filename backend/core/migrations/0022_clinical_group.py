# Generated manually — klinika guruhi modellari

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0021_stafflocationalert_alert_date"),
    ]

    operations = [
        migrations.CreateModel(
            name="ClinicalGroup",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=255)),
                ("code", models.SlugField(blank=True, max_length=64, unique=True)),
                ("address", models.CharField(blank=True, max_length=512)),
                ("phone", models.CharField(blank=True, max_length=32)),
                ("contact_person", models.CharField(blank=True, max_length=255)),
                (
                    "subscription_plan",
                    models.CharField(
                        choices=[("basic", "Basic"), ("standard", "Standard"), ("premium", "Premium")],
                        default="standard",
                        max_length=32,
                    ),
                ),
                (
                    "subscription_status",
                    models.CharField(
                        choices=[
                            ("active", "Active"),
                            ("trial", "Trial"),
                            ("suspended", "Suspended"),
                            ("expired", "Expired"),
                        ],
                        default="active",
                        max_length=32,
                    ),
                ),
                ("subscription_until", models.DateField(blank=True, null=True)),
                ("notes", models.TextField(blank=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Klinika guruhi",
                "verbose_name_plural": "Klinika guruhlari",
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="ClinicalGroupMember",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("owner_key", models.CharField(db_index=True, max_length=128)),
                ("app_role", models.CharField(default="hodim", max_length=16)),
                ("is_clinic_admin", models.BooleanField(default=False)),
                ("first_name", models.CharField(blank=True, max_length=128)),
                ("last_name", models.CharField(blank=True, max_length=128)),
                ("faculty", models.CharField(blank=True, max_length=255)),
                ("department", models.CharField(blank=True, max_length=255)),
                ("direction", models.CharField(blank=True, max_length=255)),
                ("job_title", models.CharField(blank=True, max_length=255)),
                ("study_group", models.CharField(blank=True, max_length=128)),
                ("participant_kind", models.CharField(blank=True, default="", max_length=16)),
                ("is_active", models.BooleanField(default=True)),
                ("joined_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "clinic",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="members",
                        to="core.clinicalgroup",
                    ),
                ),
            ],
            options={
                "verbose_name": "Klinika aʼzosi",
                "verbose_name_plural": "Klinika aʼzolari",
                "ordering": ["-is_clinic_admin", "last_name", "first_name"],
            },
        ),
        migrations.CreateModel(
            name="ClinicalGroupPayment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("amount_uzs", models.DecimalField(decimal_places=2, max_digits=14)),
                ("period_label", models.CharField(max_length=128)),
                ("period_start", models.DateField(blank=True, null=True)),
                ("period_end", models.DateField(blank=True, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Kutilmoqda"),
                            ("paid", "To‘langan"),
                            ("overdue", "Muddati o‘tgan"),
                            ("cancelled", "Bekor qilingan"),
                        ],
                        default="pending",
                        max_length=16,
                    ),
                ),
                ("paid_at", models.DateTimeField(blank=True, null=True)),
                ("payment_method", models.CharField(blank=True, max_length=64)),
                ("reference", models.CharField(blank=True, max_length=128)),
                ("notes", models.TextField(blank=True)),
                ("created_by", models.CharField(blank=True, max_length=128)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "clinic",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payments",
                        to="core.clinicalgroup",
                    ),
                ),
            ],
            options={
                "verbose_name": "Klinika to‘lovi",
                "verbose_name_plural": "Klinika to‘lovlari",
                "ordering": ["-period_start", "-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="clinicalgroupmember",
            constraint=models.UniqueConstraint(
                fields=("clinic", "owner_key"),
                name="core_clinicalgroupmember_clinic_owner_uniq",
            ),
        ),
    ]
