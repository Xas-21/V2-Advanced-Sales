/**
 * Cross-platform dev API: runs uvicorn from backend/ using venv Python when present.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const backendDir = path.join(repoRoot, 'backend');
const win = process.platform === 'win32';
const venvPython = win
    ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
    : path.join(backendDir, 'venv', 'bin', 'python');
const python = fs.existsSync(venvPython) ? venvPython : win ? 'python' : 'python3';

const proc = spawn(
    python,
    ['-m', 'uvicorn', 'main:app', '--reload', '--host', '127.0.0.1', '--port', '8000'],
    {
        cwd: backendDir,
        stdio: 'inherit',
        env: { ...process.env },
        shell: false,
    }
);
proc.on('exit', (code) => process.exit(code ?? 1));
