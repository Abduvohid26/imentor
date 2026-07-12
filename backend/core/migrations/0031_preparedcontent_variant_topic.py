from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0030_topicvideo'),
    ]

    operations = [
        migrations.AddField(
            model_name='preparedcontent',
            name='variant_label',
            field=models.CharField(blank=True, db_index=True, default='', max_length=128),
        ),
        migrations.AddField(
            model_name='preparedcontent',
            name='topic_code',
            field=models.CharField(blank=True, db_index=True, default='', max_length=32),
        ),
        migrations.AddIndex(
            model_name='preparedcontent',
            index=models.Index(
                fields=['kind', 'subject_code', 'variant_label', 'topic_code'],
                name='core_prep_kind_subj_var_topic',
            ),
        ),
    ]
