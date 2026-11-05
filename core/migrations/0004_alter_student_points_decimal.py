from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_student_age_student_coins'),
    ]

    operations = [
        migrations.AlterField(
            model_name='student',
            name='points',
            field=models.DecimalField(max_digits=8, decimal_places=1, default=0),
        ),
    ]
