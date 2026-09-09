#!/usr/bin/env bash
# exit on error
set -o errexit

echo "Installing Python dependencies..."
pip install -r requirements.txt

# If Node/npm is present on Render, build the modern React frontend
if command -v npm &> /dev/null; then
  echo "Installing Node dependencies and building React frontend..."
  npm install
  npm run build
fi

echo "Ensuring static directories exist..."
mkdir -p staticfiles/assets core/static/assets

if [ -d "dist/assets" ]; then
  echo "Copying compiled React assets..."
  cp -r dist/assets/* staticfiles/assets/ 2>/dev/null || true
  cp -r dist/assets/* core/static/assets/ 2>/dev/null || true
fi

echo "Collecting static files..."
python manage.py collectstatic --no-input

echo "Applying database migrations (if database is available)..."
python manage.py migrate --no-input || true

echo "Ensuring superuser is configured..."
python manage.py createadmin || true


