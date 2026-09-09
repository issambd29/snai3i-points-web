from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from django.db.models import Q, Sum
from django.conf import settings
from .models import ChatMessage, Classroom, Homework, Student, Teacher
import json
import os


def render_spa_or_template(request, template_name, context=None):
    """
    Renders the modern compiled React SPA if present in dist/,
    otherwise falls back gracefully to the Django HTML template.
    """
    dist_index = settings.BASE_DIR / 'dist' / 'index.html'
    if dist_index.exists():
        return render(request, 'index.html', context or {})
    return render(request, template_name, context or {})


# =========================
# AUTH
# =========================

def signin_view(request):
    if request.user.is_authenticated:
        return redirect('home')

    if request.method == 'POST':
        identifier = request.POST.get('email', '').strip()
        password = request.POST.get('password', '').strip()

        if not identifier or not password:
            return render_spa_or_template(request, 'signin.html', {'error': 'Please enter your email and password.'})

        # find user by email or username (case-insensitive)
        user_obj = User.objects.filter(
            Q(email__iexact=identifier) | Q(username__iexact=identifier)
        ).first()

        if not user_obj:
            return render_spa_or_template(request, 'signin.html', {'error': 'No account found with that email or username.'})

        user = authenticate(request, username=user_obj.username, password=password)
        if user is not None:
            login(request, user)
            return redirect('home')
        else:
            return render_spa_or_template(request, 'signin.html', {'error': 'Incorrect password.'})

    return render_spa_or_template(request, 'signin.html')


def signup_view(request):
    if request.method == 'POST':
        first_name = request.POST.get('first_name', '').strip()
        last_name = request.POST.get('last_name', '').strip()
        email = request.POST.get('email', '').strip().lower()
        password = request.POST.get('password', '').strip()
        confirm_password = request.POST.get('confirm_password', '').strip()

        if not first_name or not email or not password:
            return render_spa_or_template(request, 'signup.html', {'error': 'First name, email and password are required.'})

        if password != confirm_password:
            return render_spa_or_template(request, 'signup.html', {'error': 'Passwords do not match.'})

        if len(password) < 8:
            return render_spa_or_template(request, 'signup.html', {'error': 'Password must be at least 8 characters long.'})

        if User.objects.filter(email=email).exists() or User.objects.filter(username=email).exists():
            return render_spa_or_template(request, 'signup.html', {'error': 'An account with that email already exists.'})

        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
        )
        teacher = Teacher.objects.create(user=user)
        Classroom.objects.create(name=f"{first_name}'s Class", teacher=teacher)

        login(request, user)
        return redirect('dashboard')

    return render_spa_or_template(request, 'signup.html')


def signout_view(request):
    logout(request)
    return redirect('signin')


# =========================
# ROLE ROUTER
# =========================

@login_required(login_url='/signin/')
def home(request):
    if request.user.is_superuser:
        return redirect('admin_dashboard')
    if Teacher.objects.filter(user=request.user).exists():
        return redirect('dashboard')
    if Student.objects.filter(user=request.user).exists():
        return redirect('student_dashboard')
    # unknown role — sign out
    logout(request)
    return redirect('signin')


# =========================
# TEACHER DASHBOARD
# =========================

def get_teacher_classrooms(user):
    try:
        teacher = Teacher.objects.get(user=user)
        return Classroom.objects.filter(
            Q(teacher=teacher) | Q(shared_with=teacher)
        ).distinct()
    except Teacher.DoesNotExist:
        return Classroom.objects.none()


def get_teacher_classroom(user, classroom_id=None):
    classrooms = get_teacher_classrooms(user)
    if classroom_id:
        return classrooms.filter(id=classroom_id).first()
    return classrooms.first()


def request_json(request):
    try:
        return json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return {}


@login_required(login_url='/signin/')
def dashboard(request):
    teacher = Teacher.objects.filter(user=request.user).first()
    if not teacher:
        if request.user.is_superuser:
            return redirect('admin_dashboard')
        if Student.objects.filter(user=request.user).exists():
            return redirect('student_dashboard')
        return redirect('home')

    classrooms = get_teacher_classrooms(request.user)
    if not classrooms.exists():
        name_prefix = request.user.first_name or request.user.username or "My"
        new_class = Classroom.objects.create(
            name=f"{name_prefix}'s Class",
            teacher=teacher
        )
        classrooms = Classroom.objects.filter(id=new_class.id)

    classroom_id = request.GET.get('classroom_id')
    classroom = get_teacher_classroom(request.user, classroom_id)
    if not classroom and classrooms.exists():
        classroom = classrooms.first()

    students  = []
    if classroom:
        students = classroom.students.select_related('user').order_by('-points')

    available_teachers = []
    if classroom:
        shared_ids = classroom.shared_with.values_list('id', flat=True)
        available_teachers = Teacher.objects.exclude(user=request.user).exclude(id__in=shared_ids)

    return render_spa_or_template(request, 'dashboard.html', {
        'students':  students,
        'classroom': classroom,
        'classrooms': classrooms,
        'homeworks': (
            classroom.homeworks.select_related('created_by__user').all()
            if classroom else []
        ),
        'messages': (
            classroom.messages.select_related('sender').all()[:50]
            if classroom else []
        ),
        'is_owner': bool(classroom and classroom.teacher.user_id == request.user.id),
        'shared_teachers': (
            classroom.shared_with.select_related('user').all()
            if classroom else []
        ),
        'available_teachers': available_teachers,
    })


# =========================
# STUDENT DASHBOARD
# =========================

@login_required(login_url='/signin/')
def student_dashboard(request):
    try:
        student = Student.objects.get(user=request.user)
    except Student.DoesNotExist:
        return redirect('home')

    classroom           = Classroom.objects.filter(students=student).first()
    rank                = 1
    total_students      = 1
    points_to_next_coin = 10
    progress_pct        = 0

    if classroom:
        rank                = classroom.students.filter(points__gt=student.points).count() + 1
        total_students      = classroom.students.count()

    points_in_block     = float(student.points) % 10
    points_to_next_coin = round(10 - points_in_block, 1) if points_in_block > 0 else 10
    progress_pct        = (points_in_block / 10) * 100

    return render_spa_or_template(request, 'student_dashboard.html', {
        'student':             student,
        'classroom':           classroom,
        'homeworks': (
            classroom.homeworks.select_related('created_by__user').all()
            if classroom else []
        ),
        'messages': (
            classroom.messages.select_related('sender').all()[:50]
            if classroom else []
        ),
        'rank':                rank,
        'total_students':      total_students,
        'points_to_next_coin': points_to_next_coin,
        'progress_pct':        int(progress_pct),
    })


# =========================
# ADMIN DASHBOARD
# =========================

@login_required(login_url='/signin/')
def admin_dashboard(request):
    if not request.user.is_superuser:
        return redirect('home')

    classrooms   = Classroom.objects.select_related('teacher__user').prefetch_related('students__user')
    all_students = []
    seen_ids     = set()

    for classroom in classrooms:
        teacher_name = 'Unassigned'
        if classroom.teacher and classroom.teacher.user:
            t_user = classroom.teacher.user
            teacher_name = f"{t_user.first_name} {t_user.last_name}".strip() or t_user.username

        for student in classroom.students.select_related('user').order_by('-points'):
            if student.id not in seen_ids:
                seen_ids.add(student.id)
                all_students.append({
                    'student':        student,
                    'classroom_name': classroom.name,
                    'teacher_name':   teacher_name,
                })

    all_students.sort(key=lambda x: x['student'].points, reverse=True)

    teachers = Teacher.objects.select_related('user').prefetch_related('classroom_set__students')
    totals   = Student.objects.aggregate(tp=Sum('points'), tc=Sum('coins'))

    return render_spa_or_template(request, 'admin_dashboard.html', {
        'students':         all_students,
        'classrooms':       classrooms,
        'teachers':         teachers,
        'total_students':   len(all_students),
        'total_classrooms': classrooms.count(),
        'total_teachers':   teachers.count(),
        'total_points':     totals['tp'] or 0,
        'total_coins':      totals['tc'] or 0,
    })


# =========================
# ADMIN — ADD / DELETE TEACHER
# =========================

@csrf_exempt
@login_required(login_url='/signin/')
def add_teacher(request):
    if not request.user.is_superuser:
        return JsonResponse({'success': False, 'error': 'Forbidden'})

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Invalid JSON'})

        first          = data.get('first_name', '').strip()
        last           = data.get('last_name', '').strip()
        email          = data.get('email', '').strip()
        password       = data.get('password', '').strip()
        classroom_name = data.get('classroom_name', 'My Class').strip() or 'My Class'

        if not first or not email or not password:
            return JsonResponse({'success': False, 'error': 'First name, email and password are required.'})

        if User.objects.filter(email=email).exists():
            return JsonResponse({'success': False, 'error': 'A user with that email already exists.'})

        user = User.objects.create_user(
            username=email, email=email, password=password,
            first_name=first, last_name=last,
        )
        teacher = Teacher.objects.create(user=user)
        Classroom.objects.create(name=classroom_name, teacher=teacher)

        return JsonResponse({
            'success':      True,
            'teacher_id':   teacher.id,
            'name':         f'{first} {last}',
            'email':        email,
            'classroom':    classroom_name,
        })

    return JsonResponse({'success': False, 'error': 'Invalid method'})


@csrf_exempt
@login_required(login_url='/signin/')
def update_teacher(request, teacher_id):
    if not request.user.is_superuser:
        return JsonResponse({'success': False, 'error': 'Forbidden'})

    if request.method == 'POST':
        teacher = get_object_or_404(Teacher, id=teacher_id)
        user = teacher.user
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Invalid JSON'})

        first = data.get('first_name', '').strip()
        last = data.get('last_name', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '').strip()
        classroom_name = data.get('classroom_name', '').strip()

        if not first or not email:
            return JsonResponse({'success': False, 'error': 'First name and email are required.'})

        # Check if email taken by another user
        if User.objects.filter(email=email).exclude(id=user.id).exists():
            return JsonResponse({'success': False, 'error': 'Email address already in use by another user.'})

        user.first_name = first
        user.last_name = last
        user.email = email
        user.username = email
        if password:
            user.set_password(password)
        user.save()

        if classroom_name:
            c = teacher.classroom_set.first()
            if c:
                c.name = classroom_name
                c.save()
            else:
                Classroom.objects.create(name=classroom_name, teacher=teacher)

        return JsonResponse({
            'success': True,
            'teacher_id': teacher.id,
            'name': f'{first} {last}'.strip(),
            'email': email,
            'classroom': classroom_name,
        })

    return JsonResponse({'success': False, 'error': 'Invalid method'})


@csrf_exempt
@login_required(login_url='/signin/')
def delete_teacher(request, teacher_id):
    if not request.user.is_superuser:
        return JsonResponse({'success': False, 'error': 'Forbidden'})

    if request.method == 'POST':
        teacher = get_object_or_404(Teacher, id=teacher_id)
        # remove classrooms; students remain in DB but lose classroom link
        Classroom.objects.filter(teacher=teacher).delete()
        user = teacher.user
        teacher.delete()
        user.delete()
        return JsonResponse({'success': True})

    return JsonResponse({'success': False, 'error': 'Invalid method'})


# =========================
# TEACHER — ADD / EDIT / DELETE STUDENT
# =========================

@csrf_exempt
@login_required(login_url='/signin/')
def add_student(request):
    if request.method == 'POST':
        data = request_json(request)

        name     = data.get('name', '').strip()
        division = data.get('division', '').strip()
        email    = data.get('email', '').strip()
        password = data.get('password', '').strip()
        age      = data.get('age', 0)

        if not name or not email or not password:
            return JsonResponse({'success': False, 'error': 'Name, email and password are required.'})

        try:
            age = int(age)
        except (ValueError, TypeError):
            age = 0

        if User.objects.filter(email=email).exists():
            return JsonResponse({'success': False, 'error': 'A user with that email already exists.'})

        classroom = get_teacher_classroom(request.user, data.get('classroom_id'))
        if classroom is None:
            return JsonResponse({'success': False, 'error': 'No classroom found for your account.'})

        first, last = name.split(' ', 1) if ' ' in name else (name, '')

        student_user = User.objects.create_user(
            username=email, email=email, password=password,
            first_name=first, last_name=last,
        )
        student = Student.objects.create(
            user=student_user, division=division, age=age, points=0, coins=0,
        )
        classroom.students.add(student)

        return JsonResponse({'success': True, 'student_id': student.id})

    return JsonResponse({'success': False, 'error': 'Invalid method'})


@login_required(login_url='/signin/')
def get_student(request, student_id):
    classroom = get_teacher_classroom(request.user, request.GET.get('classroom_id'))
    if not classroom:
        return JsonResponse({'success': False, 'error': 'No classroom'})
    student = get_object_or_404(classroom.students, id=student_id)
    return JsonResponse({
        'success':  True,
        'name':     f'{student.user.first_name} {student.user.last_name}',
        'age':      student.age,
        'division': student.division,
        'email':    student.user.email,
    })


@csrf_exempt
@login_required(login_url='/signin/')
def update_student(request, student_id):
    if request.method == 'POST':
        data = request_json(request)

        classroom = get_teacher_classroom(request.user, data.get('classroom_id'))
        if not classroom:
            return JsonResponse({'success': False, 'error': 'No classroom'})

        student  = get_object_or_404(classroom.students, id=student_id)
        name     = data.get('name', '').strip()
        division = data.get('division', '').strip()
        age      = data.get('age', 0)

        if not name:
            return JsonResponse({'success': False, 'error': 'Name is required.'})

        try:
            age = int(age)
        except (ValueError, TypeError):
            age = 0

        first, last = name.split(' ', 1) if ' ' in name else (name, '')
        student.user.first_name = first
        student.user.last_name  = last
        student.user.save()
        if 'division' in data:
            student.division = division
        student.age      = age
        student.save()

        return JsonResponse({'success': True})

    return JsonResponse({'success': False, 'error': 'Invalid method'})


@csrf_exempt
@login_required(login_url='/signin/')
def add_points(request, student_id):
    if request.method == 'POST':
        data = request_json(request)

        try:
            amount = round(float(data.get('amount', 1)), 1)
        except (ValueError, TypeError):
            amount = 1.0

        if amount <= 0:
            return JsonResponse({'success': False, 'error': 'Amount must be greater than 0.'})

        classroom = get_teacher_classroom(request.user, data.get('classroom_id'))
        if not classroom:
            return JsonResponse({'success': False, 'error': 'No classroom'})

        student        = get_object_or_404(classroom.students, id=student_id)
        coins_before   = int(float(student.points)) // 10
        student.points = round(float(student.points) + amount, 1)
        coins_after    = int(float(student.points)) // 10
        new_coins      = coins_after - coins_before
        student.coins += new_coins
        student.save()

        return JsonResponse({
            'success':   True,
            'points':    float(student.points),
            'coins':     student.coins,
            'new_coins': new_coins,
        })

    return JsonResponse({'success': False, 'error': 'Invalid method'})


@csrf_exempt
@login_required(login_url='/signin/')
def subtract_points(request, student_id):
    if request.method == 'POST':
        data = request_json(request)

        try:
            amount = round(float(data.get('amount', 1)), 1)
        except (ValueError, TypeError):
            amount = 1.0

        if amount <= 0:
            return JsonResponse({'success': False, 'error': 'Amount must be greater than 0.'})

        classroom = get_teacher_classroom(request.user, data.get('classroom_id'))
        if not classroom:
            return JsonResponse({'success': False, 'error': 'No classroom'})

        student = get_object_or_404(classroom.students, id=student_id)

        if amount > float(student.points):
            return JsonResponse({'success': False, 'error': f'Cannot subtract more than current points ({float(student.points)}).'})

        coins_before    = int(float(student.points)) // 10
        student.points  = round(max(0.0, float(student.points) - amount), 1)
        coins_after     = int(float(student.points)) // 10
        lost_coins      = coins_before - coins_after
        student.coins   = max(0, student.coins - lost_coins)
        student.save()

        return JsonResponse({
            'success': True,
            'points':  float(student.points),
            'coins':   student.coins,
        })

    return JsonResponse({'success': False, 'error': 'Invalid method'})


@csrf_exempt
@login_required(login_url='/signin/')
def delete_student(request, student_id):
    if request.method == 'POST':
        data = request_json(request)
        classroom = get_teacher_classroom(request.user, data.get('classroom_id'))
        if not classroom:
            return JsonResponse({'success': False, 'error': 'No classroom'})

        student      = get_object_or_404(classroom.students, id=student_id)
        classroom.students.remove(student)
        student_user = student.user
        student.delete()
        student_user.delete()

        return JsonResponse({'success': True})

    return JsonResponse({'success': False, 'error': 'Invalid method'})


@csrf_exempt
@login_required(login_url='/signin/')
def share_classroom(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid method'})

    data = request_json(request)
    classroom = get_teacher_classroom(request.user, data.get('classroom_id'))
    if not classroom:
        return JsonResponse({'success': False, 'error': 'Class not found.'})
    if classroom.teacher.user_id != request.user.id:
        return JsonResponse({'success': False, 'error': 'Only the class owner can share access.'})

    email = data.get('email', '').strip().lower()
    if not email:
        return JsonResponse({'success': False, 'error': 'Teacher email is required.'})

    teacher = Teacher.objects.filter(user__email__iexact=email).select_related('user').first()
    if not teacher:
        return JsonResponse({'success': False, 'error': 'No teacher account exists with that email.'})
    if teacher.id == classroom.teacher_id:
        return JsonResponse({'success': False, 'error': 'The owner already has access.'})
    if classroom.shared_with.filter(id=teacher.id).exists():
        return JsonResponse({'success': False, 'error': 'This teacher already has access.'})

    classroom.shared_with.add(teacher)
    return JsonResponse({
        'success': True,
        'teacher_id': teacher.id,
        'teacher': f'{teacher.user.first_name} {teacher.user.last_name}'.strip() or teacher.user.email,
        'email': teacher.user.email,
    })


@csrf_exempt
@login_required(login_url='/signin/')
def unshare_classroom(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid method'})

    data = request_json(request)
    classroom = get_teacher_classroom(request.user, data.get('classroom_id'))
    if not classroom:
        return JsonResponse({'success': False, 'error': 'Class not found.'})
    if classroom.teacher.user_id != request.user.id:
        return JsonResponse({'success': False, 'error': 'Only the class owner can manage access.'})

    classroom.shared_with.remove(data.get('teacher_id'))
    return JsonResponse({'success': True})


@csrf_exempt
@login_required(login_url='/signin/')
def add_classroom(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid method'})

    data = request_json(request)
    name = data.get('name', '').strip()
    branch = data.get('branch', '').strip()
    specialty = data.get('specialty', '').strip()
    session_time = str(data.get('session_time', '')).strip()
    teacher_id = data.get('teacher_id')

    # If name is not explicitly given, build from dropdowns
    if not name:
        parts = []
        if branch:
            parts.append(branch)
        if specialty:
            parts.append(specialty)
        if session_time:
            parts.append(f"({session_time}h)" if session_time.isdigit() else f"({session_time})")
        name = " - ".join(parts) if parts else "New Room"

    if len(name) > 100:
        name = name[:100]

    teacher = None
    if request.user.is_superuser:
        if teacher_id:
            teacher = Teacher.objects.filter(id=teacher_id).first() or Teacher.objects.filter(user__id=teacher_id).first()
        if not teacher:
            teacher = Teacher.objects.first()
        if not teacher:
            # Create a default teacher for admin if none exists
            teacher, _ = Teacher.objects.get_or_create(user=request.user)
    else:
        teacher = Teacher.objects.filter(user=request.user).first()
        if not teacher:
            return JsonResponse({'success': False, 'error': 'Only teachers or admins can create classes.'})

    classroom = Classroom.objects.create(
        name=name,
        branch=branch,
        specialty=specialty,
        session_time=session_time,
        teacher=teacher,
    )

    return JsonResponse({
        'success': True,
        'classroom_id': classroom.id,
        'name': classroom.name,
        'branch': classroom.branch,
        'specialty': classroom.specialty,
        'session_time': classroom.session_time,
    })


@csrf_exempt
@login_required(login_url='/signin/')
def add_homework(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid method'})

    data = request_json(request)
    classroom_id = data.get('classroom_id')
    classroom = None
    if request.user.is_superuser:
        classroom = Classroom.objects.filter(id=classroom_id).first()
    else:
        classroom = get_teacher_classroom(request.user, classroom_id)

    if not classroom:
        return JsonResponse({'success': False, 'error': 'Class not found.'})

    title = data.get('title', '').strip()
    description = data.get('description', '').strip()
    due_date = data.get('due_date') or None
    if not title:
        return JsonResponse({'success': False, 'error': 'Homework title is required.'})
    if len(title) > 160:
        return JsonResponse({'success': False, 'error': 'Homework title is too long.'})

    teacher = Teacher.objects.filter(user=request.user).first() or classroom.teacher
    homework = Homework.objects.create(
        classroom=classroom,
        created_by=teacher,
        title=title,
        description=description,
        due_date=due_date,
    )

    # Automatically send email notification to all students in this classroom
    emails_sent = 0
    try:
        students = classroom.students.select_related('user').all()
        student_emails = [
            s.user.email for s in students
            if s.user and s.user.email and '@' in s.user.email
        ]

        if student_emails:
            from django.core.mail import send_mail
            from django.conf import settings

            teacher_display = teacher.user.get_full_name() or teacher.user.username
            subject = f"📚 New Homework: {title} ({classroom.name})"
            body = (
                f"Hello,\n\n"
                f"Your teacher {teacher_display} has posted a new homework assignment for {classroom.name}:\n\n"
                f"📌 Title: {title}\n"
                f"📝 Description: {description or 'No description provided.'}\n"
                f"📅 Due Date: {due_date or 'No deadline specified.'}\n\n"
                f"Please log in to your account at Snai3i Points Tracker to view and complete your homework.\n\n"
                f"Best regards,\n"
                f"Snai3i Learning Team"
            )
            from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@snai3i.com')
            emails_sent = send_mail(
                subject=subject,
                message=body,
                from_email=from_email,
                recipient_list=student_emails,
                fail_silently=True,
            )
    except Exception as ex:
        # Logging safely without crashing
        pass

    return JsonResponse({
        'success': True,
        'emails_sent': emails_sent,
        'homework': {
            'id': homework.id,
            'title': homework.title,
            'description': homework.description,
            'due_date': homework.due_date.isoformat() if homework.due_date else '',
            'classroom_id': classroom.id,
            'classroom_name': classroom.name,
        },
    })


@csrf_exempt
@login_required(login_url='/signin/')
def send_message(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Invalid method'})

    data = request_json(request)
    body = data.get('body', '').strip()
    if not body:
        return JsonResponse({'success': False, 'error': 'Message cannot be empty.'})

    classroom_id = data.get('classroom_id')
    teacher_classroom = get_teacher_classroom(request.user, classroom_id)
    if teacher_classroom:
        classroom = teacher_classroom
    else:
        student = Student.objects.filter(user=request.user).first()
        classroom = (
            Classroom.objects.filter(id=classroom_id, students=student).first()
            if student and classroom_id else
            Classroom.objects.filter(students=student).first()
            if student else None
        )
    if not classroom:
        return JsonResponse({'success': False, 'error': 'You do not have access to this class.'})

    message = ChatMessage.objects.create(
        classroom=classroom,
        sender=request.user,
        body=body,
    )
    return JsonResponse({
        'success': True,
        'message': {
            'body': message.body,
            'sender': request.user.get_full_name() or request.user.email,
            'is_me': True,
            'created_at': message.created_at.strftime('%b %d, %H:%M'),
        },
    })