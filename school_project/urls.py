"""URL configuration for the school_project project."""
from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from core.views import media

urlpatterns = [
    path('admin/', admin.site.urls),
    # Product images uploaded by administrators.
    re_path(r'^uploads/(?P<path>.*)$', media),
    path('', include('core.urls')),
]
