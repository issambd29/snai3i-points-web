# Snai3i Points Tracker

Gamified student points, coins, homework, attendance and classroom chat for teachers, students and administrators.

## Features

- **Points & coins:** teachers award/deduct points; every 10 points earns a coin.
- **Rewards store:** students redeem coins; administrators approve, reject (automatic refund) or deliver.
- **Role dashboards:** administrator, teacher (with co-teacher class sharing) and student views.
- **Attendance, homework and live class chat.**
- **Unified alerts:** one toast system for success and error feedback.

## Tech stack

- **Frontend:** React 18, Vite, Tailwind CSS 4, Lucide icons, canvas-confetti, three.js (lazy-loaded)
- **Backend:** Django 5.2 JSON API (session auth + CSRF), WhiteNoise, Gunicorn
- **Database:** PostgreSQL (production) / SQLite (local)

## Local development

```bash
cp .env.example .env        # then edit it (set ADMIN_PASSWORD, optionally SEED_DEMO_DATA=True)
pip install -r requirements.txt
npm install
npm run dev                 # Vite on :3000 + Django on :8001 (migrates and creates the admin first)
```

Run the backend tests with `DEBUG=True python manage.py test core`.

## Deploying to Render

`render.yaml` and `build.sh` are preconfigured (Postgres, build, migrate, health check).

1. Push to GitHub and create a **Blueprint** on Render from `render.yaml`.
2. Set `ADMIN_EMAIL`, and `SITE_URL` (your public URL, used for canonical/SEO tags).
3. Read the generated `ADMIN_PASSWORD` in the service's *Environment* tab and sign in.

Notes: uploaded reward images live on the service's disk, which Render wipes on each deploy on the free
plan - attach a persistent disk or move uploads to object storage for production use. Public teacher
sign-up is off by default (`ALLOW_PUBLIC_SIGNUP`); administrators create teacher and student accounts.
