from django.contrib import admin

from .models import (
    Attendance, ChatMessage, Classroom, Homework, Manager, Product, Student, StoreOrder, Teacher,
)

admin.site.register(Student)
admin.site.register(Teacher)
admin.site.register(Classroom)
admin.site.register(Homework)
admin.site.register(ChatMessage)
admin.site.register(Attendance)
admin.site.register(Product)
admin.site.register(StoreOrder)
admin.site.register(Manager)
