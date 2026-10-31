import json
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import Client, TestCase, override_settings

from .models import Attendance, ChatMessage, Classroom, Product, Student, StoreOrder, Teacher

PASSWORD = 'Str0ng-Test-Pass!'


def make_user(email, first='Test', last='User', **extra):
    return User.objects.create_user(
        username=email, email=email, password=PASSWORD, first_name=first, last_name=last, **extra
    )


class ApiTestCase(TestCase):
    """Builds a small school: 1 admin, 2 teachers, 3 students, 2 classrooms."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = make_user('admin@t.com', 'Ada', 'Admin', is_superuser=True, is_staff=True)

        cls.teacher_a = Teacher.objects.create(user=make_user('ta@t.com', 'Tara', 'A'))
        cls.teacher_b = Teacher.objects.create(user=make_user('tb@t.com', 'Tom', 'B'))
        cls.class_a = Classroom.objects.create(name='Class A', teacher=cls.teacher_a)
        cls.class_b = Classroom.objects.create(name='Class B', teacher=cls.teacher_b)

        def student(email, first, classroom, points='0', coins=0):
            s = Student.objects.create(user=make_user(email, first), points=Decimal(points), coins=coins)
            classroom.students.add(s)
            return s

        cls.s1 = student('s1@t.com', 'Sam', cls.class_a, points='25', coins=2)
        cls.s2 = student('s2@t.com', 'Sue', cls.class_a)
        cls.s3 = student('s3@t.com', 'Sid', cls.class_b)

        cls.product = Product.objects.create(name='Pen', price_coins=2, stock=3)

    def setUp(self):
        cache.clear()

    # -- helpers ------------------------------------------------------------
    def client_for(self, user, enforce_csrf=False):
        client = Client(enforce_csrf_checks=enforce_csrf)
        client.force_login(user)
        return client

    def post(self, client, url, data=None, **kw):
        return client.post(url, json.dumps(data or {}), content_type='application/json', **kw)

    def put(self, client, url, data=None):
        return client.put(url, json.dumps(data or {}), content_type='application/json')


class AuthTests(ApiTestCase):
    def test_unauthenticated_requests_get_401(self):
        for url in ('/api/app-data', '/api/messages'):
            self.assertEqual(Client().get(url).status_code, 401)
        self.assertEqual(self.post(Client(), '/api/students/s-1/points/add').status_code, 401)

    def test_signin_requires_csrf_token(self):
        client = Client(enforce_csrf_checks=True)
        res = self.post(client, '/api/auth/signin', {'email': 'ta@t.com', 'password': PASSWORD})
        self.assertEqual(res.status_code, 403)

    def test_signin_flow_with_csrf(self):
        client = Client(enforce_csrf_checks=True)
        client.get('/api/auth/user')  # sets the csrftoken cookie
        token = client.cookies['csrftoken'].value
        res = self.post(client, '/api/auth/signin', {'email': 'TA@t.com', 'password': PASSWORD},
                        HTTP_X_CSRFTOKEN=token)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['user']['role'], 'teacher')

    def test_wrong_password_and_unknown_user_look_identical(self):
        a = self.post(Client(), '/api/auth/signin', {'email': 'ta@t.com', 'password': 'nope'})
        b = self.post(Client(), '/api/auth/signin', {'email': 'ghost@t.com', 'password': 'nope'})
        self.assertEqual((a.status_code, a.json()['error']), (b.status_code, b.json()['error']))

    def test_password_is_never_defaulted(self):
        res = self.post(Client(), '/api/auth/signin', {'email': 'ta@t.com', 'password': ''})
        self.assertEqual(res.status_code, 400)

    def test_login_lockout_after_repeated_failures(self):
        for _ in range(10):
            self.post(Client(), '/api/auth/signin', {'email': 'ta@t.com', 'password': 'wrong'})
        res = self.post(Client(), '/api/auth/signin', {'email': 'ta@t.com', 'password': PASSWORD})
        self.assertEqual(res.status_code, 429)

    def test_public_signup_disabled_by_default(self):
        res = self.post(Client(), '/api/auth/signup', {
            'firstName': 'Eve', 'email': 'eve@t.com', 'password': PASSWORD})
        self.assertEqual(res.status_code, 403)
        self.assertFalse(User.objects.filter(email='eve@t.com').exists())

    @override_settings(ALLOW_PUBLIC_SIGNUP=True)
    def test_public_signup_when_enabled_validates_password(self):
        weak = self.post(Client(), '/api/auth/signup', {
            'firstName': 'Eve', 'email': 'eve@t.com', 'password': 'password123'})
        self.assertEqual(weak.status_code, 400)
        ok = self.post(Client(), '/api/auth/signup', {
            'firstName': 'Eve', 'email': 'eve@t.com', 'password': PASSWORD})
        self.assertEqual(ok.status_code, 200)

    def test_signout_requires_csrf_and_post(self):
        client = self.client_for(self.admin, enforce_csrf=True)
        self.assertEqual(client.get('/api/auth/signout').status_code, 405)
        self.assertEqual(self.post(client, '/api/auth/signout').status_code, 403)


class CsrfTests(ApiTestCase):
    def test_state_changing_endpoints_enforce_csrf(self):
        client = self.client_for(self.teacher_a.user, enforce_csrf=True)
        res = self.post(client, f'/api/students/s-{self.s1.id}/points/add', {'amount': 5})
        self.assertEqual(res.status_code, 403)
        self.s1.refresh_from_db()
        self.assertEqual(self.s1.points, Decimal('25'))


class ScopingTests(ApiTestCase):
    def ids(self, payload, key):
        return {item['id'] for item in payload[key]}

    def test_student_only_sees_own_class_and_no_foreign_contact_info(self):
        data = self.client_for(self.s1.user).get('/api/app-data').json()
        self.assertEqual(self.ids(data, 'students'), {f's-{self.s1.id}', f's-{self.s2.id}'})
        self.assertEqual(self.ids(data, 'classrooms'), {f'c-{self.class_a.id}'})
        classmate = next(s for s in data['students'] if s['id'] == f's-{self.s2.id}')
        self.assertNotIn('email', classmate['user'])
        self.assertNotIn('username', classmate['user'])
        own = next(s for s in data['students'] if s['id'] == f's-{self.s1.id}')
        self.assertEqual(own['user']['email'], 's1@t.com')

    def test_teacher_only_sees_own_and_shared_classes(self):
        data = self.client_for(self.teacher_a.user).get('/api/app-data').json()
        self.assertEqual(self.ids(data, 'classrooms'), {f'c-{self.class_a.id}'})
        self.class_b.shared_with.add(self.teacher_a)
        data = self.client_for(self.teacher_a.user).get('/api/app-data').json()
        self.assertEqual(self.ids(data, 'classrooms'), {f'c-{self.class_a.id}', f'c-{self.class_b.id}'})
        self.assertEqual(data['products'], [])

    def test_admin_sees_everything(self):
        data = self.client_for(self.admin).get('/api/app-data').json()
        self.assertEqual(len(data['students']), 3)
        self.assertEqual(len(data['teachers']), 2)


class PermissionTests(ApiTestCase):
    def test_student_cannot_award_points_or_edit_accounts(self):
        client = self.client_for(self.s1.user)
        self.assertEqual(self.post(client, f'/api/students/s-{self.s1.id}/points/add', {'amount': 50}).status_code, 403)
        self.assertEqual(self.put(client, f'/api/students/s-{self.s2.id}', {'password': PASSWORD}).status_code, 403)
        self.assertEqual(self.put(client, f'/api/teachers/t-{self.teacher_a.id}', {'password': PASSWORD}).status_code, 403)
        self.assertEqual(client.post('/api/teachers', '{}', content_type='application/json').status_code, 403)

    def test_teacher_cannot_touch_other_teachers_students(self):
        client = self.client_for(self.teacher_a.user)
        res = self.post(client, f'/api/students/s-{self.s3.id}/points/add', {'amount': 5})
        self.assertEqual(res.status_code, 404)
        res = self.put(client, f'/api/students/s-{self.s3.id}', {'password': PASSWORD})
        self.assertEqual(res.status_code, 404)
        self.assertEqual(client.delete(f'/api/students/s-{self.s3.id}').status_code, 404)

    def test_teacher_cannot_manage_teachers_or_set_points_directly(self):
        client = self.client_for(self.teacher_a.user)
        self.assertEqual(self.put(client, f'/api/teachers/t-{self.teacher_b.id}', {'firstName': 'X'}).status_code, 403)
        res = self.put(client, f'/api/students/s-{self.s1.id}', {'points': 9999})
        self.assertEqual(res.status_code, 403)

    def test_teacher_cannot_create_student_in_foreign_class(self):
        client = self.client_for(self.teacher_a.user)
        res = self.post(client, '/api/students', {
            'name': 'New Kid', 'email': 'kid@t.com', 'password': PASSWORD,
            'classroomId': f'c-{self.class_b.id}'})
        self.assertEqual(res.status_code, 404)

    def test_only_owner_or_admin_can_share_a_class(self):
        self.class_a.shared_with.add(self.teacher_b)
        res = self.post(self.client_for(self.teacher_b.user), f'/api/classrooms/c-{self.class_a.id}/share',
                        {'teacherEmail': 'ta@t.com'})
        self.assertEqual(res.status_code, 403)

    def test_share_by_email_matches_frontend_contract(self):
        client = self.client_for(self.teacher_a.user)
        res = self.post(client, f'/api/classrooms/c-{self.class_a.id}/share', {'teacherEmail': 'TB@t.com'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['teacherName'], 'Tom B')
        self.assertTrue(self.class_a.shared_with.filter(id=self.teacher_b.id).exists())
        res = self.post(client, f'/api/classrooms/c-{self.class_a.id}/unshare', {'teacherId': f't-{self.teacher_b.id}'})
        self.assertEqual(res.status_code, 200)
        self.assertFalse(self.class_a.shared_with.filter(id=self.teacher_b.id).exists())

    def test_malformed_ids_return_400_not_500(self):
        client = self.client_for(self.admin)
        self.assertEqual(self.post(client, '/api/students/abc/points/add', {'amount': 1}).status_code, 400)
        self.assertEqual(client.delete('/api/store/orders/xyz').status_code, 400)

    def test_malformed_json_returns_400(self):
        client = self.client_for(self.admin)
        res = client.post('/api/teachers', '{not json', content_type='application/json')
        self.assertEqual(res.status_code, 400)


class PointsTests(ApiTestCase):
    def test_add_points_awards_coins_on_threshold(self):
        res = self.post(self.client_for(self.teacher_a.user), f'/api/students/s-{self.s1.id}/points/add', {'amount': 5.5})
        body = res.json()
        self.assertEqual((body['newPoints'], body['newCoins'], body['coinsEarned']), (30.5, 3, 1))

    def test_subtract_points_removes_coins_and_never_goes_negative(self):
        client = self.client_for(self.teacher_a.user)
        res = self.post(client, f'/api/students/s-{self.s1.id}/points/subtract', {'amount': 6})
        self.assertEqual((res.json()['newPoints'], res.json()['newCoins']), (19.0, 1))
        res = self.post(client, f'/api/students/s-{self.s1.id}/points/subtract', {'amount': 500})
        self.assertEqual(res.status_code, 400)

    def test_invalid_amounts_rejected(self):
        client = self.client_for(self.teacher_a.user)
        for bad in (0, -3, 'abc', None, 'NaN', 10 ** 9):
            res = self.post(client, f'/api/students/s-{self.s1.id}/points/add', {'amount': bad})
            self.assertEqual(res.status_code, 400, bad)


class StudentManagementTests(ApiTestCase):
    def test_password_may_equal_the_email(self):
        client = self.client_for(self.admin)
        res = self.post(client, '/api/students', {
            'name': 'Same Pw', 'email': 'same.pw@t.com', 'password': 'same.pw@t.com', 'classroomId': f'c-{self.class_a.id}'})
        self.assertEqual(res.status_code, 200)
        login = self.post(Client(), '/api/auth/signin', {'email': 'same.pw@t.com', 'password': 'same.pw@t.com'})
        self.assertEqual(login.status_code, 200)
        user = User.objects.get(email='same.pw@t.com')
        self.assertTrue(user.password.startswith('scrypt$'))

    def test_old_pbkdf2_passwords_still_sign_in(self):
        from django.contrib.auth.hashers import make_password
        u = make_user('old@t.com')
        Student.objects.create(user=u)
        u.password = make_password(PASSWORD, hasher='pbkdf2_sha256'); u.save()
        res = self.post(Client(), '/api/auth/signin', {'email': 'old@t.com', 'password': PASSWORD})
        self.assertEqual(res.status_code, 200)
        u.refresh_from_db(); self.assertTrue(u.password.startswith('scrypt$'))

    def test_create_student_validates_password_and_email(self):
        client = self.client_for(self.teacher_a.user)
        base = {'name': 'New Kid', 'email': 'kid@t.com', 'classroomId': f'c-{self.class_a.id}'}
        self.assertEqual(self.post(client, '/api/students', {**base, 'password': 'password123'}).status_code, 400)
        self.assertEqual(self.post(client, '/api/students', {**base, 'password': ''}).status_code, 400)
        self.assertEqual(self.post(client, '/api/students', {**base, 'email': 'nope', 'password': PASSWORD}).status_code, 400)
        res = self.post(client, '/api/students', {**base, 'password': PASSWORD})
        self.assertEqual(res.status_code, 200)
        student = Student.objects.get(user__email='kid@t.com')
        self.assertTrue(self.class_a.students.filter(id=student.id).exists())
        self.assertEqual(self.post(client, '/api/students', {**base, 'password': PASSWORD}).status_code, 400)

    def test_student_must_be_given_a_classroom(self):
        res = self.post(self.client_for(self.admin), '/api/students', {
            'name': 'No Class', 'email': 'nc@t.com', 'password': PASSWORD})
        self.assertEqual(res.status_code, 400)

    def test_delete_student_removes_account(self):
        res = self.client_for(self.teacher_a.user).delete(f'/api/students/s-{self.s2.id}')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(User.objects.filter(email='s2@t.com').exists())

    def test_admin_can_set_points_directly(self):
        res = self.put(self.client_for(self.admin), f'/api/students/s-{self.s1.id}', {'points': 40, 'coins': 4})
        self.assertEqual(res.status_code, 200)
        self.s1.refresh_from_db()
        self.assertEqual((self.s1.points, self.s1.coins), (Decimal('40.0'), 4))

    def test_cannot_delete_yourself_or_a_superuser_via_teacher_api(self):
        admin_teacher = Teacher.objects.create(user=self.admin)
        res = self.client_for(self.admin).delete(f'/api/teachers/t-{admin_teacher.id}')
        self.assertEqual(res.status_code, 403)
        self.assertTrue(User.objects.filter(id=self.admin.id).exists())


class ChatTests(ApiTestCase):
    def test_sender_is_always_the_signed_in_user(self):
        client = self.client_for(self.s1.user)
        res = self.post(client, '/api/messages', {
            'classroomId': f'c-{self.class_a.id}', 'body': 'hello', 'senderId': f'u-{self.teacher_a.user.id}'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(ChatMessage.objects.get().sender_id, self.s1.user.id)

    def test_cannot_read_or_post_in_foreign_class(self):
        client = self.client_for(self.s1.user)
        self.assertEqual(client.get(f'/api/messages?classroomId=c-{self.class_b.id}').status_code, 404)
        res = self.post(client, '/api/messages', {'classroomId': f'c-{self.class_b.id}', 'body': 'hi'})
        self.assertEqual(res.status_code, 404)

    def test_message_delete_permissions(self):
        mine = ChatMessage.objects.create(classroom=self.class_a, sender=self.s1.user, body='mine')
        theirs = ChatMessage.objects.create(classroom=self.class_a, sender=self.s2.user, body='theirs')
        student = self.client_for(self.s1.user)
        self.assertEqual(student.delete(f'/api/messages/m-{theirs.id}').status_code, 403)
        self.assertEqual(student.delete(f'/api/messages/m-{mine.id}').status_code, 200)
        self.assertEqual(student.delete(f'/api/messages/m-{mine.id}').status_code, 404)
        # another class's teacher cannot touch it; the class teacher can
        self.assertEqual(self.client_for(self.teacher_b.user).delete(f'/api/messages/m-{theirs.id}').status_code, 404)
        self.assertEqual(self.client_for(self.teacher_a.user).delete(f'/api/messages/m-{theirs.id}').status_code, 200)
        self.assertFalse(ChatMessage.objects.exists())

    def test_classroom_is_required(self):
        res = self.post(self.client_for(self.s1.user), '/api/messages', {'body': 'hi'})
        self.assertEqual(res.status_code, 400)

    def test_empty_and_oversized_messages_rejected(self):
        client = self.client_for(self.s1.user)
        for body in ('   ', 'x' * 2001):
            res = self.post(client, '/api/messages', {'classroomId': f'c-{self.class_a.id}', 'body': body})
            self.assertEqual(res.status_code, 400)


class AttendanceTests(ApiTestCase):
    def mark(self, client, **kw):
        payload = {'classroomId': f'c-{self.class_a.id}', 'studentId': f's-{self.s1.id}',
                   'date': '2026-10-01', 'status': 'present'}
        payload.update(kw)
        return self.post(client, '/api/attendance', payload)

    def test_mark_update_and_clear(self):
        client = self.client_for(self.teacher_a.user)
        self.assertEqual(self.mark(client).status_code, 200)
        self.assertEqual(self.mark(client, status='absent', note='sick').status_code, 200)
        record = Attendance.objects.get()
        self.assertEqual((record.status, record.note, record.marked_by), ('absent', 'sick', 'Tara A'))
        self.assertEqual(self.mark(client, status='unmarked').json()['action'], 'deleted')
        self.assertEqual(Attendance.objects.count(), 0)

    def test_validation(self):
        client = self.client_for(self.teacher_a.user)
        self.assertEqual(self.mark(client, status='teleported').status_code, 400)
        self.assertEqual(self.mark(client, date='2026-02-31').status_code, 400)
        self.assertEqual(self.mark(client, date='').status_code, 400)
        self.assertEqual(self.mark(client, studentId=f's-{self.s3.id}').status_code, 400)  # not enrolled

    def test_students_cannot_mark_and_only_read_own(self):
        Attendance.objects.create(classroom=self.class_a, student=self.s1, date='2026-10-01')
        Attendance.objects.create(classroom=self.class_a, student=self.s2, date='2026-10-01')
        client = self.client_for(self.s1.user)
        self.assertEqual(self.mark(client).status_code, 403)
        rows = client.get('/api/attendance').json()['attendance']
        self.assertEqual([r['studentId'] for r in rows], [f's-{self.s1.id}'])

    def test_bulk_skips_students_outside_the_class(self):
        client = self.client_for(self.teacher_a.user)
        res = self.post(client, '/api/attendance/bulk', {
            'classroomId': f'c-{self.class_a.id}', 'date': '2026-10-01', 'status': 'present',
            'studentIds': [f's-{self.s1.id}', f's-{self.s2.id}', f's-{self.s3.id}', 'bogus']})
        self.assertEqual((res.json()['count'], res.json()['skipped']), (2, 2))

    def test_clear_day_is_scoped_to_one_classroom(self):
        Attendance.objects.create(classroom=self.class_a, student=self.s1, date='2026-10-01')
        Attendance.objects.create(classroom=self.class_b, student=self.s3, date='2026-10-01')
        client = self.client_for(self.teacher_a.user)
        res = client.delete(f'/api/attendance/day?classroomId=c-{self.class_a.id}&date=2026-10-01')
        self.assertEqual(res.json()['deleted'], 1)
        self.assertEqual(Attendance.objects.count(), 1)
        self.assertEqual(client.delete('/api/attendance/day?date=2026-10-01').status_code, 400)


class StoreTests(ApiTestCase):
    def buy(self, client, **kw):
        return self.post(client, '/api/store/purchase', {'productId': f'p-{self.product.id}', **kw})

    def test_purchase_deducts_coins_and_stock(self):
        res = self.buy(self.client_for(self.s1.user))
        self.assertEqual(res.status_code, 200)
        self.s1.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual((self.s1.coins, self.product.stock), (0, 2))
        self.assertEqual(StoreOrder.objects.get().status, 'pending')

    def test_cannot_spend_someone_elses_coins(self):
        res = self.buy(self.client_for(self.s2.user), studentId=f's-{self.s1.id}')
        self.assertEqual(res.status_code, 403)
        self.s1.refresh_from_db()
        self.assertEqual(self.s1.coins, 2)

    def test_teachers_and_admins_cannot_purchase(self):
        for user in (self.teacher_a.user, self.admin):
            self.assertEqual(self.buy(self.client_for(user)).status_code, 403)

    def test_insufficient_coins_stock_and_availability(self):
        self.assertEqual(self.buy(self.client_for(self.s2.user)).status_code, 400)  # 0 coins
        self.s1.coins = 10
        self.s1.save()
        self.product.stock = 0
        self.product.save()
        self.assertEqual(self.buy(self.client_for(self.s1.user)).status_code, 400)
        self.product.stock, self.product.is_available = 5, False
        self.product.save()
        self.assertEqual(self.buy(self.client_for(self.s1.user)).status_code, 400)

    def test_student_cancel_refunds_once_and_only_pending(self):
        client = self.client_for(self.s1.user)
        order_id = self.buy(client).json()['orderId']
        res = client.delete(f'/api/store/orders/{order_id}')
        self.assertEqual(res.status_code, 200)
        self.s1.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual((self.s1.coins, self.product.stock), (2, 3))

        order_id = self.buy(client).json()['orderId']
        StoreOrder.objects.filter(id=int(order_id[4:])).update(status='approved')
        self.assertEqual(client.delete(f'/api/store/orders/{order_id}').status_code, 403)

    def test_student_cannot_cancel_other_students_order(self):
        order_id = self.buy(self.client_for(self.s1.user)).json()['orderId']
        self.assertEqual(self.client_for(self.s2.user).delete(f'/api/store/orders/{order_id}').status_code, 404)

    def test_admin_reject_refunds_exactly_once_and_cannot_be_revived(self):
        order_id = self.buy(self.client_for(self.s1.user)).json()['orderId']
        admin = self.client_for(self.admin)
        res = self.put(admin, f'/api/store/orders/{order_id}/status', {'status': 'rejected', 'rejectionReason': 'no'})
        self.assertEqual(res.status_code, 200)
        self.s1.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual((self.s1.coins, self.product.stock), (2, 3))
        for status in ('approved', 'rejected'):
            self.assertEqual(self.put(admin, f'/api/store/orders/{order_id}/status', {'status': status}).status_code, 400)
        self.s1.refresh_from_db()
        self.assertEqual(self.s1.coins, 2)

    def test_delivered_orders_cannot_be_rejected_for_a_refund(self):
        order_id = self.buy(self.client_for(self.s1.user)).json()['orderId']
        admin = self.client_for(self.admin)
        self.put(admin, f'/api/store/orders/{order_id}/status', {'status': 'delivered'})
        res = self.put(admin, f'/api/store/orders/{order_id}/status', {'status': 'rejected'})
        self.assertEqual(res.status_code, 400)

    def test_only_admin_changes_order_status(self):
        order_id = self.buy(self.client_for(self.s1.user)).json()['orderId']
        for user in (self.s1.user, self.teacher_a.user):
            res = self.put(self.client_for(user), f'/api/store/orders/{order_id}/status', {'status': 'approved'})
            self.assertEqual(res.status_code, 403)

    def test_product_management_is_admin_only_and_validated(self):
        payload = {'name': 'Cap', 'priceCoins': 3, 'stock': 4}
        self.assertEqual(self.post(self.client_for(self.teacher_a.user), '/api/store/products', payload).status_code, 403)
        admin = self.client_for(self.admin)
        self.assertEqual(self.post(admin, '/api/store/products', {**payload, 'priceCoins': 0}).status_code, 400)
        self.assertEqual(self.post(admin, '/api/store/products', {**payload, 'imageUrl': 'javascript:alert(1)'}).status_code, 400)
        self.assertEqual(self.post(admin, '/api/store/products', payload).status_code, 200)

    def test_deleting_product_with_orders_only_hides_it(self):
        self.buy(self.client_for(self.s1.user))
        res = self.client_for(self.admin).delete(f'/api/store/products/p-{self.product.id}')
        self.assertEqual(res.json()['action'], 'deactivated')
        self.assertTrue(Product.objects.filter(id=self.product.id, is_available=False).exists())

    def test_students_only_see_available_products_and_own_orders(self):
        hidden = Product.objects.create(name='Hidden', price_coins=1, stock=1, is_available=False)
        self.buy(self.client_for(self.s1.user))
        data = self.client_for(self.s2.user).get('/api/app-data').json()
        self.assertNotIn(f'p-{hidden.id}', {p['id'] for p in data['products']})
        self.assertEqual(data['orders'], [])

    def test_upload_checks_extension_size_and_content(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        admin = self.client_for(self.admin)
        svg = SimpleUploadedFile('x.svg', b'<svg onload=alert(1)>', content_type='image/svg+xml')
        self.assertEqual(admin.post('/api/store/upload', {'image': svg}).status_code, 400)
        fake = SimpleUploadedFile('x.png', b'<html>not an image</html>', content_type='image/png')
        self.assertEqual(admin.post('/api/store/upload', {'image': fake}).status_code, 400)
        real = SimpleUploadedFile('x.png', b'\x89PNG\r\n\x1a\n' + b'0' * 50, content_type='image/png')
        with self.settings(MEDIA_ROOT=self._tmpdir()):
            import os
            os.makedirs(os.path.join(self._tmpdir(), 'products'), exist_ok=True)
            res = admin.post('/api/store/upload', {'image': real})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['url'].startswith('/uploads/products/'))
        self.assertEqual(self.client_for(self.s1.user).post('/api/store/upload', {'image': real}).status_code, 403)

    def test_uploaded_image_is_stored_in_database_and_served_to_students(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        admin = self.client_for(self.admin)
        png = SimpleUploadedFile('x.png', b'\x89PNG\r\n\x1a\n' + b'1' * 50, content_type='image/png')
        url = admin.post('/api/store/upload', {'image': png}).json()['url']
        product = Product.objects.create(name='Pic', price_coins=1, stock=1, image_url=url)
        with self.settings(MEDIA_ROOT=self._tmpdir()):  # no file on disk at all
            res = self.client_for(self.s1.user).get(url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'image/png')
        self.assertTrue(res.content.startswith(b'\x89PNG'))
        # removing the reward removes the now-unused picture
        self.assertEqual(admin.delete(f'/api/store/products/p-{product.id}').status_code, 200)
        self.assertEqual(admin.get(url).status_code, 404)

    def _tmpdir(self):
        import tempfile
        if not hasattr(self, '_tmp'):
            self._tmp = tempfile.mkdtemp()
        return self._tmp


class HomeworkTests(ApiTestCase):
    def test_homework_lifecycle_and_permissions(self):
        client = self.client_for(self.teacher_a.user)
        res = self.post(client, '/api/homework', {
            'classroomId': f'c-{self.class_a.id}', 'title': 'Read ch. 1', 'dueDate': '2026-11-01',
            'createdById': 't-999'})
        self.assertEqual(res.status_code, 200)
        homework_id = res.json()['homeworkId']

        self.assertEqual(self.post(client, '/api/homework', {
            'classroomId': f'c-{self.class_b.id}', 'title': 'x'}).status_code, 404)
        self.assertEqual(self.post(client, '/api/homework', {
            'classroomId': f'c-{self.class_a.id}', 'title': 'x', 'dueDate': 'tomorrow'}).status_code, 400)
        self.assertEqual(self.client_for(self.s1.user).delete(f'/api/homework/{homework_id}').status_code, 403)
        self.assertEqual(self.client_for(self.teacher_b.user).delete(f'/api/homework/{homework_id}').status_code, 404)
        self.assertEqual(client.delete(f'/api/homework/{homework_id}').status_code, 200)


class HealthAndSpaTests(ApiTestCase):
    def test_health_is_public(self):
        res = Client().get('/api/health')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {'status': 'ok'})

    def test_spa_without_build_gives_clear_503(self):
        res = Client().get('/')
        self.assertIn(res.status_code, (200, 503))


class SecurityHeaderTests(TestCase):
    def test_extra_security_headers(self):
        res = Client().get('/api/health')
        self.assertIn('camera=()', res['Permissions-Policy'])
        self.assertEqual(res['Cross-Origin-Resource-Policy'], 'same-origin')
        self.assertEqual(res['X-Frame-Options'], 'DENY')

    def test_production_csp_blocks_inline_scripts(self):
        from core.middleware import CSP
        self.assertIn("script-src 'self';", CSP)
        self.assertIn("frame-ancestors 'none'", CSP)
        self.assertIn("object-src 'none'", CSP)


# ===========================================================================
# Branch managers
# ===========================================================================

class ManagerTests(ApiTestCase):
    """Two branches: Bordj Kiffan (class_a) and Oran (class_b)."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        from .models import Manager
        cls.class_a.branch = 'Bordj Kiffan'
        cls.class_a.save()
        cls.class_b.branch = 'Oran'
        cls.class_b.save()
        cls.bk_manager = Manager.objects.create(user=make_user('bk@t.com', 'Bea', 'Kiffan'), branch='Bordj Kiffan')
        cls.or_manager = Manager.objects.create(user=make_user('or@t.com', 'Omar', 'Oran'), branch='Oran')

    def app_data(self, user):
        return self.client_for(user).get('/api/app-data').json()

    # -- who they are -----------------------------------------------------
    def test_manager_signs_in_with_role_and_branch(self):
        client = Client()
        res = self.post(client, '/api/auth/signin', {'email': 'bk@t.com', 'password': PASSWORD}).json()
        self.assertEqual(res['user']['role'], 'manager')
        self.assertEqual(res['user']['branch'], 'Bordj Kiffan')

    # -- what they see ----------------------------------------------------
    def test_manager_only_sees_their_own_branch(self):
        data = self.app_data(self.bk_manager.user)
        self.assertEqual({c['name'] for c in data['classrooms']}, {'Class A'})
        self.assertEqual({s['user']['firstName'] for s in data['students']}, {'Sam', 'Sue'})
        self.assertEqual({t['user']['firstName'] for t in data['teachers']}, {'Tara'})
        # no other branch's people leak through the generic user list either
        emails = {u.get('email') for u in data['users']}
        self.assertNotIn('s3@t.com', emails)
        self.assertNotIn('tb@t.com', emails)
        # managers never receive the manager list or the rewards store
        self.assertEqual(data['managers'], [])
        self.assertEqual(data['orders'], [])
        self.assertEqual(data['products'], [])

    def test_each_manager_gets_a_different_view(self):
        data = self.app_data(self.or_manager.user)
        self.assertEqual({s['user']['firstName'] for s in data['students']}, {'Sid'})

    def test_manager_branch_filter_ignores_classes_without_a_branch(self):
        Classroom.objects.create(name='Unassigned', teacher=self.teacher_a, branch='')
        data = self.app_data(self.bk_manager.user)
        self.assertNotIn('Unassigned', {c['name'] for c in data['classrooms']})

    def test_admin_sees_managers(self):
        data = self.app_data(self.admin)
        self.assertEqual({m['branch'] for m in data['managers']}, {'Bordj Kiffan', 'Oran'})

    # -- what they can do in their branch ---------------------------------
    def test_manager_can_award_points_in_branch(self):
        res = self.post(self.client_for(self.bk_manager.user), f'/api/students/s-{self.s1.id}/points/add', {'amount': 5})
        self.assertEqual(res.status_code, 200)
        self.s1.refresh_from_db()
        self.assertEqual(self.s1.points, Decimal('30'))

    def test_manager_can_add_student_to_branch_class(self):
        res = self.post(self.client_for(self.bk_manager.user), '/api/students', {
            'name': 'New Kid', 'email': 'new@t.com', 'password': PASSWORD, 'classroomId': f'c-{self.class_a.id}',
        })
        self.assertEqual(res.status_code, 200, res.content)

    def test_manager_can_mark_attendance_and_post_homework_in_branch(self):
        client = self.client_for(self.bk_manager.user)
        res = self.post(client, '/api/attendance', {
            'classroomId': f'c-{self.class_a.id}', 'studentId': f's-{self.s1.id}',
            'date': '2026-10-31', 'status': 'present',
        })
        self.assertEqual(res.status_code, 200, res.content)
        res = self.post(client, '/api/homework', {'classroomId': f'c-{self.class_a.id}', 'title': 'Read'})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(Attendance.objects.count(), 1)

    # -- what they can NOT do in another branch ---------------------------
    def test_manager_cannot_touch_other_branch_students(self):
        client = self.client_for(self.bk_manager.user)
        sid = f's-{self.s3.id}'
        self.assertEqual(self.post(client, f'/api/students/{sid}/points/add', {'amount': 5}).status_code, 404)
        self.assertEqual(self.post(client, f'/api/students/{sid}/points/subtract', {'amount': 1}).status_code, 404)
        self.assertEqual(self.put(client, f'/api/students/{sid}', {'name': 'Hacked'}).status_code, 404)
        self.assertEqual(client.delete(f'/api/students/{sid}').status_code, 404)
        self.assertTrue(Student.objects.filter(id=self.s3.id).exists())

    def test_manager_cannot_add_student_to_other_branch_class(self):
        res = self.post(self.client_for(self.bk_manager.user), '/api/students', {
            'name': 'X', 'email': 'x@t.com', 'password': PASSWORD, 'classroomId': f'c-{self.class_b.id}',
        })
        self.assertEqual(res.status_code, 404)

    def test_manager_cannot_move_student_into_other_branch(self):
        res = self.put(self.client_for(self.bk_manager.user), f'/api/students/s-{self.s1.id}',
                       {'classroomId': f'c-{self.class_b.id}'})
        self.assertEqual(res.status_code, 404)
        self.assertTrue(self.class_a.students.filter(id=self.s1.id).exists())

    def test_manager_cannot_use_other_branch_classroom_features(self):
        client = self.client_for(self.bk_manager.user)
        cid = f'c-{self.class_b.id}'
        self.assertEqual(self.post(client, '/api/homework', {'classroomId': cid, 'title': 'x'}).status_code, 404)
        self.assertEqual(self.post(client, '/api/messages', {'classroomId': cid, 'body': 'hi'}).status_code, 404)
        self.assertEqual(client.get(f'/api/messages?classroomId={cid}').status_code, 404)
        self.assertEqual(self.put(client, f'/api/classrooms/{cid}', {'name': 'x'}).status_code, 404)
        self.assertEqual(client.delete(f'/api/classrooms/{cid}').status_code, 404)
        self.assertEqual(self.post(client, '/api/attendance/bulk', {
            'classroomId': cid, 'date': '2026-10-31', 'status': 'present', 'studentIds': [f's-{self.s3.id}'],
        }).status_code, 404)

    def test_manager_cannot_set_points_or_coins_directly(self):
        res = self.put(self.client_for(self.bk_manager.user), f'/api/students/s-{self.s1.id}', {'points': 999})
        self.assertEqual(res.status_code, 403)

    # -- classes ----------------------------------------------------------
    def test_class_created_by_manager_is_forced_into_their_branch(self):
        res = self.post(self.client_for(self.bk_manager.user), '/api/classrooms', {
            'name': 'Sneaky', 'branch': 'Oran', 'specialty': 'SE1', 'teacherId': f't-{self.teacher_a.id}',
        })
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(Classroom.objects.get(name='Sneaky').branch, 'Bordj Kiffan')

    def test_manager_cannot_assign_teacher_from_another_branch(self):
        res = self.post(self.client_for(self.bk_manager.user), '/api/classrooms', {
            'name': 'X', 'teacherId': f't-{self.teacher_b.id}',
        })
        self.assertEqual(res.status_code, 404)

    def test_manager_cannot_move_class_to_another_branch(self):
        res = self.put(self.client_for(self.bk_manager.user), f'/api/classrooms/c-{self.class_a.id}', {'branch': 'Oran'})
        self.assertEqual(res.status_code, 403)
        self.class_a.refresh_from_db()
        self.assertEqual(self.class_a.branch, 'Bordj Kiffan')

    def test_manager_can_edit_and_delete_class_they_do_not_own(self):
        client = self.client_for(self.bk_manager.user)
        cid = f'c-{self.class_a.id}'
        self.assertEqual(self.put(client, f'/api/classrooms/{cid}', {'name': 'Renamed'}).status_code, 200)
        self.assertEqual(client.delete(f'/api/classrooms/{cid}').status_code, 200)

    # -- teachers ---------------------------------------------------------
    def test_manager_creates_teacher_with_starter_class_in_branch(self):
        client = self.client_for(self.bk_manager.user)
        res = self.post(client, '/api/teachers', {
            'firstName': 'Nora', 'email': 'nora@t.com', 'password': PASSWORD, 'classroomName': 'Nora Class',
        })
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(Classroom.objects.get(name='Nora Class').branch, 'Bordj Kiffan')
        names = {t['user']['firstName'] for t in self.app_data(self.bk_manager.user)['teachers']}
        self.assertIn('Nora', names)
        # ...and that teacher is invisible to the other branch's manager
        names = {t['user']['firstName'] for t in self.app_data(self.or_manager.user)['teachers']}
        self.assertNotIn('Nora', names)

    def test_manager_can_edit_own_branch_teacher_but_not_others(self):
        client = self.client_for(self.bk_manager.user)
        self.assertEqual(self.put(client, f'/api/teachers/t-{self.teacher_a.id}', {'firstName': 'Tara2'}).status_code, 200)
        self.assertEqual(self.put(client, f'/api/teachers/t-{self.teacher_b.id}', {'firstName': 'No'}).status_code, 404)
        self.assertEqual(client.delete(f'/api/teachers/t-{self.teacher_b.id}').status_code, 404)

    def test_manager_cannot_delete_teacher_who_also_owns_classes_elsewhere(self):
        Classroom.objects.create(name='Tara in Oran', teacher=self.teacher_a, branch='Oran')
        res = self.client_for(self.bk_manager.user).delete(f'/api/teachers/t-{self.teacher_a.id}')
        self.assertEqual(res.status_code, 403)
        self.assertTrue(Teacher.objects.filter(id=self.teacher_a.id).exists())

    # -- admin-only things ------------------------------------------------
    def test_manager_cannot_use_store_or_manage_managers(self):
        client = self.client_for(self.bk_manager.user)
        self.assertEqual(client.get('/api/store/orders').status_code, 403)
        self.assertEqual(self.post(client, '/api/store/products', {'name': 'x'}).status_code, 403)
        self.assertEqual(self.post(client, '/api/managers', {
            'firstName': 'Evil', 'email': 'evil@t.com', 'password': PASSWORD, 'branch': 'Oran',
        }).status_code, 403)
        self.assertEqual(client.delete(f'/api/managers/mg-{self.or_manager.id}').status_code, 403)

    def test_teacher_and_student_cannot_manage_managers(self):
        for user in (self.teacher_a.user, self.s1.user):
            self.assertEqual(self.post(self.client_for(user), '/api/managers', {
                'firstName': 'E', 'email': 'e@t.com', 'password': PASSWORD, 'branch': 'Oran',
            }).status_code, 403)

    def test_admin_manager_crud(self):
        from .models import Manager
        client = self.client_for(self.admin)
        res = self.post(client, '/api/managers', {
            'firstName': 'Rim', 'lastName': 'R', 'email': 'rim@t.com', 'password': PASSWORD, 'branch': 'Rouissou',
        })
        self.assertEqual(res.status_code, 200, res.content)
        mid = res.json()['managerId']
        # invalid branch / duplicate email are rejected
        self.assertEqual(self.post(client, '/api/managers', {
            'firstName': 'X', 'email': 'x2@t.com', 'password': PASSWORD, 'branch': 'Mars',
        }).status_code, 400)
        self.assertEqual(self.post(client, '/api/managers', {
            'firstName': 'X', 'email': 'rim@t.com', 'password': PASSWORD, 'branch': 'Oran',
        }).status_code, 400)
        # move to another branch
        self.assertEqual(self.put(client, f'/api/managers/{mid}', {'branch': 'Online'}).status_code, 200)
        self.assertEqual(Manager.objects.get(user__email='rim@t.com').branch, 'Online')
        # delete removes the whole account
        self.assertEqual(client.delete(f'/api/managers/{mid}').status_code, 200)
        self.assertFalse(User.objects.filter(email='rim@t.com').exists())

    def test_chat_messages_from_manager_are_labelled(self):
        client = self.client_for(self.bk_manager.user)
        res = self.post(client, '/api/messages', {'classroomId': f'c-{self.class_a.id}', 'body': 'Welcome'}).json()
        self.assertEqual(res['message']['senderRole'], 'manager')
        again = self.client_for(self.teacher_a.user).get('/api/app-data').json()
        self.assertEqual(again['messages'][-1]['senderRole'], 'manager')
