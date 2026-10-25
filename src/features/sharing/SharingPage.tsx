import { useTrip } from '../../app/TripContext';
import { isOnlineBackend } from '../../app/api';
import { OwnerSharing } from './OwnerSharing';
import './sharing.css';

const roleDescriptions = {
  owner: 'You own this trip. You can manage plans and choose who has access.',
  editor: 'You are an editor. You can change plans, write notes and manage checklists. Only the owner can invite people or revoke access.',
  viewer: 'You are a viewer. You can read trip content and shared notes, but cannot edit or comment. Only the owner can manage access.',
  family: 'You are using family mode. You can read the selected, limited event and place details, plus the always-shared trip title, full dates and all city names. Notes, checklists and exact stays are excluded. Only the owner can manage access.',
};

export function SharingPage() {
  const { snapshot } = useTrip();
  return (
    <div className="stack sharing-page">
      <header className="page-heading">
        <div><p className="eyebrow">People and permissions</p><h1>Sharing</h1><p className="muted">{roleDescriptions[snapshot.session.role]}</p></div>
      </header>
      <section className="panel stack">
        <h2>{isOnlineBackend ? 'Private links, no sign-in' : 'Links need a reachable server'}</h2>
        <p>{isOnlineBackend ? 'The frontend can run on GitHub Pages while Supabase stores the trip and checks access. Links use this website address. A localhost link still works only on your computer.' : "Invitation links use this website's origin. The app and its API must be deployed together on the same origin, and the recipient must be able to reach that server. A localhost link will not work remotely."}</p>
        <p>Give each traveler a separate link. People using the same link share one identity and can see that identity's private notes. The owner creates and can replace these links. Names are labels, not verified accounts.</p>
        <p className="muted">Use HTTPS before sharing publicly. Keep links private: anyone holding a link gets its role. Access rules and family redaction are enforced by the server.</p>
      </section>
      {snapshot.session.role === 'owner' && <OwnerSharing key={`${snapshot.data.trip.id}:${snapshot.session.id}`} />}
    </div>
  );
}
