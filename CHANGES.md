# Branch manager role

A new **Manager** role sits between the admin and the teachers. Each manager is tied to
exactly one branch (Bordj Kiffan, Rouissou, Oran or Online) and only ever sees that branch.

* **Admin** creates / edits / deletes managers in the new **Managers** tab of the admin panel
  (name, email, password, branch).
* **A manager can**: see the classes, students, teachers, homework, chat and attendance of
  their branch; add / edit / delete students and award points; create / edit / delete classes
  (always inside their branch); create teachers (each gets a starter class in the branch) and
  edit / delete teachers who work only in that branch; mark attendance; post homework; chat.
* **A manager cannot**: see or touch another branch, move a class to another branch, set points
  or coins directly, use the rewards store, or manage other managers.
* Scoping is enforced on the server (`accessible_classrooms` in `core/api.py`), not just hidden in
  the UI. Tests: `ManagerTests` in `core/tests.py`.
* New migration `0010_manager` - run `python manage.py migrate` after deploying.
* Classes with no branch set are only visible to admins. Give existing classes a branch
  (Admin > Classrooms > edit) so the matching manager can see them.

---

# What was changed in this version

## Security (backend)
- CSRF protection is back on for every endpoint (it was disabled everywhere). The frontend now sends the token.
- Role checks added: previously any signed-in user (even a student) could change any password, award points, edit teachers, etc.
- Data is scoped per role: students only get their own class (no other emails), teachers only their own/shared classes.
- Students can only spend their own coins; chat sender is always the signed-in user; teachers can't touch other teachers' classes.
- No more default passwords ("password123"/"teacher123"); passwords are validated (min length, common-password check) and never trimmed.
- Public teacher sign-up disabled by default (`ALLOW_PUBLIC_SIGNUP`).
- Login throttling (10 failures/account, 30/IP per 15 min).
- SECRET_KEY is mandatory in production; no silent SQLite fallback; CORS removed (same-origin app); wildcard CSRF origin removed.
- Uploads: SVG blocked (script risk), content checked, 5 MB limit, random filenames.
- Server errors no longer leak exception text.
- Removed the legacy server-rendered templates and their unprotected endpoints (add-teacher, add-points, ...).
- Demo seed accounts only when `SEED_DEMO_DATA=True`; admin password generated if not set.

## Logic bugs fixed
- Admin: deleting a student / teacher / class threw `ReferenceError` (undefined setters), showing "Delete failed" after it had succeeded.
- Class sharing never worked (frontend sent an email, backend expected an id).
- Rejected orders could be re-approved, keeping the refund; delivered orders could be rejected for a refund; cancel always claimed "refunded".
- Admin "clear attendance for a day" without a class wiped every class; attendance now validated (date, status, enrolment).
- Student/Store pages fell back to *another* student's data when the profile wasn't found.
- Dates used UTC (wrong day around midnight); chat times showed UTC.
- Fake success: points/homework/chat reported success when the server failed; image-upload failure was silently ignored.
- Duplicate coin celebration and duplicate "cancelled" toast removed.
- Chat polling replaced other classes' messages; no more silent fallback to class "c-1".

## Frontend / deployment
- No more cached app state / demo passwords in the browser (localStorage removed); sign-in page no longer flashes for signed-in users.
- three.js is bundled and lazy-loaded (was a CDN script); main bundle 662 KB -> 343 KB. Unused server packages removed from package.json.
- Canonical/OG/sitemap/robots now use `SITE_URL` instead of a temporary AI Studio URL.
- `STATICFILES_STORAGE` (removed in Django 5.1) replaced by `STORAGES`; build.sh no longer hides migration failures.
- 54 automated backend tests (`python manage.py test core`).

---

## Round 3 – double alerts, store, images, chat

**Double "success + failed" alerts (root cause)** – confirm buttons stayed clickable while a request ran, so a
double click sent the same create/delete twice; the 2nd request failed on the server (duplicate email / already deleted)
and showed "failed" next to the real "success". Fixed with `src/utils/useGuard.js` (one action at a time, buttons disabled)
on every admin/teacher create/edit/delete. Also fixed: Unshare class, attendance notes, "mark all present" and "clear day"
showed a success alert even when saving failed. Identical alerts within 1 second are now shown once.

**Speed** – saves answer as soon as the server does (the full data refresh runs in the background); deletes disappear
instantly; a refresh asked for during another refresh is queued instead of dropped (stale lists); gunicorn runs 8 threads.

**Store** – category filters removed (admin catalog + student store); success alerts for add/edit/delete/hide reward.

**Images** – uploads are stored in the database (survive Render redeploys), served at `/uploads/products/...`; a broken
image falls back to the icon; picture preview in the reward form; students see the picture in "My Requests".
Run `python manage.py migrate` (migration 0009).

**Chat** – messages appear instantly and you can keep typing; refresh no longer drops/duplicates unsent messages;
new delete button (own messages; teachers/admins any message in their classes) – `DELETE /api/messages/<id>`.

## Round 4
- Removed the pre-rendered landing/FAQ page from index.html (it flashed before the app loaded); replaced by a small spinner. FAQ structured data removed too.
- Password may now equal the e-mail (similarity check removed; 8-character minimum and common/numeric checks kept).
- Passwords hashed with scrypt (about 3x faster than PBKDF2). Old passwords still work and upgrade at next login.

## Round 5 - security headers
- Content-Security-Policy added (scripts only from this site, no inline scripts, no frames, no plugins). The one inline script moved to public/canonical.js.
- HSTS raised from 7 days to 1 year. Permissions-Policy added. API responses get Cross-Origin-Resource-Policy and no-store.
- New core/middleware.py. CSP is enforced only when DEBUG is off, so the Vite dev server is unaffected.

## Round 6 - Vercel
- settings.py no longer crashes at start-up when the disk is read-only (uploads folder creation is optional).
- On Vercel, *.vercel.app hosts and origins are accepted automatically (fixes "Bad Request (400)" caused by per-deployment addresses).

## Round 5 – responsive design
- `src/index.css`: new responsive layer (tablet ≤900px, phone ≤640px, small phone ≤380px): compact nav (name/divider hidden, sign-out becomes an icon), scrollable tabs, full-width class tools, smaller headings/cards, 2-column admin stats, modals that scroll on short screens, full-width chat panel, FAB/toast no longer overlap.
- Orders tables (`StoreManagement`, `StudentStore`) had inline fixed grid columns that overflowed on phones; they now stack as cards (`rt-head` / `rt-row`).
- Two-column modal forms in `StoreManagement` collapse to one column on phones (`form-grid-2`).
