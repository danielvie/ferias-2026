import { useCallback, useRef, useState } from 'react';
import type { Page } from '../../shared/model';
import { CalendarPage } from '../features/calendar/CalendarPage';
import { PlacesPage } from '../features/places/PlacesPage';
import { NotesPage } from '../features/notes/NotesPage';
import { ChecklistsPage } from '../features/checklists/ChecklistsPage';
import { SharingPage } from '../features/sharing/SharingPage';
import { TripContext } from './TripContext';
import { useTripSession } from './useTripSession';
import { AppShell } from './AppShell';
import { Dashboard } from './Dashboard';
import { TripDetailsForm, type TripDetailsInput } from './TripDetailsForm';
import { OpenTripForm } from './OpenTripForm';
import { ModalPane } from '../components/ModalPane';
import { MemberPane } from './MemberPane';
import { TripsList } from './TripsList';
import { tripIdentity } from './remembered-trips';
import { JoinTripPane } from './JoinTripPane';
import { OwnerRecovery } from '../features/sharing/OwnerRecovery';
import { isOnlineBackend } from './api';
import { quickStartTrip } from './quick-start';
import { useTripPage } from './useTripPage';

type Panel = 'details' | 'link' | 'member' | 'trips' | 'create' | 'quick-start';

export function App() {
  const session = useTripSession();
  const [page, setPage] = useTripPage(session.snapshot);
  const [activePanel, setActivePanel] = useState<Panel | null>(null);
  const [quickStart, setQuickStart] = useState<TripDetailsInput>();
  const [setupHint, setSetupHint] = useState('');
  const [copied, setCopied] = useState(false);
  const main = useRef<HTMLElement>(null);
  const guards = useRef(new Set<string>());
  const formPanel = activePanel && activePanel !== 'member' && activePanel !== 'trips';
  const registerNavigationGuard = useCallback((id: string, active: boolean) => {
    if (active) guards.current.add(id);
    else guards.current.delete(id);
  }, []);
  function canLeave() {
    return !session.busy && guards.current.size === 0;
  }
  function openPanel(panel: Panel) {
    if (activePanel === panel) {
      document.querySelector<HTMLInputElement>('.details-panel input')?.focus();
      return;
    }
    if (!canLeave()) return;
    session.dismissError();
    setSetupHint('');
    setActivePanel(panel);
  }
  function openQuickStart() {
    if (!canLeave()) return;
    setQuickStart(quickStartTrip());
    openPanel('quick-start');
  }
  function closePanel() {
    const focusId = activePanel === 'quick-start' ? 'quick-start-button' : 'trip-details-button';
    setActivePanel(null);
    setSetupHint('');
    session.dismissError();
    requestAnimationFrame(() => document.getElementById(focusId)?.focus());
  }
  function navigate(destination: Page) {
    // Existing feature callers still use 'calendar'; there is now one itinerary.
    const next = destination === 'calendar' ? 'today' : destination;
    if (!session.snapshot && next !== 'today') {
      openPanel('details');
      setSetupHint('Save your trip details here to start adding plans, notes and travel checks.');
      return;
    }
    if (next === page || !canLeave()) return;
    setActivePanel(null);
    setPage(next);
    requestAnimationFrame(() => { main.current?.focus(); window.scrollTo({ top: 0 }); });
  }
  const error = session.error && <div className="global-error" role="alert"><span>{session.error}</span><button className="button ghost" onClick={session.dismissError}>Dismiss</button></div>;
  if (session.loading) return <main className="loading-screen" aria-busy="true"><span className="brand">BELGIUM</span><p role="status">Opening your trip…</p></main>;
  const { snapshot } = session;
  const family = snapshot?.session.role === 'family';
  const canEdit = snapshot?.session.role === 'owner' || snapshot?.session.role === 'editor';
  const currentTripId = snapshot && !session.accessLost ? tripIdentity(snapshot) : null;
  const safePage = !snapshot || (family && !['today', 'calendar', 'places'].includes(page)) ? 'today' : page;
  const pages = { calendar: CalendarPage, places: PlacesPage, notes: NotesPage, checklists: ChecklistsPage, sharing: SharingPage };
  const FeaturePage = safePage === 'today' ? null : pages[safePage];
  async function saveDetails(details: TripDetailsInput) {
    let saved: boolean;
    if (snapshot && activePanel !== 'create' && activePanel !== 'quick-start') {
      saved = await session.command({ type: 'trip.update', trip: {
        title: details.title, startDate: details.startDate, endDate: details.endDate, cities: details.cities,
      } });
    } else saved = await session.create({ ...details, cities: details.cities.map((city) => city.name) });
    if (saved) { setActivePanel(null); setSetupHint(''); }
  }
  async function join(token: string, kind: 'access' | 'join' = 'access') {
    if (kind === 'join') {
      setActivePanel(null);
      if (await session.openJoinLink(token)) { setSetupHint(''); }
    } else if (await session.join(token)) { setActivePanel(null); setSetupHint(''); }
  }
  async function joinTrip(name: string) {
    if (await session.joinTrip(name)) {
      setActivePanel(null); setSetupHint('');
      requestAnimationFrame(() => { main.current?.focus(); window.scrollTo({ top: 0 }); });
    }
  }
  async function openTrip(id: string) {
    if (!canLeave()) return;
    if (await session.resume(id)) {
      setActivePanel(null);
      requestAnimationFrame(() => { main.current?.focus(); window.scrollTo({ top: 0 }); });
    }
  }
  async function forgetTrip(id: string) {
    const entry = session.remembered.find(item => item.id === id);
    if (!entry || (snapshot && tripIdentity(snapshot) === id && !canLeave())) return;
    if (await session.forget(id) && snapshot && tripIdentity(snapshot) === id) {
      setActivePanel(null);
    }
  }
  async function copyRecovery() {
    try { await navigator.clipboard.writeText(session.recoveryLink); setCopied(true); }
    catch { setCopied(false); }
  }
  async function logout() {
    if (!canLeave()) return;
    await session.logout();
    setActivePanel(null);
  }
  const ownerLink = session.recoveryLink && <section className="recovery-banner" aria-label="Private owner recovery link">
    <p>This link opens your owner identity on another browser. Use Share to invite people instead.</p>
    <div className="actions"><label className="visually-hidden" htmlFor="owner-link">Private owner recovery link</label><input id="owner-link" readOnly value={session.recoveryLink} onFocus={(event) => event.currentTarget.select()} /><button className="button secondary" onClick={() => void copyRecovery()}>{copied ? 'Copied' : 'Copy owner link'}</button></div>
  </section>;
  const detailsPanel = formPanel && <ModalPane title={activePanel === 'link' ? 'Open trip link' : activePanel === 'quick-start' ? 'Quick start' : activePanel === 'create' ? 'New trip' : snapshot ? 'Trip settings' : 'Trip details'}
    busy={session.busy} onClose={() => { if (canLeave()) closePanel(); }}>
    {setupHint && activePanel === 'details' && <p className="setup-hint" role="status">{setupHint}</p>}
    {(activePanel === 'details' || activePanel === 'create' || activePanel === 'quick-start') && <TripDetailsForm
      key={activePanel === 'quick-start' ? 'quick-start' : activePanel === 'create' ? 'new-trip' : snapshot?.data.trip.id ?? 'new-trip'}
      trip={activePanel === 'create' || activePanel === 'quick-start' ? undefined : snapshot?.data.trip}
      initial={activePanel === 'quick-start' ? quickStart : undefined} busy={session.busy}
      error={session.error} onSave={saveDetails} onCancel={closePanel} />}
    {activePanel === 'details' && snapshot?.session.role === 'owner' && (ownerLink || isOnlineBackend) &&
      <details className="owner-recovery">
        <summary>Private owner recovery</summary>
        <div className="stack">{ownerLink}{isOnlineBackend && <OwnerRecovery />}</div>
      </details>}
    {activePanel === 'link' && <OpenTripForm busy={session.busy} error={session.error} onJoin={join} onCancel={closePanel} />}
  </ModalPane>;
  const memberPanel = activePanel === 'member' && snapshot && <ModalPane title="Your profile"
    busy={session.busy} onClose={() => { if (canLeave()) closePanel(); }}>
    <MemberPane key={snapshot.session.id} member={snapshot.session} revision={snapshot.revision}
      busy={session.busy} error={session.error} onSave={session.rename} onCancel={closePanel} onExpired={session.refresh} />
  </ModalPane>;
  const trips = <TripsList entries={session.remembered} currentId={currentTripId} busy={session.busy}
    onOpen={id => void openTrip(id)} onForget={id => void forgetTrip(id)}
    onOpenLink={() => openPanel('link')} onCreate={() => openPanel('create')} />;
  const tripsPanel = activePanel === 'trips' && <ModalPane title="Your trips" busy={session.busy} onClose={closePanel}>
    {error}
    {session.storageWarning && <p role="status" className="places-warning">{session.storageWarning}</p>}
    {trips}
  </ModalPane>;
  const shell = <AppShell page={safePage} member={snapshot?.session} busy={session.busy} mainRef={main} canEdit={Boolean(canEdit && !session.accessLost)}
    onMember={() => openPanel('member')} onSettings={() => openPanel('details')} onNavigate={navigate}
    onTrips={() => openPanel('trips')}
    onRefresh={() => void session.refresh()} onExit={() => void logout()} onOpenLink={() => openPanel('link')}>
    {(!activePanel || (activePanel === 'member' && !snapshot)) && error}
    {!activePanel && session.storageWarning && <p role="status" className="places-warning">{session.storageWarning}</p>}
    {session.pendingAccess && <section className="access-retry" aria-label="Retry trip link"><p>The link is kept in memory while this page stays open. Retry when your connection is back.</p><button className="button secondary" disabled={session.busy} onClick={() => void join(session.pendingAccess)}>Retry opening trip</button></section>}
    {snapshot ? <fieldset className="trip-content" disabled={session.accessLost}>
      <legend className="visually-hidden">Trip workspace</legend>
      {FeaturePage ? <FeaturePage /> : <CalendarPage />}
    </fieldset> : session.remembered.length > 0 ?
      <section className="stack"><h1>Your trips</h1>{trips}</section> : <Dashboard onDetails={() => openPanel('details')} onQuickStart={openQuickStart} />}
    {detailsPanel}
    {memberPanel}
    {tripsPanel}
    {session.pendingJoin && <JoinTripPane key={session.pendingJoin.token} trip={session.pendingJoin.trip}
      busy={session.busy} error={session.error} onJoin={joinTrip}
      onRetry={() => void session.openJoinLink(session.pendingJoin!.token)} onCancel={session.cancelJoin} />}
  </AppShell>;
  return snapshot
    ? <TripContext key={tripIdentity(snapshot)} value={{ snapshot, canEdit, busy: session.busy, command: session.command, refresh: session.refresh, navigate, registerNavigationGuard, onOwnerLinkReplaced: session.dismissRecovery }}>{shell}</TripContext>
    : shell;
}
