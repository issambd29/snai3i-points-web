# Generated migration for Classroom branch, specialty, and session_time
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_chatmessage_homework'),
    ]

    operations = [
        migrations.AddField(
            model_name='classroom',
            name='branch',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='classroom',
            name='specialty',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AddField(
            model_name='classroom',
            name='session_time',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
    ]
