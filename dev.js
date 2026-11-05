// Local development: Vite (port 3000) + Django (port 8001). Vite proxies /api to Django.
import { spawn, execSync } from 'child_process';
import path from 'path';

const PYTHON = process.env.PYTHON || 'python3';

function ensurePythonDependencies() {
  try {
    execSync(`${PYTHON} -c "import django, dj_database_url, whitenoise"`, { stdio: 'ignore' });
  } catch {
    console.log('[Setup] Installing Python packages from requirements.txt ...');
    execSync(`${PYTHON} -m pip install -r requirements.txt`, { stdio: 'inherit' });
  }
}

function applyMigrations() {
  execSync(`${PYTHON} manage.py migrate --no-input`, { stdio: 'inherit', env: djangoEnv });
  execSync(`${PYTHON} manage.py createadmin`, { stdio: 'inherit', env: djangoEnv });
}

// Local development defaults; a real environment / .env file still wins.
const djangoEnv = { DEBUG: 'True', ...process.env, PYTHONUNBUFFERED: '1' };

ensurePythonDependencies();
applyMigrations();

const children = [];
let shuttingDown = false;

function run(name, command, args, env = process.env) {
  const child = spawn(command, args, { stdio: ['inherit', 'pipe', 'pipe'], env });
  child.stdout.on('data', (data) => process.stdout.write(`[${name}] ${data}`));
  child.stderr.on('data', (data) => process.stderr.write(`[${name}] ${data}`));
  child.on('error', (err) => console.error(`[${name}] failed to start:`, err));
  child.on('close', (code) => {
    console.log(`[${name}] exited with code ${code}`);
    shutdown(code || 0);
  });
  children.push(child);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach((child) => {
    if (!child.killed) child.kill('SIGTERM');
  });
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('Starting Snai3i: React (http://localhost:3000) + Django (http://127.0.0.1:8001)');
run('Vite', path.join(process.cwd(), 'node_modules', '.bin', 'vite'), ['--host', '0.0.0.0', '--port', '3000']);
run('Django', PYTHON, ['manage.py', 'runserver', '127.0.0.1:8001', '--noreload'], djangoEnv);
