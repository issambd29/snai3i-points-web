"""Extra security headers that Django does not send on its own."""
from django.conf import settings

CSP = '; '.join([
    "default-src 'self'",
    "script-src 'self'",                                   # no inline scripts, no eval
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",  # React sets inline styles
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",                   # https: so admins can paste an image link
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])
if not settings.DEBUG:
    CSP += '; upgrade-insecure-requests'

PERMISSIONS_POLICY = ', '.join([
    'accelerometer=()', 'autoplay=()', 'camera=()', 'display-capture=()', 'geolocation=()',
    'gyroscope=()', 'magnetometer=()', 'microphone=()', 'payment=()', 'usb=()', 'interest-cohort=()',
])


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if not settings.DEBUG:  # the Vite dev server needs inline scripts, so only enforce in production
            response.setdefault('Content-Security-Policy', CSP)
        response.setdefault('Permissions-Policy', PERMISSIONS_POLICY)
        if request.path.startswith('/api/'):
            response.setdefault('Cross-Origin-Resource-Policy', 'same-origin')
            response.setdefault('Cache-Control', 'no-store')
        return response
