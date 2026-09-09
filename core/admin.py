from django.contrib import admin
from .models import Student, Teacher, Classroom

admin.site.register(Student)
admin.site.register(Teacher)
admin.site.register(Classroom)