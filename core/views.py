"""Serves the compiled React single-page app."""
from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse, JsonResponse
from django.views.static import serve as static_serve

from .models import ProductImage


def spa(request, *args, **kwargs):
    """Return the built ``dist/index.html`` for every client-side route."""
    index_file = settings.DIST_DIR / 'index.html'
    if not index_file.is_file():
        return HttpResponse(
            'The frontend has not been built yet. Run "npm run build" '
            '(or "npm run dev" for local development).',
            status=503,
            content_type='text/plain; charset=utf-8',
        )
    response = HttpResponse(index_file.read_text(encoding='utf-8'), content_type='text/html; charset=utf-8')
    response['Cache-Control'] = 'no-cache'
    return response


def csrf_failure(request, reason=''):
    """JSON instead of Django's HTML page, so the app can show a friendly message."""
    return JsonResponse(
        {'success': False, 'error': 'Your session security token has expired. Please reload the page and try again.'},
        status=403,
    )


def media(request, path):
    """Serve uploaded reward images: from the database first, old disk files as a fallback."""
    if request.method not in ('GET', 'HEAD'):
        return HttpResponse(status=405)
    name = path.rsplit('/', 1)[-1]
    if path.startswith('products/'):
        image = ProductImage.objects.filter(name=name).first()
        if image is not None:
            response = HttpResponse(bytes(image.data), content_type=image.content_type)
            response['Cache-Control'] = 'public, max-age=31536000, immutable'  # names are random, never reused
            return response
    try:
        return static_serve(request, path, document_root=settings.MEDIA_ROOT)
    except Http404:
        raise
