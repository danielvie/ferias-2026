import { execFileSync, spawnSync } from 'node:child_process';
import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn(), spawnSync: vi.fn() }));
const networkScript = '../scripts/prepare-supabase-network.mjs';
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

test('creates only the project network with loopback binding', async () => {
  vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '' } as ReturnType<typeof spawnSync>);
  await import(networkScript);
  expect(execFileSync).toHaveBeenCalledWith('docker', [
    'network', 'create', '--driver', 'bridge', '--label', 'com.supabase.cli.project=ferias-2026',
    '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', 'supabase_network_ferias-2026',
  ], { stdio: 'pipe' });
});

test('reuses an existing loopback-only network', async () => {
  vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '{"com.docker.network.bridge.host_binding_ipv4":"127.0.0.1"}' } as ReturnType<typeof spawnSync>);
  await import(networkScript);
  expect(execFileSync).not.toHaveBeenCalled();
});

test('refuses to start on an existing network that exposes ports', async () => {
  vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '{}' } as ReturnType<typeof spawnSync>);
  await expect(import(networkScript)).rejects.toThrow('not localhost-only');
  expect(execFileSync).not.toHaveBeenCalled();
});
