from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout
from django.db.models import Q, F
from django.db import transaction
from decimal import Decimal
from functools import wraps
import json
import os
import time
from django.conf import settings
from .models import ChatMessage, Classroom, Homework, Student, Teacher, Attendance, Product, StoreOrder


def require_auth(view_func):
    """
    Require an authenticated (signed-in) session for an API view.
    Returns a 401 JSON response instead of the Django login-redirect page,
    since these are JSON endpoints consumed by the React frontend.
    """
    @wraps(view_func)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({'success': False, 'error': 'Authentication required.'}, status=401)
        return view_func(request, *args, **kwargs)
    return wrapped


def parse_json(request):
    try:
        return json.loads(request.body.decode('utf-8'))
    except Exception:
        return {}


def user_to_dict(user):
    role = 'student'
    if user.is_superuser:
        role = 'admin'
    elif Teacher.objects.filter(user=user).exists():
        role = 'teacher'
    elif Student.objects.filter(user=user).exists():
        role = 'student'

    return {
        'id': f'u-{user.id}',
        'rawId': user.id,
        'username': user.username,
        'email': user.email,
        'firstName': user.first_name or ('System' if user.is_superuser else 'User'),
        'lastName': user.last_name or ('Admin' if user.is_superuser else ''),
        'name': f"{user.first_name} {user.last_name}".strip() or user.username,
        'role': role,
        'isSuperuser': user.is_superuser,
    }


def api_health(request):
    return JsonResponse({
        'status': 'ok',
        'backend': 'django',
        'database': 'postgresql',
    })


@csrf_exempt
def api_signin(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'POST method required'}, status=405)

    data = parse_json(request)
    email = (data.get('email') or '').strip().lower()
    password = (data.get('password') or '').strip()

    if not email or not password:
        return JsonResponse({'success': False, 'error': 'Email and password are required.'}, status=400)

    # Allow login by email or username
    user = User.objects.filter(Q(email__iexact=email) | Q(username__iexact=email)).first()
    if not user:
        return JsonResponse({'success': False, 'error': 'Invalid credentials.'}, status=401)

    authenticated_user = authenticate(request, username=user.username, password=password)
    if not authenticated_user:
        return JsonResponse({'success': False, 'error': 'Invalid credentials.'}, status=401)

    login(request, authenticated_user)
    return JsonResponse({
        'success': True,
        'user': user_to_dict(authenticated_user),
    })


@csrf_exempt
def api_signup(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'POST method required'}, status=405)

    data = parse_json(request)
    first_name = (data.get('first_name') or data.get('firstName') or '').strip()
    last_name = (data.get('last_name') or data.get('lastName') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = (data.get('password') or '').strip()

    if not first_name or not email or not password:
        return JsonResponse({'success': False, 'error': 'First name, email, and password are required.'}, status=400)

    if User.objects.filter(email__iexact=email).exists() or User.objects.filter(username__iexact=email).exists():
        return JsonResponse({'success': False, 'error': 'An account with that email already exists.'}, status=400)

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
    return JsonResponse({
        'success': True,
        'user': user_to_dict(user),
    })


@csrf_exempt
def api_signout(request):
    logout(request)
    return JsonResponse({'success': True})


def api_current_user(request):
    if not request.user.is_authenticated:
        return JsonResponse({'authenticated': False, 'user': None})
    return JsonResponse({
        'authenticated': True,
        'user': user_to_dict(request.user),
    })


@require_auth
def api_get_app_data(request):
    """
    Returns full relational database state formatted for React AppContext
    """
    users_qs = User.objects.all().order_by('id')
    teachers_qs = Teacher.objects.select_related('user').all().order_by('id')
    classrooms_qs = Classroom.objects.select_related('teacher__user').prefetch_related('shared_with__user', 'students__user').all().order_by('id')
    students_qs = Student.objects.select_related('user').all().order_by('id')
    homeworks_qs = Homework.objects.select_related('classroom', 'created_by__user').all().order_by('-created_at')
    messages_qs = ChatMessage.objects.select_related('classroom', 'sender').all().order_by('created_at')

    teacher_user_ids = {t.user_id for t in teachers_qs}
    student_user_ids = {s.user_id for s in students_qs}

    users = []
    for u in users_qs:
        role = 'student'
        if u.is_superuser:
            role = 'admin'
        elif u.id in teacher_user_ids:
            role = 'teacher'
        elif u.id in student_user_ids:
            role = 'student'

        users.append({
            'id': f'u-{u.id}',
            'rawId': u.id,
            'username': u.username,
            'email': u.email,
            'firstName': u.first_name or ('System' if u.is_superuser else 'User'),
            'lastName': u.last_name or ('Admin' if u.is_superuser else ''),
            'role': role,
            'isSuperuser': u.is_superuser,
        })

    teachers = []
    for t in teachers_qs:
        u_match = next((x for x in users if x['rawId'] == t.user.id), None) or {
            'id': f'u-{t.user.id}',
            'email': t.user.email,
            'firstName': t.user.first_name,
            'lastName': t.user.last_name,
            'role': 'teacher',
        }
        teachers.append({
            'id': f't-{t.id}',
            'rawId': t.id,
            'userId': f'u-{t.user.id}',
            'userRawId': t.user.id,
            'user': u_match,
        })

    classrooms = []
    for c in classrooms_qs:
        t_match = next((x for x in teachers if x['rawId'] == c.teacher_id), teachers[0] if teachers else None)
        shared_t_ids = [f't-{t.id}' for t in c.shared_with.all()]
        student_ids = [f's-{s.id}' for s in c.students.all()]

        classrooms.append({
            'id': f'c-{c.id}',
            'rawId': c.id,
            'name': c.name,
            'branch': c.branch or 'Bordj Kiffan',
            'specialty': c.specialty or 'SE1',
            'sessionTime': c.session_time or '',
            'teacherId': t_match['id'] if t_match else 't-1',
            'teacher': t_match,
            'sharedWithTeacherIds': shared_t_ids,
            'studentIds': student_ids,
        })

    students = []
    for s in students_qs:
        u_match = next((x for x in users if x['rawId'] == s.user.id), None) or {
            'id': f'u-{s.user.id}',
            'email': s.user.email,
            'firstName': s.user.first_name,
            'lastName': s.user.last_name,
            'role': 'student',
        }
        # Find classroom
        c_match = next((c for c in classrooms if f's-{s.id}' in c['studentIds']), classrooms[0] if classrooms else None)

        students.append({
            'id': f's-{s.id}',
            'rawId': s.id,
            'userId': f'u-{s.user.id}',
            'userRawId': s.user.id,
            'points': float(s.points),
            'coins': s.coins,
            'age': s.age,
            'division': s.division,
            'classroomId': c_match['id'] if c_match else 'c-1',
            'user': u_match,
        })

    homeworks = []
    for h in homeworks_qs:
        t_name = f"{h.created_by.user.first_name} {h.created_by.user.last_name}".strip() if h.created_by else 'Teacher'
        homeworks.append({
            'id': f'hw-{h.id}',
            'rawId': h.id,
            'classroomId': f'c-{h.classroom_id}',
            'title': h.title,
            'description': h.description,
            'dueDate': h.due_date.isoformat() if h.due_date else None,
            'createdById': f't-{h.created_by_id}',
            'teacherName': t_name,
            'createdAt': h.created_at.isoformat() if h.created_at else None,
        })

    messages = []
    for m in messages_qs:
        sender_name = f"{m.sender.first_name} {m.sender.last_name}".strip() or m.sender.username
        sender_role = 'admin' if m.sender.is_superuser else ('teacher' if m.sender.id in teacher_user_ids else 'student')
        messages.append({
            'id': f'm-{m.id}',
            'rawId': m.id,
            'classroomId': f'c-{m.classroom_id}',
            'senderId': f'u-{m.sender_id}',
            'senderName': sender_name,
            'senderRole': sender_role,
            'senderEmail': m.sender.email,
            'text': m.body,
            'timestamp': m.created_at.isoformat() if m.created_at else None,
        })

    attendances = []
    try:
        att_qs = Attendance.objects.all().order_by('-date', 'id')
        for a in att_qs:
            attendances.append({
                'id': f'att-{a.id}',
                'rawId': a.id,
                'classroomId': f'c-{a.classroom_id}',
                'studentId': f's-{a.student_id}',
                'date': a.date.isoformat() if a.date else '',
                'status': a.status,
                'note': a.note or '',
                'markedBy': a.marked_by or '',
            })
    except Exception:
        pass

    products = []
    try:
        prod_qs = Product.objects.all().order_by('-is_available', 'id')
        for p in prod_qs:
            products.append({
                'id': f'p-{p.id}',
                'rawId': p.id,
                'name': p.name,
                'description': p.description or '',
                'priceCoins': p.price_coins,
                'price': p.price_coins,
                'stock': p.stock,
                'category': p.category or 'General',
                'imageUrl': p.image_url or '',
                'icon': p.icon or 'Gift',
                'isAvailable': p.is_available,
                'createdAt': p.created_at.isoformat() if p.created_at else None,
                'updatedAt': p.updated_at.isoformat() if p.updated_at else None,
            })
    except Exception:
        pass

    orders = []
    try:
        orders_qs = StoreOrder.objects.select_related('student', 'student__user', 'product').all().order_by('-created_at', '-id')
        for o in orders_qs:
            s_name = f"{o.student.user.first_name} {o.student.user.last_name}".strip() or o.student.user.username
            c_name = 'Unassigned'
            first_c = o.student.classroom_set.first()
            if first_c:
                c_name = first_c.name

            orders.append({
                'id': f'ord-{o.id}',
                'rawId': o.id,
                'studentId': f's-{o.student_id}',
                'studentRawId': o.student_id,
                'studentName': s_name,
                'studentEmail': o.student.user.email,
                'studentClass': c_name,
                'productId': f'p-{o.product_id}' if o.product_id else None,
                'productRawId': o.product_id,
                'productName': o.product_name,
                'productImage': o.product.image_url if o.product else '',
                'productIcon': o.product.icon if o.product else 'Gift',
                'costCoins': o.cost_coins,
                'pricePaid': o.cost_coins,
                'status': o.status or 'pending',
                'notes': o.notes or '',
                'rejectionReason': o.rejection_reason or '',
                'refunded': o.refunded,
                'createdAt': o.created_at.isoformat() if o.created_at else None,
                'completedAt': o.completed_at.isoformat() if o.completed_at else None,
                'updatedAt': o.updated_at.isoformat() if o.updated_at else None,
            })
    except Exception:
        pass

    return JsonResponse({
        'success': True,
        'users': users,
        'teachers': teachers,
        'classrooms': classrooms,
        'students': students,
        'homeworks': homeworks,
        'messages': messages,
        'attendances': attendances,
        'products': products,
        'orders': orders,
    })


@csrf_exempt
@require_auth
def api_add_points(request, student_id):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'POST method required'}, status=405)

    data = parse_json(request)
    raw_id = int(str(student_id).replace('s-', '').replace('u-', ''))
    amount = Decimal(str(data.get('amount', 1)))

    student = Student.objects.filter(id=raw_id).first() or Student.objects.filter(user_id=raw_id).first()
    if not student:
        return JsonResponse({'success': False, 'error': 'Student not found.'}, status=404)

    old_points = student.points
    old_coins = int(old_points // 10)
    student.points += amount
    new_coins = int(student.points // 10)
    diff = max(0, new_coins - old_coins)
    student.coins += diff
    student.save()

    return JsonResponse({
        'success': True,
        'newPoints': float(student.points),
        'newCoins': student.coins,
        'coinsEarned': diff,
    })


@csrf_exempt
@require_auth
def api_subtract_points(request, student_id):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'POST method required'}, status=405)

    data = parse_json(request)
    raw_id = int(str(student_id).replace('s-', '').replace('u-', ''))
    amount = Decimal(str(data.get('amount', 1)))

    student = Student.objects.filter(id=raw_id).first() or Student.objects.filter(user_id=raw_id).first()
    if not student:
        return JsonResponse({'success': False, 'error': 'Student not found.'}, status=404)

    student.points = max(Decimal('0'), student.points - amount)
    student.save()

    return JsonResponse({
        'success': True,
        'newPoints': float(student.points),
        'newCoins': student.coins,
    })


@csrf_exempt
@require_auth
def api_students(request, student_id=None):
    if request.method == 'POST':
        data = parse_json(request)
        name = (data.get('name') or '').strip()
        first_name = (data.get('firstName') or data.get('first_name') or '').strip()
        last_name = (data.get('lastName') or data.get('last_name') or '').strip()
        if not first_name and name:
            parts = name.split(' ')
            first_name = parts[0]
            last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''

        email = (data.get('email') or '').strip().lower()
        password = (data.get('password') or '').strip() or 'password123'
        age = int(data.get('age', 11))
        classroom_id = str(data.get('classroomId', '')).replace('c-', '')

        if not first_name or not email:
            return JsonResponse({'success': False, 'error': 'Name and email are required.'}, status=400)

        if User.objects.filter(email__iexact=email).exists() or User.objects.filter(username__iexact=email).exists():
            return JsonResponse({'success': False, 'error': 'A student with that email already exists.'}, status=400)

        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
        )
        student = Student.objects.create(
            user=user,
            age=age,
            points=0,
            coins=0,
            division='Class A',
        )

        if classroom_id and classroom_id.isdigit():
            c = Classroom.objects.filter(id=int(classroom_id)).first()
            if c:
                c.students.add(student)
        else:
            c = Classroom.objects.first()
            if c:
                c.students.add(student)

        return JsonResponse({'success': True, 'studentId': f's-{student.id}', 'userId': f'u-{user.id}'})

    elif request.method in ('PUT', 'PATCH'):
        raw_id = int(str(student_id).replace('s-', ''))
        student = Student.objects.filter(id=raw_id).first()
        if not student:
            return JsonResponse({'success': False, 'error': 'Student not found.'}, status=404)

        data = parse_json(request)
        name = (data.get('name') or '').strip()
        first_name = (data.get('firstName') or data.get('first_name') or '').strip()
        last_name = (data.get('lastName') or data.get('last_name') or '').strip()
        if not first_name and name:
            parts = name.split(' ')
            first_name = parts[0]
            last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''

        u = student.user
        if first_name:
            u.first_name = first_name
        if last_name or ('lastName' in data or 'last_name' in data or name):
            u.last_name = last_name
        if 'email' in data and data['email']:
            clean_email = data['email'].strip().lower()
            if User.objects.filter(email__iexact=clean_email).exclude(id=u.id).exists():
                return JsonResponse({'success': False, 'error': 'Email already in use by another user.'}, status=400)
            u.email = clean_email
            u.username = clean_email
        if 'password' in data and data['password']:
            u.set_password(data['password'].strip())
        u.save()

        if 'age' in data and data['age'] is not None:
            student.age = int(data['age'])
        if 'points' in data and data['points'] is not None:
            student.points = Decimal(str(data['points']))
        if 'coins' in data and data['coins'] is not None:
            student.coins = int(data['coins'])
        student.save()

        if 'classroomId' in data and data['classroomId']:
            new_c_id_str = str(data['classroomId']).replace('c-', '')
            if new_c_id_str.isdigit():
                new_c_id = int(new_c_id_str)
                for c in student.classroom_set.all():
                    c.students.remove(student)
                new_c = Classroom.objects.filter(id=new_c_id).first()
                if new_c:
                    new_c.students.add(student)

        return JsonResponse({'success': True})

    elif request.method == 'DELETE':
        raw_id = int(str(student_id).replace('s-', ''))
        student = Student.objects.filter(id=raw_id).first()
        if student:
            user = student.user
            ChatMessage.objects.filter(sender=user).delete()
            Attendance.objects.filter(student=student).delete()
            for c in student.classroom_set.all():
                c.students.remove(student)
            student.delete()
            user.delete()
        return JsonResponse({'success': True})

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
@require_auth
def api_teachers(request, teacher_id=None):
    if request.method == 'POST':
        data = parse_json(request)
        first_name = data.get('firstName', '').strip()
        last_name = data.get('lastName', '').strip()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '').strip() or 'password123'
        classroom_name = data.get('classroomName', '').strip()

        if not first_name or not email:
            return JsonResponse({'success': False, 'error': 'First name and email are required.'}, status=400)

        if User.objects.filter(email__iexact=email).exists():
            return JsonResponse({'success': False, 'error': 'User with this email already exists.'}, status=400)

        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
        )
        teacher = Teacher.objects.create(user=user)
        c = Classroom.objects.create(
            name=classroom_name or f"{first_name}'s Class",
            teacher=teacher,
            branch='Bordj Kiffan',
            specialty='SE1',
        )
        return JsonResponse({'success': True, 'teacherId': f't-{teacher.id}', 'classroomId': f'c-{c.id}'})

    elif request.method in ('PUT', 'PATCH'):
        raw_id = int(str(teacher_id).replace('t-', '').replace('u-', ''))
        teacher = Teacher.objects.filter(id=raw_id).first() or Teacher.objects.filter(user_id=raw_id).first()
        if not teacher:
            return JsonResponse({'success': False, 'error': 'Teacher not found.'}, status=404)

        data = parse_json(request)
        u = teacher.user
        if 'firstName' in data:
            u.first_name = data['firstName']
        if 'lastName' in data:
            u.last_name = data['lastName']
        if 'email' in data and data['email']:
            u.email = data['email'].strip().lower()
            u.username = u.email
        if 'password' in data and data['password']:
            u.set_password(data['password'])
        u.save()

        if 'classroomName' in data and data['classroomName']:
            c = teacher.classroom_set.first()
            if c:
                c.name = data['classroomName']
                c.save()

        return JsonResponse({'success': True})

    elif request.method == 'DELETE':
        raw_id = int(str(teacher_id).replace('t-', '').replace('u-', ''))
        teacher = Teacher.objects.filter(id=raw_id).first() or Teacher.objects.filter(user_id=raw_id).first()
        if teacher:
            user = teacher.user
            teacher.delete()
            user.delete()
        return JsonResponse({'success': True})

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
@require_auth
def api_classrooms(request, classroom_id=None):
    if request.method == 'POST':
        data = parse_json(request)
        name = data.get('name', '').strip()
        teacher_id = int(str(data.get('teacherId', '1')).replace('t-', ''))
        branch = data.get('branch', 'Bordj Kiffan')
        specialty = data.get('specialty', 'SE1')
        session_time = data.get('sessionTime', '')

        teacher = Teacher.objects.filter(id=teacher_id).first() or Teacher.objects.first()
        if not teacher:
            return JsonResponse({'success': False, 'error': 'No teacher found.'}, status=400)

        c = Classroom.objects.create(
            name=name or 'New Classroom',
            teacher=teacher,
            branch=branch,
            specialty=specialty,
            session_time=session_time,
        )
        return JsonResponse({'success': True, 'classroomId': f'c-{c.id}'})

    elif request.method in ('PUT', 'PATCH'):
        raw_id = int(str(classroom_id).replace('c-', ''))
        c = Classroom.objects.filter(id=raw_id).first()
        if not c:
            return JsonResponse({'success': False, 'error': 'Classroom not found.'}, status=404)

        data = parse_json(request)
        if 'name' in data:
            c.name = data['name']
        if 'branch' in data:
            c.branch = data['branch']
        if 'specialty' in data:
            c.specialty = data['specialty']
        if 'sessionTime' in data:
            c.session_time = data['sessionTime']
        if 'teacherId' in data:
            t_id = int(str(data['teacherId']).replace('t-', ''))
            t = Teacher.objects.filter(id=t_id).first()
            if t:
                c.teacher = t
        c.save()
        return JsonResponse({'success': True})

    elif request.method == 'DELETE':
        raw_id = int(str(classroom_id).replace('c-', ''))
        c = Classroom.objects.filter(id=raw_id).first()
        if c:
            c.delete()
        return JsonResponse({'success': True})

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
@require_auth
def api_classroom_share(request, classroom_id):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'POST method required'}, status=405)

    data = parse_json(request)
    raw_c_id = int(str(classroom_id).replace('c-', ''))
    raw_t_id = int(str(data.get('teacherId', '')).replace('t-', ''))

    c = Classroom.objects.filter(id=raw_c_id).first()
    t = Teacher.objects.filter(id=raw_t_id).first()
    if c and t:
        c.shared_with.add(t)

    return JsonResponse({'success': True})


@csrf_exempt
@require_auth
def api_classroom_unshare(request, classroom_id):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'POST method required'}, status=405)

    data = parse_json(request)
    raw_c_id = int(str(classroom_id).replace('c-', ''))
    raw_t_id = int(str(data.get('teacherId', '')).replace('t-', ''))

    c = Classroom.objects.filter(id=raw_c_id).first()
    t = Teacher.objects.filter(id=raw_t_id).first()
    if c and t:
        c.shared_with.remove(t)

    return JsonResponse({'success': True})


@csrf_exempt
@require_auth
def api_homework(request, homework_id=None):
    if request.method == 'POST':
        data = parse_json(request)
        class_id = int(str(data.get('classroomId', '1')).replace('c-', ''))
        created_by_id = int(str(data.get('createdById', '1')).replace('t-', ''))
        title = data.get('title', '').strip()
        description = data.get('description', '').strip()
        due_date = data.get('dueDate')

        c = Classroom.objects.filter(id=class_id).first()
        t = Teacher.objects.filter(id=created_by_id).first() or Teacher.objects.first()

        if not c or not title:
            return JsonResponse({'success': False, 'error': 'Title and classroom are required.'}, status=400)

        hw = Homework.objects.create(
            classroom=c,
            created_by=t,
            title=title,
            description=description,
            due_date=due_date if due_date else None,
        )
        return JsonResponse({'success': True, 'homeworkId': f'hw-{hw.id}'})

    elif request.method == 'DELETE':
        raw_id = int(str(homework_id).replace('hw-', ''))
        Homework.objects.filter(id=raw_id).delete()
        return JsonResponse({'success': True})

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
@require_auth
def api_messages(request):
    if request.method == 'POST':
        data = parse_json(request)
        class_id = int(str(data.get('classroomId', '1')).replace('c-', ''))
        sender_user_id = int(str(data.get('senderId', '1')).replace('u-', ''))
        body = data.get('text', '').strip()

        c = Classroom.objects.filter(id=class_id).first()
        u = User.objects.filter(id=sender_user_id).first()

        if not c or not u or not body:
            return JsonResponse({'success': False, 'error': 'Classroom, sender, and text are required.'}, status=400)

        msg = ChatMessage.objects.create(
            classroom=c,
            sender=u,
            body=body,
        )
        return JsonResponse({
            'success': True,
            'message': {
                'id': f'm-{msg.id}',
                'rawId': msg.id,
                'classroomId': f'c-{c.id}',
                'senderId': f'u-{u.id}',
                'senderName': f"{u.first_name} {u.last_name}".strip() or u.username,
                'senderRole': 'admin' if u.is_superuser else 'teacher',
                'senderEmail': u.email,
                'text': msg.body,
                'timestamp': msg.created_at.isoformat(),
            }
        })

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
@require_auth
def api_attendance(request):
    if request.method == 'POST':
        data = parse_json(request)
        c_id = int(str(data.get('classroomId', '1')).replace('c-', ''))
        s_id = int(str(data.get('studentId', '1')).replace('s-', ''))
        date_str = data.get('date', '').strip()
        status = data.get('status', 'present')
        note = data.get('note', '')
        marked_by = data.get('markedBy', '')

        c = Classroom.objects.filter(id=c_id).first()
        s = Student.objects.filter(id=s_id).first()

        if c and s and date_str:
            att, _ = Attendance.objects.update_or_create(
                classroom=c,
                student=s,
                date=date_str,
                defaults={'status': status, 'note': note, 'marked_by': marked_by}
            )
            return JsonResponse({'success': True, 'attendanceId': f'att-{att.id}'})

        return JsonResponse({'success': False, 'error': 'Invalid parameters'}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
@require_auth
def api_attendance_bulk(request):
    if request.method == 'POST':
        data = parse_json(request)
        c_id = int(str(data.get('classroomId', '1')).replace('c-', ''))
        date_str = data.get('date', '').strip()
        records = data.get('records', [])
        marked_by = data.get('markedBy', '')

        c = Classroom.objects.filter(id=c_id).first()
        if c and date_str and records:
            for r in records:
                s_id = int(str(r.get('studentId', '')).replace('s-', ''))
                s = Student.objects.filter(id=s_id).first()
                if s:
                    Attendance.objects.update_or_create(
                        classroom=c,
                        student=s,
                        date=date_str,
                        defaults={
                            'status': r.get('status', 'present'),
                            'note': r.get('note', ''),
                            'marked_by': marked_by,
                        }
                    )
            return JsonResponse({'success': True})

    return JsonResponse({'success': False, 'error': 'Invalid parameters'}, status=400)


@csrf_exempt
@require_auth
def api_attendance_day(request):
    if request.method == 'DELETE':
        c_id_raw = request.GET.get('classroomId', '')
        date_str = request.GET.get('date', '').strip()

        if c_id_raw and date_str:
            c_id = int(str(c_id_raw).replace('c-', ''))
            Attendance.objects.filter(classroom_id=c_id, date=date_str).delete()
            return JsonResponse({'success': True})

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
@require_auth
def api_store_upload(request):
    if request.method == 'POST' and request.FILES.get('image'):
        f = request.FILES['image']
        ext = os.path.splitext(f.name)[1].lower()
        if ext not in ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']:
            return JsonResponse({'success': False, 'error': 'Invalid image format'}, status=400)
        
        filename = f"{int(time.time()*1000)}_{os.path.basename(f.name)}"
        dest_dir = os.path.join(settings.MEDIA_ROOT, 'products')
        os.makedirs(dest_dir, exist_ok=True)
        dest_path = os.path.join(dest_dir, filename)
        
        with open(dest_path, 'wb+') as destination:
            for chunk in f.chunks():
                destination.write(chunk)
                
        return JsonResponse({'success': True, 'url': f'/uploads/products/{filename}'})
    return JsonResponse({'success': False, 'error': 'No file uploaded'}, status=400)


@csrf_exempt
@require_auth
def api_store_products(request, product_id=None):
    if request.method == 'GET':
        available_only = request.GET.get('availableOnly') == 'true'
        qs = Product.objects.all().order_by('-is_available', 'id')
        if available_only:
            qs = qs.filter(is_available=True)
        products = []
        for p in qs:
            products.append({
                'id': f'p-{p.id}',
                'rawId': p.id,
                'name': p.name,
                'description': p.description or '',
                'priceCoins': p.price_coins,
                'price': p.price_coins,
                'stock': p.stock,
                'category': p.category or 'General',
                'imageUrl': p.image_url or '',
                'icon': p.icon or 'Gift',
                'isAvailable': p.is_available,
                'createdAt': p.created_at.isoformat() if p.created_at else None,
                'updatedAt': p.updated_at.isoformat() if p.updated_at else None,
            })
        return JsonResponse({'success': True, 'products': products})

    elif request.method == 'POST':
        data = parse_json(request)
        name = str(data.get('name', '')).strip()
        if not name:
            return JsonResponse({'success': False, 'error': 'Product name required'}, status=400)
        
        price = max(0, int(data.get('priceCoins', data.get('price', 1))))
        stock = max(0, int(data.get('stock', 0)))
        category = str(data.get('category', 'General')).strip()
        is_available = bool(data.get('isAvailable', True))
        image_url = str(data.get('imageUrl', ''))
        icon = str(data.get('icon', 'Gift'))

        prod = Product.objects.create(
            name=name,
            description=data.get('description', ''),
            price_coins=price,
            stock=stock,
            category=category,
            image_url=image_url,
            icon=icon,
            is_available=is_available,
        )
        return JsonResponse({
            'success': True,
            'product': {
                'id': f'p-{prod.id}',
                'rawId': prod.id,
                'name': prod.name,
                'description': prod.description,
                'priceCoins': prod.price_coins,
                'price': prod.price_coins,
                'stock': prod.stock,
                'category': prod.category,
                'imageUrl': prod.image_url,
                'icon': prod.icon,
                'isAvailable': prod.is_available,
            }
        })

    elif request.method == 'PUT':
        raw_id = int(str(product_id).replace('p-', '')) if product_id else 0
        prod = Product.objects.filter(id=raw_id).first()
        if not prod:
            return JsonResponse({'success': False, 'error': 'Product not found'}, status=404)
        
        data = parse_json(request)
        if 'name' in data:
            prod.name = str(data['name']).strip() or prod.name
        if 'description' in data:
            prod.description = str(data['description'])
        if 'priceCoins' in data or 'price' in data:
            prod.price_coins = max(0, int(data.get('priceCoins', data.get('price', prod.price_coins))))
        if 'stock' in data:
            prod.stock = max(0, int(data['stock']))
        if 'category' in data:
            prod.category = str(data['category']).strip()
        if 'imageUrl' in data:
            prod.image_url = str(data['imageUrl'])
        if 'icon' in data:
            prod.icon = str(data['icon'])
        if 'isAvailable' in data:
            prod.is_available = bool(data['isAvailable'])
        prod.save()

        return JsonResponse({
            'success': True,
            'product': {
                'id': f'p-{prod.id}',
                'rawId': prod.id,
                'name': prod.name,
                'description': prod.description,
                'priceCoins': prod.price_coins,
                'stock': prod.stock,
                'category': prod.category,
                'imageUrl': prod.image_url,
                'icon': prod.icon,
                'isAvailable': prod.is_available,
            }
        })

    elif request.method == 'DELETE':
        raw_id = int(str(product_id).replace('p-', '')) if product_id else 0
        prod = Product.objects.filter(id=raw_id).first()
        if not prod:
            return JsonResponse({'success': False, 'error': 'Product not found'}, status=404)
        
        if StoreOrder.objects.filter(product_id=raw_id).exists():
            prod.is_available = False
            prod.save()
            return JsonResponse({'success': True, 'action': 'deactivated'})
        
        prod.delete()
        return JsonResponse({'success': True, 'action': 'deleted'})

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
@require_auth
def api_store_purchase(request):
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'POST method required'}, status=405)

    data = parse_json(request)
    raw_student_id = int(str(data.get('studentId', '')).replace('s-', '')) if data.get('studentId') else 0
    raw_prod_id = int(str(data.get('productId', '')).replace('p-', '')) if data.get('productId') else 0

    if not raw_student_id or not raw_prod_id:
        return JsonResponse({'success': False, 'error': 'Valid student ID and product ID required'}, status=400)

    try:
        with transaction.atomic():
            student = Student.objects.select_for_update().filter(id=raw_student_id).first()
            if not student:
                return JsonResponse({'success': False, 'error': 'Student not found'}, status=404)

            product = Product.objects.select_for_update().filter(id=raw_prod_id).first()
            if not product:
                return JsonResponse({'success': False, 'error': 'Product not found'}, status=404)

            if not product.is_available:
                return JsonResponse({'success': False, 'error': 'This reward is currently unavailable'}, status=400)

            if product.stock <= 0:
                return JsonResponse({'success': False, 'error': 'This product is out of stock'}, status=400)

            if student.coins < product.price_coins:
                return JsonResponse({
                    'success': False,
                    'error': "You don't have enough coins for this reward.",
                    'currentCoins': student.coins,
                    'requiredCoins': product.price_coins
                }, status=400)

            # Deduct coins and decrease stock
            student.coins -= product.price_coins
            student.save(update_fields=['coins'])

            product.stock -= 1
            product.save(update_fields=['stock', 'updated_at'])

            order = StoreOrder.objects.create(
                student=student,
                product=product,
                product_name=product.name,
                cost_coins=product.price_coins,
                status='pending',
            )

            return JsonResponse({
                'success': True,
                'orderId': f'ord-{order.id}',
                'rawOrderId': order.id,
                'newCoins': student.coins,
                'costCoins': product.price_coins,
                'remainingStock': product.stock,
                'message': f'Successfully requested "{product.name}"! Status is now Pending.'
            })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_auth
def api_store_orders(request, order_id=None):
    if request.method == 'GET':
        student_id = request.GET.get('studentId')
        qs = StoreOrder.objects.select_related('student', 'student__user', 'product').all().order_by('-created_at', '-id')
        if student_id:
            raw_s_id = int(str(student_id).replace('s-', ''))
            qs = qs.filter(student_id=raw_s_id)

        orders = []
        for o in qs:
            s_name = f"{o.student.user.first_name} {o.student.user.last_name}".strip() or o.student.user.username
            c_name = 'Unassigned'
            first_c = o.student.classroom_set.first()
            if first_c:
                c_name = first_c.name

            orders.append({
                'id': f'ord-{o.id}',
                'rawId': o.id,
                'studentId': f's-{o.student_id}',
                'studentRawId': o.student_id,
                'studentName': s_name,
                'studentEmail': o.student.user.email,
                'studentClass': c_name,
                'productId': f'p-{o.product_id}' if o.product_id else None,
                'productRawId': o.product_id,
                'productName': o.product_name,
                'productImage': o.product.image_url if o.product else '',
                'productIcon': o.product.icon if o.product else 'Gift',
                'costCoins': o.cost_coins,
                'pricePaid': o.cost_coins,
                'status': o.status or 'pending',
                'notes': o.notes or '',
                'rejectionReason': o.rejection_reason or '',
                'refunded': o.refunded,
                'createdAt': o.created_at.isoformat() if o.created_at else None,
                'completedAt': o.completed_at.isoformat() if o.completed_at else None,
                'updatedAt': o.updated_at.isoformat() if o.updated_at else None,
            })
        return JsonResponse({'success': True, 'orders': orders})

    if request.method == 'DELETE':
        if not order_id:
            return JsonResponse({'success': False, 'error': 'Order id is required.'}, status=400)

        raw_order_id = int(str(order_id).replace('ord-', ''))
        refund_param = (request.GET.get('refund') or '').strip().lower() in ('true', '1', 't', 'yes')

        try:
            with transaction.atomic():
                order = StoreOrder.objects.select_for_update().filter(id=raw_order_id).first()
                if not order:
                    return JsonResponse({'success': False, 'error': 'Order not found.'}, status=404)

                if refund_param and not order.refunded:
                    student = Student.objects.select_for_update().filter(id=order.student_id).first()
                    if student:
                        student.coins += order.cost_coins
                        student.save(update_fields=['coins'])
                    if order.product_id:
                        Product.objects.filter(id=order.product_id).update(stock=F('stock') + 1)

                order.delete()

            return JsonResponse({'success': True, 'message': 'Request removed.'})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
@require_auth
def api_store_order_status(request, order_id):
    if request.method not in ['PUT', 'POST']:
        return JsonResponse({'success': False, 'error': 'PUT or POST method required'}, status=405)

    raw_order_id = int(str(order_id).replace('ord-', ''))
    data = parse_json(request)
    new_status = data.get('status')
    valid_statuses = ['pending', 'approved', 'rejected', 'completed']

    if new_status not in valid_statuses:
        return JsonResponse({'success': False, 'error': 'Invalid status'}, status=400)

    try:
        with transaction.atomic():
            order = StoreOrder.objects.select_for_update().filter(id=raw_order_id).first()
            if not order:
                return JsonResponse({'success': False, 'error': 'Order not found'}, status=404)

            refunded_now = False
            cost = order.cost_coins
            if new_status == 'rejected' and not order.refunded:
                student = Student.objects.select_for_update().filter(id=order.student_id).first()
                if student:
                    student.coins += cost
                    student.save(update_fields=['coins'])

                if order.product_id:
                    Product.objects.filter(id=order.product_id).update(stock=F('stock') + 1)

                order.refunded = True
                refunded_now = True

            order.status = new_status
            if 'rejectionReason' in data:
                order.rejection_reason = str(data['rejectionReason'])
            if 'notes' in data:
                order.notes = str(data['notes'])
            if new_status == 'completed':
                from django.utils import timezone
                order.completed_at = timezone.now()

            should_remove = data.get('remove') is True or (data.get('remove') is not False and new_status in ['approved', 'rejected', 'completed'])
            if should_remove:
                order_id_copy = order.id
                order.delete()
                msg = f"Request rejected and removed. {cost} coins refunded to student." if new_status == 'rejected' else "Request approved and completed. The request has been removed."
                return JsonResponse({
                    'success': True,
                    'orderId': f'ord-{order_id_copy}',
                    'status': new_status,
                    'removed': True,
                    'refunded': refunded_now,
                    'refundAmount': cost if refunded_now else 0,
                    'message': msg,
                })

            order.save()

            msg = f"Order status updated to {new_status}."
            if refunded_now:
                msg = f"Request rejected. {cost} coins refunded to student and stock restored."

            return JsonResponse({
                'success': True,
                'orderId': f'ord-{order.id}',
                'status': new_status,
                'removed': False,
                'refunded': order.refunded,
                'refundAmount': cost if refunded_now else 0,
                'message': msg,
            })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)
