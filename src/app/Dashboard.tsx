export function Dashboard({ onDetails }: { onDetails: () => void }) {
  return <section className="empty-itinerary">
    <p className="muted">Belgium, together</p>
    <h1>Itinerary</h1>
    <p>A place for each day of your trip.<br />Add your dates and cities, then make it yours.</p>
    <button id="trip-details-button" className="button" onClick={onDetails}>Add trip details</button>
    <p className="fine-print">Already have a trip? Use Open trip link above.</p>
  </section>;
}
