import { execFileSync, spawnSync } from 'node:child_process';

// Supabase publishes ports without a host address. Set a project-scoped Docker
// default instead of changing the user's daemon or exposing Studio to the LAN.
// https://docs.docker.com/engine/network/drivers/bridge/#default-host-binding-address
const network = 'supabase_network_ferias-2026';
const option = 'com.docker.network.bridge.host_binding_ipv4';
const inspected = spawnSync('docker', ['network', 'inspect', network, '--format', '{{json .Options}}'], { encoding: 'utf8' });
if (inspected.error) throw inspected.error;

if (inspected.status === 0) {
  if (JSON.parse(inspected.stdout)?.[option] !== '127.0.0.1') {
    throw new Error('The Supabase network is not localhost-only. Run task db:stop, then task db:start. No network was changed.');
  }
} else {
  execFileSync('docker', [
    'network', 'create', '--driver', 'bridge',
    '--label', 'com.supabase.cli.project=ferias-2026',
    '--opt', `${option}=127.0.0.1`, network,
  ], { stdio: 'pipe' });
}
console.log('Local Supabase network is restricted to 127.0.0.1.');
