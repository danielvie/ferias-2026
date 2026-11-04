import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { MasterKeyPane } from './MasterKeyPane';
import { TripsList } from './TripsList';

test('offers the database list even when this browser remembers no trips', () => {
  const html = renderToStaticMarkup(<TripsList entries={[]} currentId={null} busy={false}
    onOpen={() => {}} onForget={() => {}} onOpenLink={() => {}} onCreate={() => {}} onMasterKey={() => {}} />);
  expect(html).toContain('Gerenciar todas as viagens');
  expect(html).toContain('Nenhuma viagem lembrada');
});

test('asks for a password without embedding the configured value in the page', () => {
  const html = renderToStaticMarkup(<MasterKeyPane busy={false} error="" onOpen={async () => true} onDelete={async () => true} onClose={() => {}} />);
  expect(html).toContain('Gerenciar todas as viagens');
  expect(html).toContain('type="password"');
  expect(html).toContain('Senha');
  expect(html).toContain('Ver viagens');
  expect(html).toContain('value=""');
  expect(html).not.toContain('Use master key');
});
