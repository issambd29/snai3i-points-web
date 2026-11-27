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

---

## Leaderboard

New **Leaderboard** tab for admins, branch managers and teachers (`src/components/Leaderboard.jsx`):
top-3 podium, full ranked student list (rank, class, branch, points, coins), totals, search, filter by
class (and by branch for admins), rank by points or coins. Tied scores share a rank. No backend change:
the data is already scoped by role on the server (admin = all, manager = own branch, teacher = own/shared classes).

---

## Student ranks, one shop per branch, QR vouchers

**Student ranks.** The student dashboard shows a *Branch Rank* (among students of their branch) and a
*Global Rank* (all branches). Calculated on the server, so students never receive other students' data.
Tied points share a rank.

**One shop per branch.** Products now belong to a branch (`Product.branch`).
- A branch manager gets a *Branch Shop* tab: add, edit, hide and remove rewards of their own shop only.
- Students only see (and can only buy from) their own branch's shop.
- The admin sees every shop, filters by branch, and picks the shop when adding a reward.
  A reward with no branch ("All branches") is shared by every shop and is managed by the admin.
- Redemption requests belong to the student's branch; the admin or that branch's manager can approve/reject.

**QR vouchers.** When a request is approved the student gets a *Show QR* button with a one-use QR voucher.
Admins and managers have a *Scan Voucher* tab (camera scanner, or paste the code): it shows the reward,
student, class and branch, and *Confirm hand-over* marks it delivered. The server rejects used,
cancelled or other-branch vouchers (the admin can scan any branch).

Technical notes
- Migrations `0011` (fields) and `0012` (gives existing orders their student's branch).
- New endpoints: `POST /api/store/voucher/lookup`, `POST /api/store/voucher/redeem`.
- `Permissions-Policy` now allows the camera for this site (`camera=(self)`); the scanner needs HTTPS (or localhost).
- New npm packages: `qrcode`, `jsqr` (run `npm install`). 20 new backend tests.

---

## Absence table, Excel export, move classrooms, points reset

- **Absence table** (new *Absence* tab for teachers, branch managers and admins; `AbsenceReport.jsx`):
  per-student absences, attendance rate and last absence, with filters by branch (admin), class and period
  (7 / 30 / 90 days / all recorded), search and sorting. Click a row to see every absence date (with the
  note, and "excused"). By default only students with absences are listed. Absent + excused count as
  absences; present + late count as present. Each role only sees what the server already allows.
- **Export to Excel**: *Export Excel* button (admin/manager Students tab, teacher class bar) downloads an
  `.xlsx` with **Name, Email, Points** for the students currently shown (so it follows the class filter and search).
  File name: `students-<class>-<date>.xlsx`. New npm package: `write-excel-file`.
- **Move a classroom between teachers**: the *edit teacher* window (Teachers tab) now lists the teacher's
  classrooms, each with a *Move to…* menu, plus *Give this teacher another classroom…*. Managers can only
  move classes inside their own branch. (The server rule already existed; 5 new tests cover it.)
- **Points inputs reset**: after +Add / −Sub the number box goes back to the default (1), for admin, manager and teacher.

---

## Styled Excel export, class-ordered lists, session notes

- **Styled export** (*Export Excel*): amber title bar, navy header, banded rows, highlighted points, frozen
  header. Rows keep the order of the list on screen. (Import from Excel was tried and removed again.)
- **Student list ordered by classroom**: the admin/manager Students tab is grouped class by class
  (natural order, so "G2" comes before "G10"), students A–Z inside each class. It stays in place when
  points change. A student in several classes is listed once, under the first class by name.
- **Notes for each student and session** (Presence & Attendance tab): a note can be added for any status
  (present, absent, late, excused); *Add note* is offered once the student is marked, so a note can no longer
  mark someone present by accident. Enter saves, Escape cancels, up to 500 characters.
  - Notes are no longer lost: changing a status or using *Mark All Present* keeps the existing note.
  - **Absence table** now has a *Latest note* column; expanding a student lists every note with its date,
    status and author. Students with notes are listed even without absences (search also looks in notes).
- **Student page**: the "Out of N students…" lines are gone, and the server no longer sends those totals
  to students at all (`localTotal` / `globalTotal` removed). Ranks show only the position.
- Tests: +9 (notes, rank privacy); the import tests were removed with the import.

---

## Notes table (all notes, month by month)

- New **Notes** tab for admins, branch managers and teachers (`NotesTable.jsx`). It lists **every** note a teacher
  wrote for a student, with its date, status (present / absent / late / excused), class, branch (admin) and
  who wrote it — not only the latest note.
- **Month strip** with the number of notes per month ("Aug 1 · Sep 3 · Oct 6 · Nov 8"), previous/next arrows,
  and an *All months* view. Filters: branch (admin), class, status, and a search that also looks inside notes
  (Arabic works). Click a student's name to see all of that student's notes across every month.
- Each role only sees what the server already allows (admin = all, manager = own branch, teacher = own classes).
  Notes cover the last 12 months, the same window as attendance. Works on phones too.
- No server change: it uses the attendance data the app already loads.

---

## IMPORTANT FIX: removing a teacher no longer deletes anything else

**The bug.** `Classroom.teacher` was set to *cascade*, so deleting a teacher deleted every classroom they owned,
and each classroom in turn deleted its attendance (the notes), homework and chat. `Homework.created_by` and
`ChatMessage.sender` cascaded from the teacher too, so even homework and messages in other classes disappeared.

**The fix (database level, migration `0013`).**
- `Classroom.teacher` → `SET_NULL`: the classroom stays, with "No teacher" until one is assigned
  (students, attendance, notes, homework and chat are untouched).
- `Homework.created_by` and `ChatMessage.sender` → `SET_NULL`: homework and messages stay.
- The author's **name (and role for chat) is saved with each message / homework** (`sender_name`, `sender_role`,
  `created_by_name`), so "Karim Teacher" is still shown after the account is gone. Existing rows are filled in by the migration.
- Because it is in the database relations, it also protects every other way of deleting (Django admin, shell, future code).
- API: `DELETE /api/teachers/<id>` reports how many classrooms were kept (the delete confirmation itself stays short:
  no extra note). Classrooms without a teacher work everywhere (admin/manager/student views, chat, homework,
  attendance); they can only be edited by admins/managers, who can assign a new teacher in the class editor.
- Deleting a *student* still removes that student and their own records (attendance, orders, chat messages) only.
  Deleting a *classroom* is still a deliberate action that removes its content; its confirmation now says so.
- Tests: +12 (reproduced the bug first, then fixed). Migration verified on a database filled in the old schema.

**Dropdowns are alphabetical**: classes, teachers, branches, specialties, reward categories/icons and statuses.

---

## Branch filter on the admin Students tab

- Administrators get a **branch dropdown** (A–Z, with the number of students per branch) before the class dropdown.
  Choosing a branch shows only that branch's students and narrows the class dropdown to that branch's classes;
  changing branch resets the class filter. *Export Excel* and *Add Student* follow the filter. Branch managers
  already work inside one branch, so they do not get it.
- The "Only the teacher account is removed…" note was removed from the delete-teacher confirmation (the protection
  itself is unchanged).
