from django.db import migrations


def backfill_order_branch(apps, schema_editor):
    """Orders made before shops were per-branch: give them the branch of the student's class,
    so that branch's manager can handle (and scan) them."""
    StoreOrder = apps.get_model('core', 'StoreOrder')
    Classroom = apps.get_model('core', 'Classroom')
    through = Classroom.students.through

    branch_of = {}
    rows = through.objects.exclude(classroom__branch='').select_related('classroom').order_by('classroom_id')
    for row in rows:
        branch_of.setdefault(row.student_id, row.classroom.branch)

    for order in StoreOrder.objects.filter(branch=''):
        branch = branch_of.get(order.student_id, '')
        if branch:
            order.branch = branch
            order.save(update_fields=['branch'])


class Migration(migrations.Migration):
    dependencies = [('core', '0011_store_branches_and_vouchers')]
    operations = [migrations.RunPython(backfill_order_branch, migrations.RunPython.noop)]
