import os
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from core.models import Teacher, Classroom, Student

class Command(BaseCommand):
    help = "Creates default admin superuser and sample classrooms/teachers if they don't already exist"

    def handle(self, *args, **kwargs):
        admin_email = os.environ.get('ADMIN_EMAIL', 'admin@snai3i.com').strip()
        admin_username = os.environ.get('ADMIN_USERNAME', 'admin').strip()
        admin_password = os.environ.get('ADMIN_PASSWORD', 'password123').strip()

        admin_user = User.objects.filter(username=admin_username).first() or User.objects.filter(email=admin_email).first()

        if not admin_user:
            admin_user = User.objects.create_superuser(
                username=admin_username,
                email=admin_email,
                password=admin_password,
                first_name='System',
                last_name='Admin'
            )
            self.stdout.write(self.style.SUCCESS(f"Successfully created admin account: {admin_email} (username: {admin_username})"))
        else:
            # Ensure superuser privileges
            if not admin_user.is_superuser or not admin_user.is_staff:
                admin_user.is_superuser = True
                admin_user.is_staff = True
                admin_user.save()
                self.stdout.write(self.style.SUCCESS(f"Updated privileges for existing admin: {admin_user.username}"))
            else:
                self.stdout.write(self.style.WARNING(f"Admin account already exists and is configured: {admin_user.username}"))

        # Seed sample teachers and classrooms if none exist
        if Teacher.objects.count() == 0:
            teachers_data = [
                {'username': 'teacher@snai3i.com', 'email': 'teacher@snai3i.com', 'first_name': 'Sarah', 'last_name': 'Johnson', 'class': 'Robotics & AI Lab'},
                {'username': 'david@snai3i.com', 'email': 'david@snai3i.com', 'first_name': 'David', 'last_name': 'Miller', 'class': 'STEM Innovators'},
            ]
            for td in teachers_data:
                t_user, created = User.objects.get_or_create(
                    username=td['username'],
                    defaults={
                        'email': td['email'],
                        'first_name': td['first_name'],
                        'last_name': td['last_name'],
                    }
                )
                if created:
                    t_user.set_password('password123')
                    t_user.save()
                
                t_obj, _ = Teacher.objects.get_or_create(user=t_user)
                Classroom.objects.get_or_create(name=td['class'], teacher=t_obj)

            self.stdout.write(self.style.SUCCESS("Seeded sample teachers and classrooms."))

        # Seed sample students if none exist
        if Student.objects.count() == 0:
            first_classroom = Classroom.objects.first()
            students_data = [
                {'username': 'alex@snai3i.com', 'email': 'alex@snai3i.com', 'first_name': 'Alex', 'last_name': 'Rivera', 'points': 45.5, 'coins': 4, 'division': 'Division A', 'age': 14},
                {'username': 'maya@snai3i.com', 'email': 'maya@snai3i.com', 'first_name': 'Maya', 'last_name': 'Lin', 'points': 82.0, 'coins': 8, 'division': 'Division A', 'age': 15},
                {'username': 'sam@snai3i.com', 'email': 'sam@snai3i.com', 'first_name': 'Sam', 'last_name': 'Taylor', 'points': 28.5, 'coins': 2, 'division': 'Division B', 'age': 13},
                {'username': 'elena@snai3i.com', 'email': 'elena@snai3i.com', 'first_name': 'Elena', 'last_name': 'Rostova', 'points': 65.0, 'coins': 6, 'division': 'Division B', 'age': 14},
            ]
            for sd in students_data:
                s_user, created = User.objects.get_or_create(
                    username=sd['username'],
                    defaults={
                        'email': sd['email'],
                        'first_name': sd['first_name'],
                        'last_name': sd['last_name'],
                    }
                )
                if created:
                    s_user.set_password('password123')
                    s_user.save()
                
                stu_obj, _ = Student.objects.get_or_create(
                    user=s_user,
                    defaults={
                        'points': sd['points'],
                        'coins': sd['coins'],
                        'division': sd['division'],
                        'age': sd['age'],
                    }
                )
                if first_classroom:
                    first_classroom.students.add(stu_obj)

            self.stdout.write(self.style.SUCCESS("Seeded sample students."))

