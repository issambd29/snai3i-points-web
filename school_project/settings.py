"""
Django settings for the Snai3i Points Tracker.

Configuration comes from environment variables (see ``.env.example``). For local
development a ``.env`` file in the project root is read automatically.
"""
import os
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path):
    """Tiny .env loader (no extra dependency). Real environment variables win."""
    if not path.is_file():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(BASE_DIR / '.env')


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ('true', '1', 't', 'yes', 'on')


def env_list(name):
    return [item.strip() for item in os.environ.get(name, '').split(',') if item.strip()]


DEBUG = env_bool('DEBUG', False)

# --------------------------------------------------------------------------
# Secrets & hosts
# --------------------------------------------------------------------------
SECRET_KEY = os.environ.get('SECRET_KEY', '').strip()
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'django-insecure-local-development-only'
    else:
        raise ImproperlyConfigured(
            'The SECRET_KEY environment variable is required when DEBUG is off.'
        )

RENDER_EXTERNAL_HOSTNAME = os.environ.get('RENDER_EXTERNAL_HOSTNAME', '').strip()

ALLOWED_HOSTS = env_list('ALLOWED_HOSTS')
if RENDER_EXTERNAL_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)
# Vercel gives every deployment its own address, so accept Vercel's own domains automatically.
# (Custom domains still go in the ALLOWED_HOSTS environment variable.)
ON_VERCEL = bool(os.environ.get('VERCEL'))
if ON_VERCEL:
    ALLOWED_HOSTS.append('.vercel.app')
if DEBUG:
    ALLOWED_HOSTS += ['localhost', '127.0.0.1', '[::1]', 'testserver']

CSRF_TRUSTED_ORIGINS = env_list('CSRF_TRUSTED_ORIGINS')
if RENDER_EXTERNAL_HOSTNAME:
    CSRF_TRUSTED_ORIGINS.append(f'https://{RENDER_EXTERNAL_HOSTNAME}')
if ON_VERCEL:
    CSRF_TRUSTED_ORIGINS.append('https://*.vercel.app')
if DEBUG:
    CSRF_TRUSTED_ORIGINS += [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:8001',
        'http://127.0.0.1:8001',
    ]

# --------------------------------------------------------------------------
# HTTPS / cookie hardening (Render terminates TLS and forwards plain HTTP)
# --------------------------------------------------------------------------
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = env_bool('SECURE_SSL_REDIRECT', not DEBUG)
SECURE_REDIRECT_EXEMPT = [r'^api/health/?$']  # let plain-HTTP health checks through
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'same-origin'
X_FRAME_OPTIONS = 'DENY'
CSRF_FAILURE_VIEW = 'core.views.csrf_failure'
if not DEBUG:
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = False
    SECURE_HSTS_PRELOAD = False

# --------------------------------------------------------------------------
# App-specific switches
# --------------------------------------------------------------------------
# Anyone could previously register as a teacher through the API. Accounts are now
# created by an administrator unless you explicitly turn public sign-up on.
ALLOW_PUBLIC_SIGNUP = env_bool('ALLOW_PUBLIC_SIGNUP', False)

# --------------------------------------------------------------------------
# Applications
# --------------------------------------------------------------------------
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'core',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'core.middleware.SecurityHeadersMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'school_project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'school_project.wsgi.application'

# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------
def get_database_config():
    database_url = os.environ.get('DATABASE_URL', '').strip()
    if database_url:
        return {
            'default': dj_database_url.parse(
                database_url,
                conn_max_age=600,
                conn_health_checks=True,
                ssl_require=env_bool('DATABASE_SSL_REQUIRE', not DEBUG),
            )
        }

    # Never fall back to a throw-away SQLite file in production by accident:
    # on Render its disk is wiped on every deploy and data would silently vanish.
    if not DEBUG and not env_bool('ALLOW_SQLITE', False):
        raise ImproperlyConfigured(
            'DATABASE_URL is required in production (set ALLOW_SQLITE=True to override).'
        )
    return {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }


DATABASES = get_database_config()

# scrypt (memory-hard, strong) is ~3x faster than the default PBKDF2 here, so creating accounts and
# signing in are quicker. Existing PBKDF2 passwords still work and are upgraded on the next login.
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.ScryptPasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher',
]

AUTH_PASSWORD_VALIDATORS = [
    # UserAttributeSimilarityValidator removed on purpose: a password equal to the e-mail is allowed.
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# --------------------------------------------------------------------------
# Internationalisation
# --------------------------------------------------------------------------
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Africa/Algiers'
USE_I18N = True
USE_TZ = True

# --------------------------------------------------------------------------
# Static & media files
# --------------------------------------------------------------------------
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
DIST_DIR = BASE_DIR / 'dist'  # output of `npm run build`

STATICFILES_DIRS = [BASE_DIR / 'core' / 'static']
if DIST_DIR.exists():
    STATICFILES_DIRS.append(DIST_DIR)

# Serve the compiled React app's root files (/assets/*, favicon, manifest, ...).
WHITENOISE_ROOT = DIST_DIR if DIST_DIR.exists() else None

# STATICFILES_STORAGE was removed in Django 5.1 - STORAGES is the supported setting.
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage'},
}

MEDIA_URL = '/uploads/'
MEDIA_ROOT = BASE_DIR / 'uploads'
# Uploaded reward images live in the database now, so this folder is only a fallback for old files.
# Never crash at start-up if the disk is read-only (Vercel and similar hosts).
try:
    (MEDIA_ROOT / 'products').mkdir(parents=True, exist_ok=True)
except OSError:
    pass

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# --------------------------------------------------------------------------
# Logging (stdout, so it shows up in Render logs)
# --------------------------------------------------------------------------
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {'format': '[{asctime}] {levelname} {name}: {message}', 'style': '{'},
    },
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'verbose'},
    },
    'root': {'handlers': ['console'], 'level': 'INFO'},
}
