from django.db import models
from django.contrib.auth.models import User


class Student(models.Model):
    user     = models.OneToOneField(User, on_delete=models.CASCADE)
    points   = models.DecimalField(max_digits=8, decimal_places=1, default=0)
    coins    = models.IntegerField(default=0)
    age      = models.IntegerField(default=0)  
    division = models.CharField(max_length=50, default="Class A")

    def __str__(self):
        return self.user.username


class Teacher(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)

    def __str__(self):
        return self.user.username


class Classroom(models.Model):
    name        = models.CharField(max_length=100)
    branch      = models.CharField(max_length=20, blank=True, default='')  # BO, RO, OR
    specialty   = models.CharField(max_length=50, blank=True, default='')  # SO 1-3, Make 1-3, Common, Business
    session_time = models.CharField(max_length=50, blank=True, default='') # e.g. "2" or "2 hours"
    teacher     = models.ForeignKey(Teacher, on_delete=models.CASCADE)
    shared_with = models.ManyToManyField(
        Teacher,
        blank=True,
        related_name='shared_classrooms',
    )
    students    = models.ManyToManyField(Student)

    def __str__(self):
        return self.name


class Homework(models.Model):
    classroom = models.ForeignKey(
        Classroom,
        on_delete=models.CASCADE,
        related_name='homeworks',
    )
    created_by = models.ForeignKey(Teacher, on_delete=models.CASCADE)
    title = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class ChatMessage(models.Model):
    classroom = models.ForeignKey(
        Classroom,
        on_delete=models.CASCADE,
        related_name='messages',
    )
    sender = models.ForeignKey(User, on_delete=models.CASCADE)
    body = models.TextField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']


class Attendance(models.Model):
    classroom = models.ForeignKey(
        Classroom,
        on_delete=models.CASCADE,
        related_name='attendances',
    )
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name='attendances',
    )
    date = models.DateField()
    status = models.CharField(max_length=20, default='present')  # present, absent, late, excused
    note = models.TextField(blank=True, default='')
    marked_by = models.CharField(max_length=150, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', 'id']
        unique_together = ('classroom', 'student', 'date')


class Product(models.Model):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    price_coins = models.IntegerField(default=1)
    stock = models.IntegerField(default=0)
    category = models.CharField(max_length=100, default='General')
    image_url = models.TextField(blank=True, default='')
    icon = models.CharField(max_length=50, blank=True, default='Gift')
    is_available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'core_product'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.price_coins} coins)"


class StoreOrder(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='store_orders')
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    product_name = models.CharField(max_length=200)
    cost_coins = models.IntegerField()
    status = models.CharField(max_length=30, default='pending')  # pending, approved, rejected, completed
    notes = models.TextField(blank=True, default='')
    rejection_reason = models.TextField(blank=True, default='')
    refunded = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'core_store_order'
        ordering = ['-created_at']

    def __str__(self):
        return f"Order #{self.id}: {self.product_name} by {self.student.user.username} ({self.status})"

