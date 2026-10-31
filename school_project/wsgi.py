"""WSGI config for the school_project project."""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'school_project.settings')

# Migrations and the admin account are handled by build.sh at deploy time, not on
# every worker start (which raced between workers and hid migration failures).
application = get_wsgi_application()
