#!/usr/bin/env bash
# Render build script: install, build the React app, collect static files, migrate.
set -o errexit

echo "Installing Python dependencies..."
pip install -r requirements.txt

echo "Installing Node dependencies and building the React frontend..."
npm ci
npm run build

echo "Collecting static files..."
python manage.py collectstatic --no-input

# These must succeed: a half-migrated database should fail the deploy, not hide behind "|| true".
echo "Applying database migrations..."
python manage.py migrate --no-input

echo "Ensuring the admin account and default rewards exist..."
python manage.py createadmin
