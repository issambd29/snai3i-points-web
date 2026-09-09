# Snai3i Points Tracker

Full-stack gamified classroom rewards & points tracking application with React + Django + PostgreSQL.

## ⚙️ Render Deployment Settings

### Web Service Configuration:
- **Environment / Runtime**: `Python 3`
- **Build Command**: `chmod +x build.sh && ./build.sh`
- **Start Command**: `gunicorn school_project.wsgi:application`

### Environment Variables:
- `DATABASE_URL`: *(Your Internal PostgreSQL Connection URL from Render)*
- `SECRET_KEY`: *(Generate a long random string — e.g. `python -c "import secrets; print(secrets.token_urlsafe(50))"` — and keep it private. Never reuse the placeholder from `.env.example`.)*
- `DEBUG`: `False`
- `PYTHON_VERSION`: `3.11.9`
- `ADMIN_EMAIL`: *(the email address for the first admin account)*
- `ADMIN_USERNAME`: *(optional — defaults to `admin`)*
- `ADMIN_PASSWORD`: *(a strong, unique password — set this explicitly. If left unset, a weak development default is used, which is not safe for a real deployment.)*

> ⚠️ **Security note:** `core/management/commands/createadmin.py` falls back to `admin@snai3i.com` / `password123` when `ADMIN_EMAIL` / `ADMIN_PASSWORD` are not set, purely so local development works out of the box. **Always set `ADMIN_EMAIL` and `ADMIN_PASSWORD` explicitly in your Render (or other host) environment variables before going live**, and change them immediately if the app was ever deployed without them set. The same applies to `SECRET_KEY` — never deploy with the fallback value baked into `settings.py`.

## Local development

```bash
# Backend
pip install -r requirements.txt
python manage.py migrate
python manage.py createadmin   # seeds an admin + sample data using ADMIN_EMAIL/ADMIN_PASSWORD env vars if set
python manage.py runserver

# Frontend (in a separate terminal)
npm install
npm run dev
```

The Vite dev server proxies to the Django API; for a production-like build, run `npm run build` so Django serves the compiled app from `dist/`.

## Security checklist before going live
- [ ] Set a unique `SECRET_KEY` (never the fallback in `settings.py`)
- [ ] Set `ADMIN_EMAIL` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` to real, strong values
- [ ] Set `DEBUG=False`
- [ ] Set `CSRF_TRUSTED_ORIGINS` to your real domain(s) once known
- [ ] Confirm the app is served over HTTPS (Render provides this automatically)
