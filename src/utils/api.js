// Small fetch wrapper used for every backend call.
//  - sends the session cookie and Django's CSRF token on unsafe requests
//  - always resolves to a parsed JSON object (never throws on HTTP errors)
//  - tells the app when the session has expired (HTTP 401)

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

const readCookie = (name) => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
};

let csrfRequest = null;
const ensureCsrfToken = async () => {
  if (readCookie('csrftoken')) return readCookie('csrftoken');
  // This endpoint sets the cookie as a side effect.
  csrfRequest = csrfRequest || fetch('/api/auth/user', { credentials: 'same-origin' }).finally(() => {
    csrfRequest = null;
  });
  await csrfRequest;
  return readCookie('csrftoken');
};

/**
 * apiFetch('/api/students', { method: 'POST', body: {...} })
 * `body` may be a plain object (sent as JSON) or FormData (sent as-is).
 * Resolves to `{ ok, status, ...serverJson }`; `success`/`error` mirror the backend.
 */
export const apiFetch = async (path, { method = 'GET', body, auth = true } = {}) => {
  const headers = {};
  const init = { method, credentials: 'same-origin', headers };

  if (UNSAFE_METHODS.has(method)) {
    headers['X-CSRFToken'] = await ensureCsrfToken();
  }
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path, init);
  } catch {
    return {
      ok: false,
      status: 0,
      success: false,
      error: 'Could not reach the server. Please check your connection and try again.',
    };
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    // non-JSON body (e.g. proxy error page)
  }

  if (res.status === 401 && auth) onUnauthorized();

  const failed = !res.ok || data.success === false;
  return {
    ...data,
    ok: res.ok,
    status: res.status,
    success: !failed && data.success !== false,
    error: failed ? data.error || (res.status === 403 ? 'You do not have permission to do that.' : 'Something went wrong. Please try again.') : undefined,
  };
};
