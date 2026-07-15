import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';

const host = '127.0.0.1';
const port = 1420;
const url = `http://${host}:${port}/Helvetic_Freight_v1.1.38_CleanApp.html`;

function commandExists(command) {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

async function pickPython() {
  for (const command of ['python3', 'python', 'py']) {
    if (await commandExists(command)) return command;
  }
  throw new Error('Python 3 was not found. Install Python 3 or start a static server on port 1420 manually.');
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timeoutMs = 10_000;

    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on('error', retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(check, 250);
    };

    check();
  });
}

const python = await pickPython();
const serverArgs = python === 'py'
  ? ['-3', '-m', 'http.server', String(port), '--bind', host]
  : ['-m', 'http.server', String(port), '--bind', host];

const server = spawn(python, serverArgs, {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false
});

server.stdout.on('data', (chunk) => process.stdout.write(`[static] ${chunk}`));
server.stderr.on('data', (chunk) => process.stderr.write(`[static] ${chunk}`));

const cleanup = () => {
  if (!server.killed) server.kill();
};
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

await waitForServer();
console.log(`Static game server is ready at ${url}`);

const tauri = spawn('tauri', ['dev'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

tauri.on('error', (error) => {
  cleanup();
  console.error(error.message);
  process.exit(1);
});

const [code, signal] = await once(tauri, 'exit');
cleanup();

if (signal) process.kill(process.pid, signal);
process.exit(code ?? 0);
