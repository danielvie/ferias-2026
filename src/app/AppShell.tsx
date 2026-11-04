import type { ReactNode, RefObject } from 'react';
import type { Member, Page } from '../../shared/model';
import { Icon } from '../components/Icon';

const navigation: { id: Page; label: string }[] = [
  { id: 'today', label: 'Roteiro' }, { id: 'notes', label: 'Notas' }, { id: 'checklists', label: 'Listas' },
];
const roles = { owner: 'Organizador', editor: 'Participante', viewer: 'Leitor', family: 'Família' };

interface Props {
  page: Page;
  member?: Member;
  busy: boolean;
  mainRef: RefObject<HTMLElement | null>;
  onNavigate: (page: Page) => void;
  onRefresh: () => void;
  onExit: () => void;
  onOpenLink: () => void;
  onSettings: () => void;
  onMember: () => void;
  onTrips: () => void;
  canEdit: boolean;
  children: ReactNode;
}

export function AppShell({ page, member, busy, mainRef, onNavigate, onRefresh, onExit, onOpenLink, onSettings, onMember, onTrips, canEdit, children }: Props) {
  const activePage = page === 'places' || page === 'calendar' ? 'today' : page;
  const visibleNav = member?.role === 'family' ? navigation.slice(0, 1) : navigation;
  return <>
    <a className="skip-link" href="#main-content">Ir para o conteúdo</a>
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-group">
          <button className="brand" onClick={() => onNavigate('today')}><Icon name="brand" /> de férias<span>.</span></button>
          {member && <button className="member-label" onClick={onMember} disabled={busy}
            aria-label={`Seu perfil: ${member.name}, ${roles[member.role]}`}>
            <span className="member-name">{member.name}</span><span className="member-role">· {roles[member.role]}</span>
          </button>}
        </div>
        <nav className="topnav" aria-label="Navegação principal">
          {visibleNav.map(item => <button key={item.id} className="nav-item" disabled={busy}
            aria-current={activePage === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}>{item.label}</button>)}
        </nav>
        <div className="session-controls">
          {canEdit && <button className="button secondary" aria-current={page === 'sharing' ? 'page' : undefined}
            disabled={busy} onClick={() => onNavigate('sharing')}><Icon name="sharing" />Compartilhar</button>}
          <details className="trip-menu" onKeyDown={event => {
            if (event.key === 'Escape') {
              event.currentTarget.open = false;
              event.currentTarget.querySelector('summary')?.focus();
            }
          }}>
            <summary onClick={event => { if (busy) event.preventDefault(); }} aria-disabled={busy}>Viagem</summary>
            <div className="trip-menu-items">
              <button id="trip-switcher-button" className="button ghost" onClick={onTrips} disabled={busy}>Minhas viagens</button>
              {member ? <>
                {canEdit && <button id="trip-settings-button" className="button ghost" onClick={onSettings} disabled={busy}>Configurações</button>}
                <button className="button ghost" onClick={onRefresh} disabled={busy}>Atualizar planos</button>
                <button className="button ghost" onClick={onExit} disabled={busy}>Sair desta viagem</button>
              </> : <button className="button ghost" onClick={onOpenLink} disabled={busy}>Abrir convite</button>}
            </div>
          </details>
        </div>
      </header>
      <main id="main-content" ref={mainRef} tabIndex={-1} className="main-content">{children}</main>
      <footer className="workspace-footer"><span>{busy ? 'Salvando…' : member ? 'Alterações salvas no servidor.' : 'Adicione os detalhes para começar.'}</span><span>Horários locais · Europe/Brussels · Valores em EUR</span></footer>
    </div>
  </>;
}
