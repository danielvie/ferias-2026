import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page } from '../../shared/model';
import { CalendarPage } from '../features/calendar/CalendarPage';
import { PlacesPage } from '../features/places/PlacesPage';
import { NotesPage } from '../features/notes/NotesPage';
import { ChecklistsPage } from '../features/checklists/ChecklistsPage';
import { SharingPage } from '../features/sharing/SharingPage';
import { TripContext, type NavigationGuard } from './TripContext';
import { useTripSession } from './useTripSession';
import { AppShell } from './AppShell';
import { Dashboard } from './Dashboard';
import { TripDetailsForm, type TripDetailsInput } from './TripDetailsForm';
import { OpenTripForm } from './OpenTripForm';
import { ModalPane } from '../components/ModalPane';
import { MemberPane } from './MemberPane';
import { TripsList } from './TripsList';
import { tripIdentity } from './remembered-trips';

export function App() {
  const session = useTripSession();
  const [page, setPage] = useState<Page>('today');
  const [activePanel, setActivePanel] = useState<'details' | 'link' | 'member' | 'trips' | 'create' | null>(null);
  const [setupHint, setSetupHint] = useState('');
  const [copied, setCopied] = useState(false);
  const main = useRef<HTMLElement>(null);
  const guards = useRef(new Map<string, NavigationGuard>());
  const formPanel = activePanel && activePanel !== 'member' && activePanel !== 'trips';
  const registerNavigationGuard = useCallback((id: string, guard: NavigationGuard | null) => {
    if (guard) guards.current.set(id, guard);
    else guards.current.delete(id);
  }, []);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (guards.current.size || session.busy || formPanel) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [session.busy, formPanel]);
  function canLeave() {
    const blocking = [...guards.current.values()].find((guard) => guard.blocking);
    if (session.busy || blocking) {
      window.alert(blocking?.message || 'Wait for the current save to finish before leaving.');
      return false;
    }
    if (formPanel) return window.confirm('Leave this form? Unsaved changes will be lost.');
    const guard = [...guards.current.values()][0];
    return !guard || window.confirm(guard.message);
  }
  function openPanel(panel: 'details' | 'link' | 'member' | 'trips' | 'create') {
    if (activePanel === panel) {
      document.querySelector<HTMLInputElement>('.details-panel input')?.focus();
      return;
    }
    if (!canLeave()) return;
    session.dismissError();
    setSetupHint('');
    setActivePanel(panel);
  }
  function closePanel() {
    setActivePanel(null);
    setSetupHint('');
    session.dismissError();
    requestAnimationFrame(() => document.getElementById('trip-details-button')?.focus());
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
    if (snapshot && activePanel !== 'create') {
      saved = await session.command({ type: 'trip.update', trip: {
        title: details.title, startDate: details.startDate, endDate: details.endDate, cities: details.cities,
      } });
    } else saved = await session.create({ ...details, cities: details.cities.map((city) => city.name) });
    if (saved) { setActivePanel(null); setSetupHint(''); setPage('today'); }
  }
  async function join(token: string) {
    if (await session.join(token)) { setActivePanel(null); setSetupHint(''); setPage('today'); }
  }
  async function openTrip(id: string) {
    if (!canLeave()) return;
    if (await session.resume(id)) {
      setActivePanel(null);
      setPage('today');
      requestAnimationFrame(() => { main.current?.focus(); window.scrollTo({ top: 0 }); });
    }
  }
  async function forgetTrip(id: string) {
    const entry = session.remembered.find(item => item.id === id);
    if (!entry || (snapshot && tripIdentity(snapshot) === id && !canLeave())) return;
    if (!window.confirm(`Forget ${entry.title} for ${entry.memberName} on this browser? This removes saved access, not the trip.`)) return;
    if (await session.forget(id) && snapshot && tripIdentity(snapshot) === id) {
      setActivePanel(null);
      setPage('today');
    }
  }
  async function copyRecovery() {
    try { await navigator.clipboard.writeText(session.recoveryLink); setCopied(true); }
    catch { setCopied(false); }
  }
  async function logout() {
    if (!canLeave()) return;
    if (session.recoveryLink && !window.confirm('Have you saved your private owner link? You will need it to reopen this trip after exiting.')) return;
    await session.logout();
    setPage('today');
    setActivePanel(null);
  }
  const detailsPanel = formPanel && <ModalPane title={activePanel === 'link' ? 'Open trip link' : activePanel === 'create' ? 'New trip' : snapshot ? 'Trip settings' : 'Trip details'}
    busy={session.busy} onClose={() => { if (canLeave()) closePanel(); }}>
    {setupHint && activePanel === 'details' && <p className="setup-hint" role="status">{setupHint}</p>}
    {(activePanel === 'details' || activePanel === 'create') && <TripDetailsForm
      key={activePanel === 'create' ? 'new-trip' : snapshot?.data.trip.id ?? 'new-trip'}
      trip={activePanel === 'create' ? undefined : snapshot?.data.trip} busy={session.busy}
      error={session.error} onSave={saveDetails} onCancel={closePanel} />}
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
    {session.recoveryLink && <section className="recovery-banner" aria-label="Save your private owner link">
      <div className="panel-header"><strong>Save your private owner link</strong><button className="button ghost" onClick={session.dismissRecovery}>I've saved it</button></div>
      <p>This link gives full owner access. Keep it private; use Share to invite other people.</p>
      <div className="actions"><label className="visually-hidden" htmlFor="owner-link">Private owner recovery link</label><input id="owner-link" readOnly value={session.recoveryLink} onFocus={(event) => event.currentTarget.select()} /><button className="button secondary" onClick={() => void copyRecovery()}>{copied ? 'Copied' : 'Copy owner link'}</button></div>
    </section>}
    {snapshot ? <fieldset className="trip-content" disabled={session.accessLost}>
      <legend className="visually-hidden">Trip workspace</legend>
      {FeaturePage ? <FeaturePage /> : <CalendarPage />}
    </fieldset> : session.remembered.length > 0 ?
      <section className="stack"><h1>Your trips</h1>{trips}</section> : <Dashboard onDetails={() => openPanel('details')} />}
    {detailsPanel}
    {memberPanel}
    {tripsPanel}
  </AppShell>;
  return snapshot
    ? <TripContext key={tripIdentity(snapshot)} value={{ snapshot, canEdit, busy: session.busy, command: session.command, refresh: session.refresh, navigate, registerNavigationGuard, onOwnerLinkReplaced: session.dismissRecovery }}>{shell}</TripContext>
    : shell;
}
