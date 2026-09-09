"""
URL configuration for school_project project.
"""
from django.contrib import admin
from django.urls import path, re_path, include
from django.views.static import serve
from django.conf import settings

urlpatterns = [
    path('admin/', admin.site.urls),
    # Fallback to guarantee React SPA JS/CSS chunks are always served
    re_path(r'^assets/(?P<path>.*)$', serve, {
        'document_root': settings.BASE_DIR / 'dist' / 'assets' if (settings.BASE_DIR / 'dist' / 'assets').exists() else settings.STATIC_ROOT / 'assets',
    }),
    re_path(r'^uploads/(?P<path>.*)$', serve, {
        'document_root': settings.MEDIA_ROOT,
    }),
    path('', include('core.urls')),
]
