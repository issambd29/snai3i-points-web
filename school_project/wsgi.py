"""
WSGI config for school_project project.
"""
import os
import sys
from django.core.wsgi import get_wsgi_application
from django.core.management import call_command

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'school_project.settings')

application = get_wsgi_application()

# Automatic startup migrations and admin creation directly inside Gunicorn
try:
    print("[WSGI Startup] Applying database migrations...", flush=True)
    call_command('migrate', interactive=False)
    print("[WSGI Startup] Database migrations completed successfully.", flush=True)
    try:
        call_command('createadmin')
    except Exception as admin_err:
        print(f"[WSGI Startup] createadmin notice: {admin_err}", flush=True)
except Exception as e:
    print(f"[WSGI Startup] Database migration error: {e}", file=sys.stderr, flush=True)

