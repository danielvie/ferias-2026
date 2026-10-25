import type { ReactNode, RefObject } from 'react';
import type { Member, Page } from '../../shared/model';

const navigation: { id: Page; label: string }[] = [
  { id: 'today', label: 'Itinerary' },
  { id: 'places', label: 'Places' }, { id: 'notes', label: 'Notes' },
  { id: 'checklists', label: 'Checklists' }, { id: 'sharing', label: 'Share' },
];

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
  const visibleNav = member?.role === 'family'
    ? navigation.filter((item) => ['today', 'calendar', 'places'].includes(item.id))
    : navigation;
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-group">
          <button className="brand" onClick={() => onNavigate('today')}>Belgium, together</button>
          {member && <button className="member-label" onClick={onMember} disabled={busy}
            aria-label={`Your profile: ${member.name}, ${member.role}`} title={`${member.name} · ${member.role}`}>
            <span className="member-name">{member.name}</span><span className="member-role">· {member.role}</span>
          </button>}
        </div>
        <nav className="topnav" aria-label="Main navigation">
          {visibleNav.map((item) => <button key={item.id} className="nav-item"
            aria-current={page === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}>{item.label}</button>)}
        </nav>
        <div className="session-controls">
          <button id="trip-switcher-button" className="button ghost" onClick={onTrips} disabled={busy}>Trips</button>
          {member ? <>
            {canEdit && <button id="trip-settings-button" className="button secondary" onClick={onSettings} disabled={busy}>Settings</button>}
            <button className="button ghost" onClick={onRefresh} disabled={busy}>Refresh</button>
            <button className="button ghost" onClick={onExit} disabled={busy} aria-label="Close this trip session">Exit</button>
          </> : <button className="button ghost" onClick={onOpenLink} disabled={busy}>Open trip link</button>}
        </div>
      </header>
      <main id="main-content" ref={mainRef} tabIndex={-1} className="main-content">{children}</main>
      <footer className="workspace-footer"><span>{busy ? 'Saving…' : member ? 'Changes are saved on this server.' : 'Add your trip details here when you are ready.'}</span><span>Times in Europe/Brussels · Costs in EUR</span></footer>
    </div>
  </>;
}
