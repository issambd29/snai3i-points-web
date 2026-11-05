"""
JSON API consumed by the React frontend.

Every endpoint goes through the ``api`` decorator, which enforces:
  * the allowed HTTP methods,
  * authentication (401) and role permissions (403),
  * uniform JSON errors (no stack traces / exception text leaked to clients).

CSRF protection is NOT disabled anywhere: the frontend sends the ``X-CSRFToken``
header on every unsafe request (see ``src/utils/api.js``).
"""
import json
import logging
import os
import uuid
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from functools import wraps

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import connection, transaction
from django.db.models import F, Q
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.views.decorators.csrf import ensure_csrf_cookie

from .models import (
    Attendance, ChatMessage, Classroom, Homework, Manager, Product, ProductImage, Student, StoreOrder, Teacher,
)

logger = logging.getLogger(__name__)

ADMIN, MANAGER, TEACHER, STUDENT = 'admin', 'manager', 'teacher', 'student'

# The branches of the school. A manager is tied to exactly one of them.
# (Keep in sync with BRANCH_OPTIONS in src/constants.js.)
BRANCHES = ('Bordj Kiffan', 'Rouissou', 'Oran', 'Online')

POINTS_PER_COIN = Decimal('10')
MAX_POINTS_PER_ACTION = Decimal('1000')
ATTENDANCE_STATUSES = {'present', 'absent', 'late', 'excused'}
ATTENDANCE_CLEAR_VALUES = {'', 'unmarked', 'clear', 'deleted', 'none'}
ORDER_STATUSES = {'pending', 'approved', 'rejected', 'completed', 'delivered'}
ATTENDANCE_WINDOW_DAYS = 365
MESSAGE_LIMIT = 300

MAX_FAILED_LOGINS_PER_ACCOUNT = 10
MAX_FAILED_LOGINS_PER_IP = 30
LOGIN_LOCKOUT_SECONDS = 15 * 60

MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_CONTENT_TYPES = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp',
}
IMAGE_SIGNATURES = {
    '.jpg': (b'\xff\xd8\xff',),
    '.jpeg': (b'\xff\xd8\xff',),
    '.png': (b'\x89PNG\r\n\x1a\n',),
    '.gif': (b'GIF87a', b'GIF89a'),
    '.webp': (b'RIFF',),
}


# ===========================================================================
# Infrastructure: errors, decorator, parsing helpers
# ===========================================================================

class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def error_response(message, status=400):
    return JsonResponse({'success': False, 'error': message}, status=status)


def get_role(user):
    if user.is_superuser:
        return ADMIN
    if Manager.objects.filter(user=user).exists():
        return MANAGER
    if Teacher.objects.filter(user=user).exists():
        return TEACHER
    if Student.objects.filter(user=user).exists():
        return STUDENT
    return None


def api(methods=('GET',), roles=None, public=False):
    """Method check -> authentication -> role check -> uniform error handling."""

    def decorator(view):
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            if request.method not in methods:
                return error_response('Method not allowed.', 405)

            request.role = None
            if not public:
                if not request.user.is_authenticated:
                    return error_response('Authentication required.', 401)
                request.role = get_role(request.user)
                if request.role is None or (roles and request.role not in roles):
                    return error_response('You do not have permission to do that.', 403)

            try:
                return view(request, *args, **kwargs)
            except ApiError as exc:
                return error_response(exc.message, exc.status)
            except Exception:  # noqa: BLE001 - last line of defence, details go to the log only
                logger.exception('Unhandled error in %s', view.__name__)
                return error_response('Something went wrong. Please try again.', 500)

        return wrapped

    return decorator


def read_json(request):
    if not request.body:
        return {}
    try:
        data = json.loads(request.body.decode('utf-8'))
    except (ValueError, UnicodeDecodeError):
        raise ApiError('Invalid JSON body.')
    if not isinstance(data, dict):
        raise ApiError('JSON body must be an object.')
    return data


def parse_id(value, *prefixes, field='id'):
    """Accept ``12``, ``'12'`` or ``'s-12'`` and return the integer id."""
    text = str(value if value is not None else '').strip()
    for prefix in prefixes:
        if text.startswith(prefix):
            text = text[len(prefix):]
            break
    if not text.isdigit():
        raise ApiError(f'Invalid {field}.')
    return int(text)


def clean_text(value, field, max_length, required=False):
    if value is None:
        value = ''
    text = value.strip() if isinstance(value, str) else str(value).strip()
    if required and not text:
        raise ApiError(f'{field} is required.')
    if len(text) > max_length:
        raise ApiError(f'{field} is too long (max {max_length} characters).')
    return text


def clean_int(value, field, minimum, maximum, default=None):
    if value is None or value == '':
        if default is None:
            raise ApiError(f'{field} is required.')
        return default
    if isinstance(value, bool):
        raise ApiError(f'{field} must be a whole number.')
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ApiError(f'{field} must be a whole number.')
    if number < minimum or number > maximum:
        raise ApiError(f'{field} must be between {minimum} and {maximum}.')
    return number


def clean_date(value, field='Date', required=True):
    if value is None or str(value).strip() == '':
        if required:
            raise ApiError(f'{field} is required.')
        return None
    try:
        parsed = parse_date(str(value).strip())
    except ValueError:
        parsed = None
    if parsed is None:
        raise ApiError(f'{field} is invalid. Use the format YYYY-MM-DD.')
    return parsed


def clean_email(value):
    email = clean_text(value, 'Email', 150, required=True).lower()
    try:
        validate_email(email)
    except ValidationError:
        raise ApiError('Please enter a valid email address.')
    return email


def clean_password(value, user=None):
    password = value if isinstance(value, str) else ''
    if not password:
        raise ApiError('Password is required.')
    try:
        validate_password(password, user=user)
    except ValidationError as exc:
        raise ApiError(' '.join(exc.messages))
    return password


def email_in_use(email, exclude_user_id=None):
    qs = User.objects.filter(Q(email__iexact=email) | Q(username__iexact=email))
    if exclude_user_id:
        qs = qs.exclude(id=exclude_user_id)
    return qs.exists()


def extract_names(data, required=False):
    """Return ``(first, last)`` from firstName/lastName or a single ``name``.

    Returns ``(None, None)`` when the payload carries no name information.
    """
    has_first = any(k in data for k in ('firstName', 'first_name'))
    has_name = bool(str(data.get('name') or '').strip())
    if not has_first and not has_name:
        if required:
            raise ApiError('Name is required.')
        return None, None

    first = clean_text(data.get('firstName', data.get('first_name')), 'First name', 150)
    last_given = any(k in data for k in ('lastName', 'last_name'))
    last = clean_text(data.get('lastName', data.get('last_name')), 'Last name', 150)
    if not first and has_name:
        parts = clean_text(data.get('name'), 'Name', 300).split(None, 1)
        first = parts[0]
        if not last_given:
            last = parts[1] if len(parts) > 1 else ''
    if not first:
        raise ApiError('First name is required.')
    return first, last


# ===========================================================================
# Access control helpers
# ===========================================================================

def teacher_of(user):
    return Teacher.objects.filter(user=user).first()


def manager_branch(user):
    """The branch a manager is in charge of ('' when the user is not a manager)."""
    manager = Manager.objects.filter(user=user).first()
    return manager.branch if manager else ''


def teachers_of_branch(branch):
    """Teachers that own, or are shared on, at least one class of the branch."""
    classes = Classroom.objects.filter(branch=branch)
    return Teacher.objects.filter(Q(classroom__in=classes) | Q(shared_classrooms__in=classes)).distinct()


def accessible_classrooms(user, role):
    qs = Classroom.objects.all()
    if role == ADMIN:
        return qs
    if role == MANAGER:
        # A manager's whole world is their own branch.
        return qs.filter(branch=manager_branch(user))
    if role == TEACHER:
        teacher = teacher_of(user)
        return qs.filter(Q(teacher=teacher) | Q(shared_with=teacher)).distinct()
    if role == STUDENT:
        return qs.filter(students__user=user).distinct()
    return qs.none()


def get_classroom(request, raw_id, owner_only=False):
    class_id = parse_id(raw_id, 'c-', field='classroom id')
    classroom = (
        accessible_classrooms(request.user, request.role)
        .select_related('teacher__user')
        .filter(id=class_id)
        .first()
    )
    if classroom is None:
        raise ApiError('Classroom not found.', 404)
    if owner_only and request.role not in (ADMIN, MANAGER) and classroom.teacher.user_id != request.user.id:
        raise ApiError('Only the class owner can do that.', 403)
    return classroom


def get_manageable_student(request, raw_id):
    """A student the requester may manage: any (admin) or one in an accessible class."""
    student_id = parse_id(raw_id, 's-', field='student id')
    qs = Student.objects.select_related('user').filter(id=student_id)
    if request.role != ADMIN:
        qs = qs.filter(classroom__in=accessible_classrooms(request.user, request.role)).distinct()
    student = qs.first()
    if student is None:
        raise ApiError('Student not found.', 404)
    return student


def display_name(user):
    return f'{user.first_name} {user.last_name}'.strip() or user.username


# ===========================================================================
# Serializers
# ===========================================================================

def serialize_user(user, role, include_contact=True):
    data = {
        'id': f'u-{user.id}',
        'rawId': user.id,
        'firstName': user.first_name or ('System' if user.is_superuser else 'User'),
        'lastName': user.last_name or ('Admin' if user.is_superuser else ''),
        'name': display_name(user),
        'role': role,
        'isSuperuser': user.is_superuser,
    }
    if include_contact:
        data['username'] = user.username
        data['email'] = user.email
    if role == MANAGER:
        data['branch'] = manager_branch(user)
    return data


def serialize_manager(m, user_payload):
    return {
        'id': f'mg-{m.id}',
        'rawId': m.id,
        'userId': f'u-{m.user_id}',
        'userRawId': m.user_id,
        'branch': m.branch,
        'user': user_payload,
    }


def serialize_product(p):
    return {
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
    }


def serialize_order(o, class_name='Unassigned'):
    return {
        'id': f'ord-{o.id}',
        'rawId': o.id,
        'studentId': f's-{o.student_id}',
        'studentRawId': o.student_id,
        'studentName': display_name(o.student.user),
        'studentEmail': o.student.user.email,
        'studentClass': class_name,
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
    }


def serialize_message(m, sender_role):
    return {
        'id': f'm-{m.id}',
        'rawId': m.id,
        'classroomId': f'c-{m.classroom_id}',
        'senderId': f'u-{m.sender_id}',
        'senderName': display_name(m.sender),
        'senderRole': sender_role,
        'text': m.body,
        'body': m.body,
        'content': m.body,
        'timestamp': m.created_at.isoformat(),
    }


def serialize_attendance(a):
    return {
        'id': f'att-{a.id}',
        'rawId': a.id,
        'classroomId': f'c-{a.classroom_id}',
        'studentId': f's-{a.student_id}',
        'date': a.date.isoformat(),
        'status': a.status,
        'note': a.note or '',
        'markedBy': a.marked_by or '',
    }


def sender_roles(messages):
    """Map user id -> role for the senders of the given messages (one query)."""
    teacher_user_ids = set(
        Teacher.objects.filter(user_id__in={m.sender_id for m in messages}).values_list('user_id', flat=True)
    )

    manager_user_ids = set(
        Manager.objects.filter(user_id__in={m.sender_id for m in messages}).values_list('user_id', flat=True)
    )

    def role_for(message):
        if message.sender.is_superuser:
            return ADMIN
        if message.sender_id in manager_user_ids:
            return MANAGER
        return TEACHER if message.sender_id in teacher_user_ids else STUDENT

    return role_for


def student_class_names(student_ids):
    """student id -> name of the first classroom the student is in."""
    names = {}
    through = Classroom.students.through
    rows = (
        through.objects.filter(student_id__in=student_ids)
        .select_related('classroom')
        .order_by('classroom_id')
    )
    for row in rows:
        names.setdefault(row.student_id, row.classroom.name)
    return names


# ===========================================================================
# Authentication
# ===========================================================================

def client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        # Render appends the real client address last; earlier entries can be spoofed.
        return forwarded.split(',')[-1].strip()
    return request.META.get('REMOTE_ADDR', 'unknown')


def _login_keys(request, identifier):
    return (f'login-fail:acct:{identifier}', f'login-fail:ip:{client_ip(request)}')


def _login_locked(request, identifier):
    account_key, ip_key = _login_keys(request, identifier)
    return (
        cache.get(account_key, 0) >= MAX_FAILED_LOGINS_PER_ACCOUNT
        or cache.get(ip_key, 0) >= MAX_FAILED_LOGINS_PER_IP
    )


def _register_login_failure(request, identifier):
    for key in _login_keys(request, identifier):
        cache.add(key, 0, LOGIN_LOCKOUT_SECONDS)
        try:
            cache.incr(key)
        except ValueError:
            cache.set(key, 1, LOGIN_LOCKOUT_SECONDS)


@api(methods=('GET',), public=True)
def api_health(request):
    try:
        connection.ensure_connection()
    except Exception:  # noqa: BLE001
        logger.exception('Health check: database unreachable')
        return JsonResponse({'status': 'error'}, status=503)
    return JsonResponse({'status': 'ok'})


@ensure_csrf_cookie
@api(methods=('POST',), public=True)
def api_signin(request):
    data = read_json(request)
    identifier = clean_text(data.get('email'), 'Email', 254).lower()
    password = data.get('password') if isinstance(data.get('password'), str) else ''

    if not identifier or not password:
        raise ApiError('Email and password are required.')

    if _login_locked(request, identifier):
        raise ApiError('Too many failed sign-in attempts. Please wait 15 minutes and try again.', 429)

    candidate = User.objects.filter(Q(email__iexact=identifier) | Q(username__iexact=identifier)).first()
    user = authenticate(request, username=candidate.username, password=password) if candidate else None
    if user is None:
        _register_login_failure(request, identifier)
        raise ApiError('Invalid credentials.', 401)

    role = get_role(user)
    if role is None:
        raise ApiError('This account has no role yet. Please contact an administrator.', 403)

    cache.delete(_login_keys(request, identifier)[0])
    login(request, user)
    return JsonResponse({'success': True, 'user': serialize_user(user, role)})


@api(methods=('POST',), public=True)
def api_signup(request):
    if not settings.ALLOW_PUBLIC_SIGNUP:
        raise ApiError('Public sign-up is disabled. Please ask an administrator to create your account.', 403)

    data = read_json(request)
    first_name = clean_text(data.get('firstName', data.get('first_name')), 'First name', 150, required=True)
    last_name = clean_text(data.get('lastName', data.get('last_name')), 'Last name', 150)
    email = clean_email(data.get('email'))
    if email_in_use(email):
        raise ApiError('An account with that email already exists.')
    password = clean_password(
        data.get('password'),
        User(username=email, email=email, first_name=first_name, last_name=last_name),
    )

    with transaction.atomic():
        user = User.objects.create_user(
            username=email, email=email, password=password,
            first_name=first_name, last_name=last_name,
        )
        teacher = Teacher.objects.create(user=user)
        Classroom.objects.create(name=f"{first_name}'s Class", teacher=teacher)

    login(request, user)
    return JsonResponse({'success': True, 'user': serialize_user(user, TEACHER)})


@api(methods=('POST',), public=True)
def api_signout(request):
    logout(request)
    return JsonResponse({'success': True})


@ensure_csrf_cookie
@api(methods=('GET',), public=True)
def api_current_user(request):
    if request.user.is_authenticated:
        role = get_role(request.user)
        if role is not None:
            return JsonResponse({'authenticated': True, 'user': serialize_user(request.user, role)})
    return JsonResponse({'authenticated': False, 'user': None})


# ===========================================================================
# App state (scoped to what the signed-in user is allowed to see)
# ===========================================================================

@api(methods=('GET',))
def api_get_app_data(request):
    user, role = request.user, request.role

    classrooms = list(
        accessible_classrooms(user, role)
        .select_related('teacher__user')
        .prefetch_related('shared_with__user', 'students')
        .order_by('id')
    )
    classroom_ids = [c.id for c in classrooms]

    # student id -> first classroom containing them (None for unassigned students)
    student_classroom = {}
    for c in classrooms:
        for s in c.students.all():
            student_classroom.setdefault(s.id, c)

    students_qs = Student.objects.select_related('user').order_by('id')
    if role != ADMIN:
        students_qs = students_qs.filter(id__in=list(student_classroom.keys()))
    students = list(students_qs)

    teacher_ids = {c.teacher_id for c in classrooms}
    for c in classrooms:
        teacher_ids.update(t.id for t in c.shared_with.all())
    own_teacher = teacher_of(user) if role == TEACHER else None
    if own_teacher:
        teacher_ids.add(own_teacher.id)
    teachers_qs = Teacher.objects.select_related('user').order_by('id')
    if role != ADMIN:
        teachers_qs = teachers_qs.filter(id__in=teacher_ids)
    teachers = list(teachers_qs)

    # Students never see other people's email addresses / usernames.
    def contact_visible_for(target_user_id):
        return role in (ADMIN, MANAGER, TEACHER) or target_user_id == user.id

    users, user_payload = [], {}

    def add_user(u, u_role):
        if u.id not in user_payload:
            user_payload[u.id] = serialize_user(u, u_role, include_contact=contact_visible_for(u.id))
            users.append(user_payload[u.id])
        return user_payload[u.id]

    add_user(user, role)
    managers = []
    if role == ADMIN:
        managers = list(Manager.objects.select_related('user').order_by('id'))
        manager_user_ids = {m.user_id for m in managers}
        teacher_user_ids = {t.user_id for t in teachers}
        student_user_ids = {s.user_id for s in students}
        for u in User.objects.order_by('id'):
            u_role = (
                ADMIN if u.is_superuser
                else MANAGER if u.id in manager_user_ids
                else TEACHER if u.id in teacher_user_ids
                else STUDENT
            )
            add_user(u, u_role)
    for t in teachers:
        add_user(t.user, TEACHER)
    for s in students:
        add_user(s.user, STUDENT)

    teacher_payload = {
        t.id: {
            'id': f't-{t.id}',
            'rawId': t.id,
            'userId': f'u-{t.user_id}',
            'userRawId': t.user_id,
            'user': user_payload[t.user_id],
        }
        for t in teachers
    }

    classroom_payload = []
    for c in classrooms:
        classroom_payload.append({
            'id': f'c-{c.id}',
            'rawId': c.id,
            'name': c.name,
            'branch': c.branch,
            'specialty': c.specialty,
            'sessionTime': c.session_time,
            'teacherId': f't-{c.teacher_id}',
            'teacher': teacher_payload.get(c.teacher_id),
            'sharedWithTeacherIds': [f't-{t.id}' for t in c.shared_with.all()],
            'studentIds': [f's-{s.id}' for s in c.students.all()],
        })

    student_payload = []
    for s in students:
        home = student_classroom.get(s.id)
        student_payload.append({
            'id': f's-{s.id}',
            'rawId': s.id,
            'userId': f'u-{s.user_id}',
            'userRawId': s.user_id,
            'points': float(s.points),
            'coins': s.coins,
            'age': s.age,
            'division': s.division,
            'classroomId': f'c-{home.id}' if home else None,
            'user': user_payload[s.user_id],
        })

    homeworks = [
        {
            'id': f'hw-{h.id}',
            'rawId': h.id,
            'classroomId': f'c-{h.classroom_id}',
            'title': h.title,
            'description': h.description,
            'dueDate': h.due_date.isoformat() if h.due_date else None,
            'createdById': f't-{h.created_by_id}',
            'teacherName': display_name(h.created_by.user),
            'createdAt': h.created_at.isoformat(),
        }
        for h in Homework.objects.filter(classroom_id__in=classroom_ids)
        .select_related('created_by__user')
        .order_by('-created_at')
    ]

    recent = list(
        ChatMessage.objects.filter(classroom_id__in=classroom_ids)
        .select_related('sender')
        .order_by('-created_at')[:MESSAGE_LIMIT]
    )
    recent.reverse()
    role_for = sender_roles(recent)
    messages = [serialize_message(m, role_for(m)) for m in recent]

    cutoff = timezone.localdate() - timedelta(days=ATTENDANCE_WINDOW_DAYS)
    attendance_qs = Attendance.objects.filter(classroom_id__in=classroom_ids, date__gte=cutoff)
    if role == STUDENT:
        attendance_qs = attendance_qs.filter(student__user=user)
    attendance = [serialize_attendance(a) for a in attendance_qs.order_by('-date', 'id')]

    products, orders = [], []
    if role in (ADMIN, STUDENT):
        products_qs = Product.objects.order_by('-is_available', 'id')
        if role == STUDENT:
            products_qs = products_qs.filter(is_available=True)
        products = [serialize_product(p) for p in products_qs]

        orders_qs = StoreOrder.objects.select_related('student__user', 'product').order_by('-created_at', '-id')
        if role == STUDENT:
            orders_qs = orders_qs.filter(student__user=user)
        orders_list = list(orders_qs)
        class_names = student_class_names({o.student_id for o in orders_list})
        orders = [serialize_order(o, class_names.get(o.student_id, 'Unassigned')) for o in orders_list]

    return JsonResponse({
        'success': True,
        'users': users,
        'teachers': list(teacher_payload.values()),
        'managers': [serialize_manager(m, user_payload[m.user_id]) for m in managers],
        'classrooms': classroom_payload,
        'students': student_payload,
        'homeworks': homeworks,
        'messages': messages,
        'attendance': attendance,
        'attendances': attendance,
        'products': products,
        'orders': orders,
    })


# ===========================================================================
# Points & coins
# ===========================================================================

def parse_amount(data):
    try:
        amount = Decimal(str(data.get('amount', 1)))
    except (InvalidOperation, ValueError):
        raise ApiError('Amount must be a number.')
    if not amount.is_finite():
        raise ApiError('Amount must be a number.')
    amount = amount.quantize(Decimal('0.1'))
    if amount <= 0:
        raise ApiError('Amount must be greater than 0.')
    if amount > MAX_POINTS_PER_ACTION:
        raise ApiError(f'Amount cannot exceed {MAX_POINTS_PER_ACTION} per action.')
    return amount


def coins_for(points):
    return int(points // POINTS_PER_COIN)


@api(methods=('POST',), roles=(ADMIN, MANAGER, TEACHER))
def api_add_points(request, student_id):
    amount = parse_amount(read_json(request))
    allowed = get_manageable_student(request, student_id)

    with transaction.atomic():
        student = Student.objects.select_for_update().get(pk=allowed.pk)
        coins_before = coins_for(student.points)
        student.points += amount
        earned = max(0, coins_for(student.points) - coins_before)
        student.coins += earned
        student.save(update_fields=['points', 'coins'])

    return JsonResponse({
        'success': True,
        'newPoints': float(student.points),
        'newCoins': student.coins,
        'coinsEarned': earned,
    })


@api(methods=('POST',), roles=(ADMIN, MANAGER, TEACHER))
def api_subtract_points(request, student_id):
    amount = parse_amount(read_json(request))
    allowed = get_manageable_student(request, student_id)

    with transaction.atomic():
        student = Student.objects.select_for_update().get(pk=allowed.pk)
        if amount > student.points:
            raise ApiError(f'Cannot subtract more than current points ({float(student.points)}).')
        coins_before = coins_for(student.points)
        student.points -= amount
        lost = max(0, coins_before - coins_for(student.points))
        student.coins = max(0, student.coins - lost)
        student.save(update_fields=['points', 'coins'])

    return JsonResponse({
        'success': True,
        'newPoints': float(student.points),
        'newCoins': student.coins,
        'coinsLost': lost,
    })


# ===========================================================================
# Students
# ===========================================================================

@api(methods=('POST', 'PUT', 'PATCH', 'DELETE'), roles=(ADMIN, MANAGER, TEACHER))
def api_students(request, student_id=None):
    if request.method == 'POST':
        if student_id is not None:
            raise ApiError('Method not allowed.', 405)
        return _create_student(request)
    if student_id is None:
        raise ApiError('Student id is required.')
    if request.method == 'DELETE':
        return _delete_student(request, student_id)
    return _update_student(request, student_id)


def _create_student(request):
    data = read_json(request)
    first_name, last_name = extract_names(data, required=True)
    email = clean_email(data.get('email'))
    age = clean_int(data.get('age'), 'Age', 1, 120, default=11)
    if not data.get('classroomId'):
        raise ApiError('Please choose a classroom for the student.')
    classroom = get_classroom(request, data.get('classroomId'))
    if email_in_use(email):
        raise ApiError('A user with that email already exists.')
    password = clean_password(
        data.get('password'),
        User(username=email, email=email, first_name=first_name, last_name=last_name),
    )

    with transaction.atomic():
        user = User.objects.create_user(
            username=email, email=email, password=password,
            first_name=first_name, last_name=last_name,
        )
        student = Student.objects.create(user=user, age=age, points=0, coins=0)
        classroom.students.add(student)

    return JsonResponse({'success': True, 'studentId': f's-{student.id}', 'userId': f'u-{user.id}'})


def _update_student(request, student_id):
    student = get_manageable_student(request, student_id)
    data = read_json(request)
    user = student.user

    with transaction.atomic():
        first_name, last_name = extract_names(data)
        if first_name is not None:
            user.first_name, user.last_name = first_name, last_name

        if data.get('email'):
            email = clean_email(data.get('email'))
            if email_in_use(email, exclude_user_id=user.id):
                raise ApiError('Email already in use by another user.')
            user.email = user.username = email

        if data.get('password'):
            user.set_password(clean_password(data.get('password'), user))
        user.save()

        if data.get('age') is not None:
            student.age = clean_int(data.get('age'), 'Age', 1, 120)

        # Direct point/coin edits are an administrator-only override.
        if request.role != ADMIN and (data.get('points') is not None or data.get('coins') is not None):
            raise ApiError('Only administrators can set points or coins directly.', 403)
        if data.get('points') is not None:
            try:
                points = Decimal(str(data['points'])).quantize(Decimal('0.1'))
            except (InvalidOperation, ValueError):
                raise ApiError('Points must be a number.')
            if not points.is_finite() or points < 0 or points > Decimal('999999'):
                raise ApiError('Points must be between 0 and 999999.')
            student.points = points
        if data.get('coins') is not None:
            student.coins = clean_int(data.get('coins'), 'Coins', 0, 1_000_000)
        student.save()

        if data.get('classroomId'):
            target = get_classroom(request, data.get('classroomId'))
            for current in accessible_classrooms(request.user, request.role).filter(students=student):
                current.students.remove(student)
            target.students.add(student)

    return JsonResponse({'success': True})


def _delete_student(request, student_id):
    student = get_manageable_student(request, student_id)
    student.user.delete()  # cascades to the Student, their attendance and store orders
    return JsonResponse({'success': True})


# ===========================================================================
# Teachers (administrators; branch managers for their own branch)
# ===========================================================================

def _check_manager_teacher_scope(request, teacher):
    """A manager may only edit / delete teachers who belong entirely to their branch.

    Deleting a teacher also deletes the classes they own, so a teacher who also
    owns classes in another branch has to be handled by an administrator."""
    if request.role != MANAGER:
        return
    branch = manager_branch(request.user)
    if not teachers_of_branch(branch).filter(id=teacher.id).exists():
        raise ApiError('Teacher not found.', 404)
    owned = Classroom.objects.filter(teacher=teacher)
    if not owned.filter(branch=branch).exists() or owned.exclude(branch=branch).exists():
        raise ApiError('This teacher also works outside your branch. Please ask an administrator.', 403)


@api(methods=('POST', 'PUT', 'PATCH', 'DELETE'), roles=(ADMIN, MANAGER))
def api_teachers(request, teacher_id=None):
    if request.method == 'POST':
        if teacher_id is not None:
            raise ApiError('Method not allowed.', 405)
        return _create_teacher(request)
    if teacher_id is None:
        raise ApiError('Teacher id is required.')

    teacher = Teacher.objects.select_related('user').filter(
        id=parse_id(teacher_id, 't-', field='teacher id')
    ).first()
    if teacher is None:
        raise ApiError('Teacher not found.', 404)
    _check_manager_teacher_scope(request, teacher)
    if request.method == 'DELETE':
        return _delete_teacher(request, teacher)
    return _update_teacher(teacher, read_json(request))


def _create_teacher(request):
    data = read_json(request)
    first_name = clean_text(data.get('firstName'), 'First name', 150, required=True)
    last_name = clean_text(data.get('lastName'), 'Last name', 150)
    email = clean_email(data.get('email'))
    classroom_name = clean_text(data.get('classroomName'), 'Classroom name', 100) or f"{first_name}'s Class"
    if email_in_use(email):
        raise ApiError('User with this email already exists.')
    password = clean_password(
        data.get('password'),
        User(username=email, email=email, first_name=first_name, last_name=last_name),
    )

    with transaction.atomic():
        user = User.objects.create_user(
            username=email, email=email, password=password,
            first_name=first_name, last_name=last_name,
        )
        teacher = Teacher.objects.create(user=user)
        # A teacher created by a manager starts with a class in that manager's branch,
        # which is also what makes the teacher visible inside the branch.
        branch = manager_branch(request.user) if request.role == MANAGER else ''
        classroom = Classroom.objects.create(name=classroom_name, teacher=teacher, branch=branch)

    return JsonResponse({'success': True, 'teacherId': f't-{teacher.id}', 'classroomId': f'c-{classroom.id}'})


def _update_teacher(teacher, data):
    user = teacher.user
    with transaction.atomic():
        if 'firstName' in data:
            user.first_name = clean_text(data.get('firstName'), 'First name', 150, required=True)
        if 'lastName' in data:
            user.last_name = clean_text(data.get('lastName'), 'Last name', 150)
        if data.get('email'):
            email = clean_email(data.get('email'))
            if email_in_use(email, exclude_user_id=user.id):
                raise ApiError('Email already in use by another user.')
            user.email = user.username = email
        if data.get('password'):
            user.set_password(clean_password(data.get('password'), user))
        user.save()

        classroom_name = clean_text(data.get('classroomName'), 'Classroom name', 100)
        if classroom_name:
            classroom = teacher.classroom_set.order_by('id').first()
            if classroom:
                classroom.name = classroom_name
                classroom.save(update_fields=['name'])
    return JsonResponse({'success': True})


def _delete_teacher(request, teacher):
    if teacher.user_id == request.user.id or teacher.user.is_superuser:
        raise ApiError('This account cannot be deleted here.', 403)
    # Their classrooms (and the homework / chat / attendance inside) go with them;
    # the students themselves are kept.
    teacher.user.delete()
    return JsonResponse({'success': True})


# ===========================================================================
# Branch managers (administrator only)
# ===========================================================================

def clean_branch(value):
    branch = clean_text(value, 'Branch', 20, required=True)
    if branch not in BRANCHES:
        raise ApiError('Please choose a valid branch.')
    return branch


@api(methods=('POST', 'PUT', 'PATCH', 'DELETE'), roles=(ADMIN,))
def api_managers(request, manager_id=None):
    if request.method == 'POST':
        if manager_id is not None:
            raise ApiError('Method not allowed.', 405)
        return _create_manager(request)
    if manager_id is None:
        raise ApiError('Manager id is required.')

    manager = Manager.objects.select_related('user').filter(
        id=parse_id(manager_id, 'mg-', field='manager id')
    ).first()
    if manager is None:
        raise ApiError('Manager not found.', 404)
    if request.method == 'DELETE':
        manager.user.delete()  # cascades to the Manager row; classes and students stay
        return JsonResponse({'success': True})
    return _update_manager(manager, read_json(request))


def _create_manager(request):
    data = read_json(request)
    first_name = clean_text(data.get('firstName'), 'First name', 150, required=True)
    last_name = clean_text(data.get('lastName'), 'Last name', 150)
    email = clean_email(data.get('email'))
    branch = clean_branch(data.get('branch'))
    if email_in_use(email):
        raise ApiError('User with this email already exists.')
    password = clean_password(
        data.get('password'),
        User(username=email, email=email, first_name=first_name, last_name=last_name),
    )

    with transaction.atomic():
        user = User.objects.create_user(
            username=email, email=email, password=password,
            first_name=first_name, last_name=last_name,
        )
        manager = Manager.objects.create(user=user, branch=branch)
    return JsonResponse({'success': True, 'managerId': f'mg-{manager.id}'})


def _update_manager(manager, data):
    user = manager.user
    with transaction.atomic():
        if 'firstName' in data:
            user.first_name = clean_text(data.get('firstName'), 'First name', 150, required=True)
        if 'lastName' in data:
            user.last_name = clean_text(data.get('lastName'), 'Last name', 150)
        if data.get('email'):
            email = clean_email(data.get('email'))
            if email_in_use(email, exclude_user_id=user.id):
                raise ApiError('Email already in use by another user.')
            user.email = user.username = email
        if data.get('password'):
            user.set_password(clean_password(data.get('password'), user))
        user.save()
        if 'branch' in data:
            manager.branch = clean_branch(data.get('branch'))
            manager.save(update_fields=['branch'])
    return JsonResponse({'success': True})


# ===========================================================================
# Classrooms
# ===========================================================================

@api(methods=('POST', 'PUT', 'PATCH', 'DELETE'), roles=(ADMIN, MANAGER, TEACHER))
def api_classrooms(request, classroom_id=None):
    if request.method == 'POST':
        if classroom_id is not None:
            raise ApiError('Method not allowed.', 405)
        return _create_classroom(request)
    if classroom_id is None:
        raise ApiError('Classroom id is required.')

    classroom = get_classroom(request, classroom_id, owner_only=True)
    if request.method == 'DELETE':
        classroom.delete()
        return JsonResponse({'success': True})
    return _update_classroom(request, classroom)


def _create_classroom(request):
    data = read_json(request)
    branch = manager_branch(request.user) if request.role == MANAGER \
        else clean_text(data.get('branch'), 'Branch', 20)
    specialty = clean_text(data.get('specialty'), 'Specialty', 50)
    session_time = clean_text(data.get('sessionTime'), 'Session time', 50)
    name = clean_text(data.get('name'), 'Class name', 100) or ' - '.join(filter(None, [branch, specialty])) \
        or 'New Classroom'

    if request.role in (ADMIN, MANAGER):
        if not data.get('teacherId'):
            raise ApiError('Please choose a teacher for this classroom.')
        teachers = Teacher.objects.all()
        if request.role == MANAGER:
            # Managers only create classes in their own branch, for teachers of that branch.
            branch = manager_branch(request.user)
            teachers = teachers_of_branch(branch)
        teacher = teachers.filter(id=parse_id(data.get('teacherId'), 't-', field='teacher id')).first()
        if teacher is None:
            raise ApiError('Teacher not found.', 404)
    else:
        teacher = teacher_of(request.user)

    classroom = Classroom.objects.create(
        name=name, branch=branch, specialty=specialty, session_time=session_time, teacher=teacher,
    )
    return JsonResponse({'success': True, 'classroomId': f'c-{classroom.id}'})


def _update_classroom(request, classroom):
    data = read_json(request)
    if 'name' in data:
        classroom.name = clean_text(data.get('name'), 'Class name', 100, required=True)
    if 'branch' in data:
        new_branch = clean_text(data.get('branch'), 'Branch', 20)
        if request.role == MANAGER and new_branch != classroom.branch:
            raise ApiError('Managers cannot move a class to another branch.', 403)
        classroom.branch = new_branch
    if 'specialty' in data:
        classroom.specialty = clean_text(data.get('specialty'), 'Specialty', 50)
    if 'sessionTime' in data:
        classroom.session_time = clean_text(data.get('sessionTime'), 'Session time', 50)
    if data.get('teacherId'):
        if request.role not in (ADMIN, MANAGER):
            raise ApiError('Only administrators and branch managers can reassign a classroom.', 403)
        teachers = teachers_of_branch(classroom.branch) if request.role == MANAGER else Teacher.objects.all()
        teacher = teachers.filter(id=parse_id(data.get('teacherId'), 't-', field='teacher id')).first()
        if teacher is None:
            raise ApiError('Teacher not found.', 404)
        classroom.teacher = teacher
    classroom.save()
    return JsonResponse({'success': True})


@api(methods=('POST',), roles=(ADMIN, TEACHER))
def api_classroom_share(request, classroom_id):
    classroom = get_classroom(request, classroom_id, owner_only=True)
    data = read_json(request)

    if data.get('teacherEmail'):
        email = clean_text(data.get('teacherEmail'), 'Teacher email', 150).lower()
        teacher = Teacher.objects.select_related('user').filter(user__email__iexact=email).first()
        if teacher is None:
            raise ApiError('No teacher account exists with that email.', 404)
    elif data.get('teacherId'):
        teacher = Teacher.objects.select_related('user').filter(
            id=parse_id(data.get('teacherId'), 't-', field='teacher id')
        ).first()
        if teacher is None:
            raise ApiError('Teacher not found.', 404)
    else:
        raise ApiError('Teacher email is required.')

    if teacher.id == classroom.teacher_id:
        raise ApiError('The owner already has access.')
    if classroom.shared_with.filter(id=teacher.id).exists():
        raise ApiError('This teacher already has access.')

    classroom.shared_with.add(teacher)
    return JsonResponse({
        'success': True,
        'teacherId': f't-{teacher.id}',
        'teacherName': display_name(teacher.user),
    })


@api(methods=('POST',), roles=(ADMIN, TEACHER))
def api_classroom_unshare(request, classroom_id):
    classroom = get_classroom(request, classroom_id, owner_only=True)
    data = read_json(request)
    teacher = Teacher.objects.filter(id=parse_id(data.get('teacherId'), 't-', field='teacher id')).first()
    if teacher is None:
        raise ApiError('Teacher not found.', 404)
    classroom.shared_with.remove(teacher)
    return JsonResponse({'success': True})


# ===========================================================================
# Homework
# ===========================================================================

@api(methods=('POST', 'DELETE'), roles=(ADMIN, MANAGER, TEACHER))
def api_homework(request, homework_id=None):
    if request.method == 'POST':
        if homework_id is not None:
            raise ApiError('Method not allowed.', 405)
        data = read_json(request)
        classroom = get_classroom(request, data.get('classroomId'))
        title = clean_text(data.get('title'), 'Title', 160, required=True)
        description = clean_text(data.get('description'), 'Description', 5000)
        due_date = clean_date(data.get('dueDate'), 'Due date', required=False)
        creator = teacher_of(request.user) or classroom.teacher

        homework = Homework.objects.create(
            classroom=classroom, created_by=creator, title=title,
            description=description, due_date=due_date,
        )
        return JsonResponse({'success': True, 'homeworkId': f'hw-{homework.id}'})

    if homework_id is None:
        raise ApiError('Homework id is required.')
    homework = Homework.objects.filter(
        id=parse_id(homework_id, 'hw-', field='homework id'),
        classroom__in=accessible_classrooms(request.user, request.role),
    ).first()
    if homework is None:
        raise ApiError('Homework not found.', 404)
    homework.delete()
    return JsonResponse({'success': True})


# ===========================================================================
# Chat
# ===========================================================================

@api(methods=('DELETE',))
def api_message_detail(request, message_id):
    """Senders delete their own messages; admins and the teachers of a class can delete any in it."""
    message = ChatMessage.objects.filter(
        id=parse_id(message_id, 'm-', field='message id'),
        classroom__in=accessible_classrooms(request.user, request.role),
    ).first()
    if message is None:
        raise ApiError('Message not found.', 404)
    if request.role == STUDENT and message.sender_id != request.user.id:
        raise ApiError('You can only delete your own messages.', 403)
    message_pk = message.id
    message.delete()
    return JsonResponse({'success': True, 'messageId': f'm-{message_pk}'})


@api(methods=('GET', 'POST'))
def api_messages(request):
    if request.method == 'GET':
        qs = ChatMessage.objects.select_related('sender')
        raw_class = request.GET.get('classroomId') or request.GET.get('classroom_id')
        if raw_class:
            qs = qs.filter(classroom=get_classroom(request, raw_class))
        else:
            qs = qs.filter(classroom__in=accessible_classrooms(request.user, request.role))
        recent = list(qs.order_by('-created_at')[:MESSAGE_LIMIT])
        recent.reverse()
        role_for = sender_roles(recent)
        return JsonResponse({'success': True, 'messages': [serialize_message(m, role_for(m)) for m in recent]})

    data = read_json(request)
    classroom = get_classroom(request, data.get('classroomId') or data.get('classroom_id'))
    body = clean_text(data.get('body') or data.get('text') or data.get('content'), 'Message', 2000, required=True)

    # The sender is always the signed-in user - never a value supplied by the client.
    message = ChatMessage.objects.create(classroom=classroom, sender=request.user, body=body)
    return JsonResponse({'success': True, 'message': serialize_message(message, request.role)})


# ===========================================================================
# Attendance
# ===========================================================================

def _enrolled_student_ids(classroom):
    return set(classroom.students.values_list('id', flat=True))


def _attendance_defaults(request, status, note):
    return {
        'status': status,
        'note': clean_text(note, 'Note', 500),
        'marked_by': display_name(request.user)[:150],
    }


def _clean_status(value, default='present'):
    status = str(value if value is not None else default).strip().lower()
    if status not in ATTENDANCE_STATUSES and status not in ATTENDANCE_CLEAR_VALUES:
        raise ApiError('Invalid attendance status.')
    return status


@api(methods=('GET', 'POST', 'DELETE'))
def api_attendance(request):
    if request.method == 'GET':
        qs = Attendance.objects.filter(classroom__in=accessible_classrooms(request.user, request.role))
        if request.role == STUDENT:
            qs = qs.filter(student__user=request.user)
        raw_class = request.GET.get('classroomId') or request.GET.get('classroom_id')
        raw_student = request.GET.get('studentId') or request.GET.get('student_id')
        raw_date = (request.GET.get('date') or '').strip()
        if raw_class:
            qs = qs.filter(classroom_id=parse_id(raw_class, 'c-', field='classroom id'))
        if raw_student:
            qs = qs.filter(student_id=parse_id(raw_student, 's-', field='student id'))
        if raw_date:
            qs = qs.filter(date=clean_date(raw_date))
        records = [serialize_attendance(a) for a in qs.order_by('-date', 'id')]
        return JsonResponse({'success': True, 'attendance': records, 'attendances': records})

    if request.role == STUDENT:
        raise ApiError('You do not have permission to do that.', 403)

    if request.method == 'POST':
        data = read_json(request)
        classroom = get_classroom(request, data.get('classroomId') or data.get('classroom_id'))
        student_id = parse_id(data.get('studentId') or data.get('student_id'), 's-', field='student id')
        day = clean_date(data.get('date'))
        status = _clean_status(data.get('status'))
        if student_id not in _enrolled_student_ids(classroom):
            raise ApiError('That student is not in this classroom.')

        if status in ATTENDANCE_CLEAR_VALUES:
            Attendance.objects.filter(classroom=classroom, student_id=student_id, date=day).delete()
            return JsonResponse({'success': True, 'action': 'deleted'})

        record, _ = Attendance.objects.update_or_create(
            classroom=classroom, student_id=student_id, date=day,
            defaults=_attendance_defaults(request, status, data.get('note')),
        )
        return JsonResponse({
            'success': True,
            'attendanceId': f'att-{record.id}',
            'attendance': serialize_attendance(record),
        })

    # DELETE (query-string based)
    classroom = get_classroom(request, request.GET.get('classroomId') or request.GET.get('classroom_id'))
    student_id = parse_id(request.GET.get('studentId') or request.GET.get('student_id'), 's-', field='student id')
    day = clean_date(request.GET.get('date'))
    Attendance.objects.filter(classroom=classroom, student_id=student_id, date=day).delete()
    return JsonResponse({'success': True, 'action': 'deleted'})


@api(methods=('POST',), roles=(ADMIN, MANAGER, TEACHER))
def api_attendance_bulk(request):
    data = read_json(request)
    classroom = get_classroom(request, data.get('classroomId') or data.get('classroom_id'))
    day = clean_date(data.get('date'))
    default_status = _clean_status(data.get('status'))
    enrolled = _enrolled_student_ids(classroom)

    records = data.get('records')
    if isinstance(records, list):
        items = [r for r in records if isinstance(r, dict)]
        entries = [
            (r.get('studentId') or r.get('id'), _clean_status(r.get('status'), default_status), r.get('note'))
            for r in items
        ]
    elif isinstance(data.get('studentIds') or data.get('students'), list):
        entries = [(sid, default_status, '') for sid in (data.get('studentIds') or data.get('students'))]
    else:
        raise ApiError('Provide a list of students to mark.')

    updated = skipped = 0
    with transaction.atomic():
        for raw_student, status, note in entries:
            try:
                student_id = parse_id(raw_student, 's-', field='student id')
            except ApiError:
                skipped += 1
                continue
            if student_id not in enrolled:
                skipped += 1
                continue
            if status in ATTENDANCE_CLEAR_VALUES:
                Attendance.objects.filter(classroom=classroom, student_id=student_id, date=day).delete()
            else:
                Attendance.objects.update_or_create(
                    classroom=classroom, student_id=student_id, date=day,
                    defaults=_attendance_defaults(request, status, note),
                )
            updated += 1

    return JsonResponse({'success': True, 'count': updated, 'skipped': skipped})


@api(methods=('POST', 'DELETE'), roles=(ADMIN, MANAGER, TEACHER))
def api_attendance_day(request):
    data = read_json(request) if request.method == 'POST' else {}
    classroom = get_classroom(request, request.GET.get('classroomId') or data.get('classroomId'))
    day = clean_date(request.GET.get('date') or data.get('date'))
    deleted, _ = Attendance.objects.filter(classroom=classroom, date=day).delete()
    return JsonResponse({'success': True, 'deleted': deleted})


# ===========================================================================
# Rewards store
# ===========================================================================

def _clean_image_url(value):
    url = clean_text(value, 'Image URL', 2000)
    if url and not (url.startswith('/uploads/products/') or url.startswith(('https://', 'http://'))):
        raise ApiError('Image URL must be an uploaded image or an http(s) link.')
    return url


@api(methods=('POST',), roles=(ADMIN,))
def api_store_upload(request):
    upload = request.FILES.get('image')
    if upload is None:
        raise ApiError('No file uploaded.')
    ext = os.path.splitext(upload.name)[1].lower()
    if ext not in IMAGE_SIGNATURES:
        raise ApiError('Invalid image format. Use JPG, PNG, WEBP or GIF.')
    if upload.size > MAX_IMAGE_BYTES:
        raise ApiError('Image is too large (max 5 MB).')

    header = upload.read(12)
    upload.seek(0)
    valid = header.startswith(IMAGE_SIGNATURES[ext]) and (ext != '.webp' or header[8:12] == b'WEBP')
    if not valid:
        raise ApiError('The file content does not match an image format.')

    filename = f'{uuid.uuid4().hex}{ext}'
    ProductImage.objects.create(name=filename, content_type=IMAGE_CONTENT_TYPES[ext], data=upload.read())
    return JsonResponse({'success': True, 'url': f'{settings.MEDIA_URL}products/{filename}'})


def _discard_image(url):
    """Delete an uploaded image once no reward uses it any more."""
    prefix = f'{settings.MEDIA_URL}products/'
    if url and url.startswith(prefix) and not Product.objects.filter(image_url=url).exists():
        ProductImage.objects.filter(name=url[len(prefix):]).delete()


@api(methods=('GET', 'POST', 'PUT', 'PATCH', 'DELETE'))
def api_store_products(request, product_id=None):
    if request.method == 'GET':
        qs = Product.objects.order_by('-is_available', 'id')
        if request.role != ADMIN or request.GET.get('availableOnly') == 'true':
            qs = qs.filter(is_available=True)
        return JsonResponse({'success': True, 'products': [serialize_product(p) for p in qs]})

    if request.role != ADMIN:
        raise ApiError('Only administrators can manage store products.', 403)

    if request.method == 'POST':
        if product_id is not None:
            raise ApiError('Method not allowed.', 405)
        data = read_json(request)
        product = Product.objects.create(
            name=clean_text(data.get('name'), 'Product name', 200, required=True),
            description=clean_text(data.get('description'), 'Description', 2000),
            price_coins=clean_int(data.get('priceCoins', data.get('price')), 'Price', 1, 100000, default=1),
            stock=clean_int(data.get('stock'), 'Stock', 0, 100000, default=0),
            category=clean_text(data.get('category'), 'Category', 100) or 'General',
            image_url=_clean_image_url(data.get('imageUrl')),
            icon=clean_text(data.get('icon'), 'Icon', 50) or 'Gift',
            is_available=bool(data.get('isAvailable', True)),
        )
        return JsonResponse({'success': True, 'product': serialize_product(product)})

    if product_id is None:
        raise ApiError('Product id is required.')
    product = Product.objects.filter(id=parse_id(product_id, 'p-', field='product id')).first()
    if product is None:
        raise ApiError('Product not found.', 404)

    if request.method == 'DELETE':
        if StoreOrder.objects.filter(product=product).exists():
            # Keep the history of past orders; just hide the reward from the store.
            product.is_available = False
            product.save(update_fields=['is_available', 'updated_at'])
            return JsonResponse({
                'success': True,
                'action': 'deactivated',
                'message': 'This reward has past orders, so it was hidden instead of deleted.',
            })
        old_url = product.image_url
        product.delete()
        _discard_image(old_url)
        return JsonResponse({'success': True, 'action': 'deleted', 'message': 'Product removed from store.'})

    data = read_json(request)
    if 'name' in data:
        product.name = clean_text(data.get('name'), 'Product name', 200, required=True)
    if 'description' in data:
        product.description = clean_text(data.get('description'), 'Description', 2000)
    if 'priceCoins' in data or 'price' in data:
        product.price_coins = clean_int(data.get('priceCoins', data.get('price')), 'Price', 1, 100000)
    if 'stock' in data:
        product.stock = clean_int(data.get('stock'), 'Stock', 0, 100000)
    if 'category' in data:
        product.category = clean_text(data.get('category'), 'Category', 100) or 'General'
    old_url = product.image_url
    if 'imageUrl' in data:
        product.image_url = _clean_image_url(data.get('imageUrl'))
    if 'icon' in data:
        product.icon = clean_text(data.get('icon'), 'Icon', 50) or 'Gift'
    if 'isAvailable' in data:
        product.is_available = bool(data.get('isAvailable'))
    product.save()
    if old_url != product.image_url:
        _discard_image(old_url)
    return JsonResponse({'success': True, 'product': serialize_product(product)})


@api(methods=('POST',), roles=(STUDENT,))
def api_store_purchase(request):
    data = read_json(request)
    product_id = parse_id(data.get('productId'), 'p-', field='product id')

    with transaction.atomic():
        # Students can only ever spend their OWN coins, whatever the client sends.
        student = Student.objects.select_for_update().get(user=request.user)
        if data.get('studentId') and parse_id(data.get('studentId'), 's-', field='student id') != student.id:
            raise ApiError('You can only redeem rewards for yourself.', 403)

        product = Product.objects.select_for_update().filter(id=product_id).first()
        if product is None:
            raise ApiError('Product not found.', 404)
        if not product.is_available:
            raise ApiError('This reward is currently unavailable.')
        if product.stock <= 0:
            raise ApiError('This reward is out of stock.')
        if student.coins < product.price_coins:
            raise ApiError("You don't have enough coins for this reward.")

        student.coins -= product.price_coins
        student.save(update_fields=['coins'])
        product.stock -= 1
        product.save(update_fields=['stock', 'updated_at'])
        order = StoreOrder.objects.create(
            student=student, product=product, product_name=product.name,
            cost_coins=product.price_coins, status='pending',
        )

    return JsonResponse({
        'success': True,
        'orderId': f'ord-{order.id}',
        'rawOrderId': order.id,
        'newCoins': student.coins,
        'costCoins': order.cost_coins,
        'remainingStock': product.stock,
        'message': f'Successfully requested "{product.name}"! Status is now Pending.',
    })


def _refund_order(order):
    """Give the coins back and restock the reward. Caller holds the order lock."""
    student = Student.objects.select_for_update().get(pk=order.student_id)
    student.coins += order.cost_coins
    student.save(update_fields=['coins'])
    if order.product_id:
        Product.objects.filter(id=order.product_id).update(stock=F('stock') + 1)
    order.refunded = True


@api(methods=('GET', 'DELETE'), roles=(ADMIN, STUDENT))
def api_store_orders(request, order_id=None):
    if request.method == 'GET':
        qs = StoreOrder.objects.select_related('student__user', 'product').order_by('-created_at', '-id')
        if request.role == STUDENT:
            qs = qs.filter(student__user=request.user)
        elif request.GET.get('studentId'):
            qs = qs.filter(student_id=parse_id(request.GET.get('studentId'), 's-', field='student id'))
        orders = list(qs)
        class_names = student_class_names({o.student_id for o in orders})
        return JsonResponse({
            'success': True,
            'orders': [serialize_order(o, class_names.get(o.student_id, 'Unassigned')) for o in orders],
        })

    if order_id is None:
        raise ApiError('Order id is required.')

    with transaction.atomic():
        order = StoreOrder.objects.select_for_update().filter(
            id=parse_id(order_id, 'ord-', field='order id')
        ).first()
        if order is None or (request.role == STUDENT and order.student.user_id != request.user.id):
            raise ApiError('Order not found.', 404)
        order_pk = order.id

        if request.role == STUDENT:
            if order.status != 'pending':
                raise ApiError('Only pending requests can be cancelled.', 403)
            wants_refund = True
        else:
            wants_refund = (request.GET.get('refund') or '').strip().lower() in ('true', '1', 't', 'yes')

        # Coins only come back for requests that were never delivered, and only once.
        refunded_now = False
        if wants_refund and not order.refunded and order.status in ('pending', 'approved'):
            _refund_order(order)
            refunded_now = True
        order.delete()

    if request.role == STUDENT:
        message = 'Request cancelled and coins refunded.'
    else:
        message = 'Request removed and coins refunded.' if refunded_now else 'Request removed.'
    return JsonResponse({
        'success': True,
        'orderId': f'ord-{order_pk}',
        'refunded': refunded_now,
        'message': message,
    })


@api(methods=('PUT', 'POST'), roles=(ADMIN,))
def api_store_order_status(request, order_id):
    data = read_json(request)
    new_status = data.get('status')
    if new_status not in ORDER_STATUSES:
        raise ApiError('Invalid status.')

    with transaction.atomic():
        order = StoreOrder.objects.select_for_update().filter(
            id=parse_id(order_id, 'ord-', field='order id')
        ).first()
        if order is None:
            raise ApiError('Order not found.', 404)

        removing = data.get('remove') is True
        if order.refunded and not removing:
            raise ApiError('This request was already rejected and refunded, so it can no longer be changed.')
        if new_status == 'rejected' and order.status in ('completed', 'delivered'):
            raise ApiError('A request that was already delivered cannot be rejected.')

        refunded_now = False
        if new_status == 'rejected' and not order.refunded:
            _refund_order(order)
            refunded_now = True

        cost = order.cost_coins
        order_pk = order.id
        if removing:
            order.delete()
            message = (
                f'Request rejected and removed. {cost} coins refunded to student.'
                if refunded_now else 'Request removed.'
            )
            return JsonResponse({
                'success': True, 'orderId': f'ord-{order_pk}', 'status': new_status,
                'removed': True, 'refunded': refunded_now,
                'refundAmount': cost if refunded_now else 0, 'message': message,
            })

        order.status = new_status
        if 'rejectionReason' in data:
            order.rejection_reason = clean_text(data.get('rejectionReason'), 'Rejection reason', 1000)
        if 'notes' in data:
            order.notes = clean_text(data.get('notes'), 'Notes', 2000)
        if new_status in ('completed', 'delivered'):
            order.completed_at = timezone.now()
        order.save()

    messages = {
        'approved': 'Request approved! Student can now collect their reward.',
        'delivered': 'Reward marked as delivered to student.',
        'rejected': f'Request rejected. {cost} coins were refunded back to student and stock restored.',
    }
    return JsonResponse({
        'success': True, 'orderId': f'ord-{order_pk}', 'status': new_status,
        'removed': False, 'refunded': order.refunded,
        'refundAmount': cost if refunded_now else 0,
        'message': messages.get(new_status, f'Request marked as {new_status}.'),
    })
