from django.urls import path, re_path

from . import api
from .views import spa

urlpatterns = [
    # ---- single-page app shell (client side decides what to show) ---------
    path('', spa, name='home'),
    path('signin/', spa, name='signin'),
    path('dashboard/', spa, name='dashboard'),
    path('student/', spa, name='student_dashboard'),
    path('admin-panel/', spa, name='admin_dashboard'),
    path('manager-panel/', spa, name='manager_dashboard'),

    # ---- health ------------------------------------------------------------
    re_path(r'^api/health/?$', api.api_health, name='api_health'),

    # ---- auth ----------------------------------------------------------------
    re_path(r'^api/auth/signin/?$', api.api_signin, name='api_signin'),
    re_path(r'^api/auth/signup/?$', api.api_signup, name='api_signup'),
    re_path(r'^api/auth/signout/?$', api.api_signout, name='api_signout'),
    re_path(r'^api/auth/user/?$', api.api_current_user, name='api_current_user'),

    # ---- app state -------------------------------------------------------------
    re_path(r'^api/app-data/?$', api.api_get_app_data, name='api_get_app_data'),

    # ---- students / points -----------------------------------------------------
    re_path(r'^api/students/(?P<student_id>[^/]+)/points/add/?$', api.api_add_points, name='api_add_points'),
    re_path(r'^api/students/(?P<student_id>[^/]+)/points/subtract/?$', api.api_subtract_points, name='api_subtract_points'),
    re_path(r'^api/students/(?P<student_id>[^/]+)/?$', api.api_students, name='api_student_detail'),
    re_path(r'^api/students/?$', api.api_students, name='api_students'),

    # ---- teachers ---------------------------------------------------------------
    re_path(r'^api/teachers/(?P<teacher_id>[^/]+)/?$', api.api_teachers, name='api_teacher_detail'),
    re_path(r'^api/teachers/?$', api.api_teachers, name='api_teachers'),

    # ---- branch managers (admin only) ------------------------------------------
    re_path(r'^api/managers/(?P<manager_id>[^/]+)/?$', api.api_managers, name='api_manager_detail'),
    re_path(r'^api/managers/?$', api.api_managers, name='api_managers'),

    # ---- classrooms ---------------------------------------------------------------
    re_path(r'^api/classrooms/(?P<classroom_id>[^/]+)/share/?$', api.api_classroom_share, name='api_classroom_share'),
    re_path(r'^api/classrooms/(?P<classroom_id>[^/]+)/unshare/?$', api.api_classroom_unshare, name='api_classroom_unshare'),
    re_path(r'^api/classrooms/(?P<classroom_id>[^/]+)/?$', api.api_classrooms, name='api_classroom_detail'),
    re_path(r'^api/classrooms/?$', api.api_classrooms, name='api_classrooms'),

    # ---- homework / messages ----------------------------------------------------------
    re_path(r'^api/homework/(?P<homework_id>[^/]+)/?$', api.api_homework, name='api_homework_detail'),
    re_path(r'^api/homework/?$', api.api_homework, name='api_homework'),
    re_path(r'^api/messages/(?P<message_id>[^/]+)/?$', api.api_message_detail, name='api_message_detail'),
    re_path(r'^api/messages/?$', api.api_messages, name='api_messages'),

    # ---- attendance --------------------------------------------------------------------
    re_path(r'^api/attendance/bulk/?$', api.api_attendance_bulk, name='api_attendance_bulk'),
    re_path(r'^api/attendance/day/?$', api.api_attendance_day, name='api_attendance_day'),
    re_path(r'^api/attendance/?$', api.api_attendance, name='api_attendance'),

    # ---- rewards store --------------------------------------------------------------------
    re_path(r'^api/store/upload/?$', api.api_store_upload, name='api_store_upload'),
    re_path(r'^api/store/purchase/?$', api.api_store_purchase, name='api_store_purchase'),
    re_path(r'^api/store/orders/(?P<order_id>[^/]+)/status/?$', api.api_store_order_status, name='api_store_order_status'),
    re_path(r'^api/store/orders/(?P<order_id>[^/]+)/?$', api.api_store_orders, name='api_store_order_detail'),
    re_path(r'^api/store/orders/?$', api.api_store_orders, name='api_store_orders'),
    re_path(r'^api/store/products/(?P<product_id>[^/]+)/?$', api.api_store_products, name='api_store_product_detail'),
    re_path(r'^api/store/products/?$', api.api_store_products, name='api_store_products'),
]
