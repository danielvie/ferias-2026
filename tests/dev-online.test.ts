import { execFileSync, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn(), spawn: vi.fn() }));
const runner = '../scripts/dev-online.mjs';
const originalExitCode = process.exitCode;
let children: ReturnType<typeof child>[];

function child(pid: number) {
  return Object.assign(new EventEmitter(), { pid, exitCode: null, signalCode: null, kill: vi.fn() });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  // Importing the runner must not install real signal handlers in the test worker.
  vi.spyOn(process, 'on').mockReturnValue(process);
  children = [child(1234), child(5678)];
  vi.mocked(execFileSync).mockImplementation((_command, args) =>
    (args as string[]).includes('status') ? '{"PUBLISHABLE_KEY":"local-test-key"}' : '');
  vi.mocked(spawn).mockImplementation(() => children[vi.mocked(spawn).mock.calls.length - 1] as unknown as ReturnType<typeof spawn>);
});

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

test('runs pinned CLI entrypoints with Node, keeping hosted configuration out of local development', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://hosted.example.invalid');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'hosted-test-key');
  try {
    await import(runner);
    const statusCall = vi.mocked(execFileSync).mock.calls.find(([, args]) => (args as string[]).includes('status'))!;
    expect(statusCall[0]).toBe(process.execPath);
    const calls = vi.mocked(spawn).mock.calls;
    expect(calls).toHaveLength(2);
    for (const [executable, args, options] of calls) {
      expect(executable).toBe(process.execPath);
      expect(existsSync((args as string[])[0])).toBe(true);
      expect(options).not.toHaveProperty('shell');
      expect(options).toMatchObject({ env: {
        VITE_BACKEND: 'supabase', VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'local-test-key', SUPABASE_TELEMETRY_DISABLED: '1',
      } });
    }
    expect(calls[0][1]).toEqual([statusCall[1]![0], 'functions', 'serve', 'trip-api']);
    expect(calls[1][1]).toEqual([expect.stringMatching(/vite[/\\]bin[/\\]vite\.js$/), '--host', '127.0.0.1', '--strictPort']);
  } finally {
    vi.unstubAllEnvs();
  }
});

test('reports a launch failure and stops the other development processes', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  await import(runner);
  children[0].emit('error', new Error('launch failed'));
  expect(error).toHaveBeenCalledWith('Development process failed to start:', 'launch failed');
  expect(process.exitCode).toBe(1);
  if (process.platform === 'win32') {
    for (const child of children) {
      expect(execFileSync).toHaveBeenCalledWith('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    }
  } else {
    for (const child of children) expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  }
  const cleanupCalls = vi.mocked(execFileSync).mock.calls.length;
  children[1].emit('exit', 0);
  expect(process.exitCode).toBe(1);
  expect(vi.mocked(execFileSync).mock.calls).toHaveLength(cleanupCalls);
});
