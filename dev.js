import { spawn } from 'child_process';

console.log('🚀 Starting Snai3i Full-Stack Environment: React Frontend + Django Backend + PostgreSQL...');

// Spawn Django backend server on 127.0.0.1:8001
const djangoProcess = spawn('python3', ['manage.py', 'runserver', '127.0.0.1:8001'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env, PYTHONUNBUFFERED: '1' },
});

djangoProcess.stdout.on('data', (data) => {
  process.stdout.write(`[Django] ${data}`);
});

djangoProcess.stderr.on('data', (data) => {
  process.stderr.write(`[Django] ${data}`);
});

djangoProcess.on('error', (err) => {
  console.error('[Django] Failed to start Django server:', err);
});

djangoProcess.on('close', (code) => {
  console.log(`[Django] Process exited with code ${code}`);
  process.exit(code || 0);
});

// Spawn Vite frontend dev server on port 3000 (proxies /api to Django on port 8001)
const viteProcess = spawn('npx', ['vite', '--host', '0.0.0.0', '--port', '3000'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env },
});

viteProcess.stdout.on('data', (data) => {
  process.stdout.write(`[Vite] ${data}`);
});

viteProcess.stderr.on('data', (data) => {
  process.stderr.write(`[Vite] ${data}`);
});

viteProcess.on('error', (err) => {
  console.error('[Vite] Failed to start Vite server:', err);
});

viteProcess.on('close', (code) => {
  console.log(`[Vite] Process exited with code ${code}`);
  cleanup();
  process.exit(code || 0);
});

function cleanup() {
  if (djangoProcess && !djangoProcess.killed) {
    try {
      djangoProcess.kill('SIGTERM');
    } catch (_) {}
  }
  if (viteProcess && !viteProcess.killed) {
    try {
      viteProcess.kill('SIGTERM');
    } catch (_) {}
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

process.on('exit', () => {
  cleanup();
});
