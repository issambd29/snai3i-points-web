import { spawn, execSync } from 'child_process';
import path from 'path';

console.log('🚀 Starting Snai3i Full-Stack Environment: React Frontend + Django Backend + PostgreSQL...');

// Ensure Python dependencies are available
function ensurePythonDependencies() {
  try {
    execSync('python3 -c "import django, dj_database_url, corsheaders, psycopg2"', { stdio: 'ignore' });
    return true;
  } catch (err) {
    console.log('[Setup] Installing required Python packages...');
    try {
      try {
        execSync('which pip3', { stdio: 'ignore' });
      } catch (_) {
        execSync('DEBIAN_FRONTEND=noninteractive apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" python3-pip', { stdio: 'inherit' });
      }
      execSync('pip3 install --break-system-packages -r requirements.txt', { stdio: 'inherit' });
      console.log('[Setup] Python packages installed successfully.');
      return true;
    } catch (installErr) {
      console.error('[Setup] Warning: could not install Python packages automatically:', installErr.message);
      return false;
    }
  }
}

ensurePythonDependencies();

let djangoProcess = null;
let viteProcess = null;
let isShuttingDown = false;

// Spawn Vite frontend dev server on port 3000 FIRST so port 3000 is immediately responsive
function startVite() {
  const viteBin = path.join(process.cwd(), 'node_modules', '.bin', 'vite');
  viteProcess = spawn(viteBin, ['--host', '0.0.0.0', '--port', '3000'], {
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
}

// Spawn Django backend server on 127.0.0.1:8001 with auto-restart on unexpected exit
function startDjango() {
  if (isShuttingDown) return;

  djangoProcess = spawn('python3', ['manage.py', 'runserver', '127.0.0.1:8001', '--noreload'], {
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
    if (!isShuttingDown) {
      console.log('[Django] Restarting Django in 3 seconds...');
      setTimeout(startDjango, 3000);
    }
  });
}

function cleanup() {
  isShuttingDown = true;
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

startVite();
startDjango();

