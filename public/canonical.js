(function () {
  try {
    var path = window.location.pathname;
    var fullUrl = window.location.origin + (path === '/' ? '/' : path.replace(/\/$/, '') + '/');
    var canonical = document.getElementById('canonical-url');
    if (canonical) canonical.setAttribute('href', fullUrl);
  } catch (e) {}
})();
