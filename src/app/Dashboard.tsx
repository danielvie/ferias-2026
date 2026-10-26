export function Dashboard({ onDetails, onQuickStart }: { onDetails: () => void; onQuickStart: () => void }) {
  return <section className="empty-itinerary">
    <p className="muted">Belgium, together</p>
    <h1>Itinerary</h1>
    <p>A place for each day of your trip.<br />Add your dates and cities, then make it yours.</p>
    <div className="actions">
      <button id="trip-details-button" className="button" onClick={onDetails}>Add trip details</button>
      <button id="quick-start-button" className="button secondary" onClick={onQuickStart}>Quick start</button>
    </div>
    <p className="fine-print">Quick start fills sample details for a new trip. Review them before saving.</p>
    <p className="fine-print">Already have a trip? Use Open trip link above.</p>
  </section>;
}
