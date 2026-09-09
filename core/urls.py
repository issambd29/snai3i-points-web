from django.urls import path, re_path
from .views import (
    signin_view, signup_view, signout_view, home,
    dashboard, student_dashboard, admin_dashboard,
    add_teacher, update_teacher, delete_teacher,
    add_student, get_student, update_student,
    add_points, subtract_points, delete_student,
    share_classroom, unshare_classroom,
    add_classroom,
    add_homework, send_message,
)
from .api import (
    api_health,
    api_signin, api_signup, api_signout, api_current_user,
    api_get_app_data, api_add_points, api_subtract_points,
    api_students, api_teachers, api_classrooms,
    api_classroom_share, api_classroom_unshare,
    api_homework, api_messages,
    api_attendance, api_attendance_bulk, api_attendance_day,
    api_store_products, api_store_upload, api_store_purchase,
    api_store_orders, api_store_order_status,
)

urlpatterns = [
    re_path(r'^api/health/?$',                    api_health,        name='api_health'),
    path('',                                      home,              name='home'),
    path('signin/',                               signin_view,       name='signin'),
    path('signup/',                               signup_view,       name='signup'),
    path('signout/',                              signout_view,      name='signout'),
    # dashboards
    path('dashboard/',                            dashboard,         name='dashboard'),
    path('student/',                              student_dashboard, name='student_dashboard'),
    path('admin-panel/',                          admin_dashboard,   name='admin_dashboard'),
    # admin — teacher management
    path('add-teacher/',                          add_teacher,       name='add_teacher'),
    path('update-teacher/<int:teacher_id>/',      update_teacher,    name='update_teacher'),
    path('delete-teacher/<int:teacher_id>/',      delete_teacher,    name='delete_teacher'),
    # teacher — student management
    path('add-student/',                          add_student,       name='add_student'),
    path('get-student/<int:student_id>/',         get_student,       name='get_student'),
    path('update-student/<int:student_id>/',      update_student,    name='update_student'),
    path('add-points/<int:student_id>/',          add_points,        name='add_points'),
    path('subtract-points/<int:student_id>/',     subtract_points,   name='subtract_points'),
    path('delete-student/<int:student_id>/',      delete_student,    name='delete_student'),
    path('share-classroom/',                      share_classroom,   name='share_classroom'),
    path('unshare-classroom/',                    unshare_classroom, name='unshare_classroom'),
    path('add-classroom/',                        add_classroom,    name='add_classroom'),
    path('add-homework/',                        add_homework,    name='add_homework'),
    path('send-message/',                        send_message,    name='send_message'),
    
    # REST API endpoints for React Frontend -> Django -> PostgreSQL (supports with and without trailing slash)
    re_path(r'^api/auth/signin/?$',                      api_signin,             name='api_signin'),
    re_path(r'^api/auth/signup/?$',                      api_signup,             name='api_signup'),
    re_path(r'^api/auth/signout/?$',                     api_signout,            name='api_signout'),
    re_path(r'^api/auth/user/?$',                        api_current_user,       name='api_current_user'),
    re_path(r'^api/app-data/?$',                         api_get_app_data,       name='api_get_app_data'),
    re_path(r'^api/state/?$',                            api_get_app_data,       name='api_state'),
    
    # Points
    re_path(r'^api/students/(?P<student_id>[^/]+)/points/add/?$',      api_add_points,         name='api_add_points'),
    re_path(r'^api/students/(?P<student_id>[^/]+)/points/subtract/?$', api_subtract_points,    name='api_subtract_points'),
    
    # Students
    re_path(r'^api/students/(?P<student_id>[^/]+)/?$',                 api_students,           name='api_student_detail'),
    re_path(r'^api/students/?$',                                       api_students,           name='api_students'),
    
    # Teachers
    re_path(r'^api/teachers/(?P<teacher_id>[^/]+)/?$',                 api_teachers,           name='api_teacher_detail'),
    re_path(r'^api/teachers/?$',                                       api_teachers,           name='api_teachers'),
    
    # Classrooms
    re_path(r'^api/classrooms/(?P<classroom_id>[^/]+)/share/?$',       api_classroom_share,    name='api_classroom_share'),
    re_path(r'^api/classrooms/(?P<classroom_id>[^/]+)/unshare/?$',     api_classroom_unshare,  name='api_classroom_unshare'),
    re_path(r'^api/classrooms/(?P<classroom_id>[^/]+)/?$',             api_classrooms,         name='api_classroom_detail'),
    re_path(r'^api/classrooms/?$',                                     api_classrooms,         name='api_classrooms'),
    
    # Homework
    re_path(r'^api/homework/(?P<homework_id>[^/]+)/?$',                api_homework,           name='api_homework_detail'),
    re_path(r'^api/homework/?$',                                       api_homework,           name='api_homework'),
    
    # Messages
    re_path(r'^api/messages/?$',                                       api_messages,           name='api_messages'),
    
    # Attendance
    re_path(r'^api/attendance/bulk/?$',                                api_attendance_bulk,    name='api_attendance_bulk'),
    re_path(r'^api/attendance/day/?$',                                 api_attendance_day,     name='api_attendance_day'),
    re_path(r'^api/attendance/?$',                                     api_attendance,         name='api_attendance'),
    
    # Store / Rewards
    re_path(r'^api/store/upload/?$',                                   api_store_upload,       name='api_store_upload'),
    re_path(r'^api/store/purchase/?$',                                 api_store_purchase,     name='api_store_purchase'),
    re_path(r'^api/store/orders/(?P<order_id>[^/]+)/status/?$',        api_store_order_status, name='api_store_order_status'),
    re_path(r'^api/store/orders/(?P<order_id>[^/]+)/?$',               api_store_orders,       name='api_store_order_detail'),
    re_path(r'^api/store/orders/?$',                                   api_store_orders,       name='api_store_orders'),
    re_path(r'^api/store/products/(?P<product_id>[^/]+)/?$',           api_store_products,     name='api_store_product_detail'),
    re_path(r'^api/store/products/?$',                                 api_store_products,     name='api_store_products'),
]
