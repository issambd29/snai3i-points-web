import os
import secrets

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from core.models import Classroom, Product, Student, Teacher

DEFAULT_REWARDS = [
    ('Snai3i Golden Diamond Pen', 'Exclusive metallic Snai3i engraved writing pen with black gel refill.', 5, 20, 'Stationery', 'Sparkles'),
    ('Homework Free Pass', 'Exempt from one regular classroom homework assignment of your choice.', 4, 30, 'Privilege', 'BookOpen'),
    ('VIP Front Row Seat', 'Pick your favorite front-row seat for an entire school week.', 3, 10, 'Privilege', 'Award'),
    ('Teacher Assistant for a Day', 'Help teacher manage attendance, distribute worksheets and assist peers.', 6, 8, 'Leadership', 'Trophy'),
    ('15-Min Brain Break / Game Time', 'Enjoy 15 minutes of curated educational game time during study hall.', 3, 25, 'Activity', 'Clock'),
    ('Snai3i Meister Badge & Sticker Pack', 'High-quality holographic vinyl sticker pack + official Snai3i Meister pin.', 2, 40, 'Merchandise', 'Gift'),
    ('Custom Classroom Avatar Flair', 'Special highlighted title and avatar badge in class announcements.', 2, 50, 'Digital', 'Star'),
]


class Command(BaseCommand):
    help = (
        'Creates the administrator account and default store rewards if missing. '
        'Set SEED_DEMO_DATA=True to also create demo teachers/students (never use in production).'
    )

    def handle(self, *args, **options):
        self._ensure_admin()
        self._ensure_rewards()
        if os.environ.get('SEED_DEMO_DATA', '').strip().lower() in ('true', '1', 'yes'):
            self._seed_demo_data()

    def _ensure_admin(self):
        email = os.environ.get('ADMIN_EMAIL', 'admin@snai3i.com').strip().lower()
        username = os.environ.get('ADMIN_USERNAME', 'admin').strip()
        password = os.environ.get('ADMIN_PASSWORD', '')

        admin = User.objects.filter(username=username).first() or User.objects.filter(email__iexact=email).first()
        if admin:
            if not (admin.is_superuser and admin.is_staff):
                admin.is_superuser = admin.is_staff = True
                admin.save(update_fields=['is_superuser', 'is_staff'])
                self.stdout.write(self.style.SUCCESS(f'Granted admin privileges to {admin.username}.'))
            else:
                self.stdout.write(f'Admin account already exists: {admin.username}')
            return  # an existing account's password is never touched

        generated = not password
        if generated:
            password = secrets.token_urlsafe(14)
        User.objects.create_superuser(
            username=username, email=email, password=password, first_name='System', last_name='Admin',
        )
        self.stdout.write(self.style.SUCCESS(f'Created admin account: {email} (username: {username})'))
        if generated:
            self.stdout.write(self.style.WARNING(
                f'No ADMIN_PASSWORD was set. Generated one-time password: {password}\n'
                'Sign in and store it safely - it will not be shown again.'
            ))

    def _ensure_rewards(self):
        if Product.objects.exists():
            return
        for name, description, price, stock, category, icon in DEFAULT_REWARDS:
            Product.objects.create(
                name=name, description=description, price_coins=price, stock=stock,
                category=category, icon=icon, is_available=True,
            )
        self.stdout.write(self.style.SUCCESS('Seeded default classroom rewards.'))

    def _seed_demo_data(self):
        if Teacher.objects.exists() or Student.objects.exists():
            return
        password = os.environ.get('DEMO_PASSWORD') or secrets.token_urlsafe(10)

        def make_user(email, first, last):
            user = User.objects.create_user(username=email, email=email, first_name=first, last_name=last)
            user.set_password(password)
            user.save()
            return user

        teachers = [
            ('teacher@snai3i.com', 'Sarah', 'Johnson', 'Robotics & AI Lab'),
            ('david@snai3i.com', 'David', 'Miller', 'STEM Innovators'),
        ]
        classrooms = []
        for email, first, last, class_name in teachers:
            teacher = Teacher.objects.create(user=make_user(email, first, last))
            classrooms.append(Classroom.objects.create(name=class_name, teacher=teacher))

        students = [
            ('alex@snai3i.com', 'Alex', 'Rivera', 45.5, 4, 14),
            ('maya@snai3i.com', 'Maya', 'Lin', 82.0, 8, 15),
            ('sam@snai3i.com', 'Sam', 'Taylor', 28.5, 2, 13),
            ('elena@snai3i.com', 'Elena', 'Rostova', 65.0, 6, 14),
        ]
        for index, (email, first, last, points, coins, age) in enumerate(students):
            student = Student.objects.create(
                user=make_user(email, first, last), points=points, coins=coins, age=age,
            )
            classrooms[index % len(classrooms)].students.add(student)

        self.stdout.write(self.style.WARNING(
            f'Demo data created. All demo accounts use the password: {password}'
        ))
