export function Dashboard({ busy, onDetails, onQuickStart }: { busy: boolean; onDetails: () => void; onQuickStart: () => void }) {
  return <section className="empty-itinerary">
    <p className="muted">Belgium, together</p>
    <h1>Itinerary</h1>
    <p>A place for each day of your trip.<br />Add your dates and cities, then make it yours.</p>
    <div className="actions">
      <button id="trip-details-button" className="button" disabled={busy} onClick={onDetails}>Add trip details</button>
      <button id="quick-start-button" className="button secondary" disabled={busy} onClick={onQuickStart}>{busy ? 'Creating sample trip…' : 'Quick start'}</button>
    </div>
    <p className="fine-print">Quick start creates a trip with sample details and activities. Nothing is booked.</p>
    <p className="fine-print">Already have a trip? Use Open trip link above.</p>
  </section>;
}
