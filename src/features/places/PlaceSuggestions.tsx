import { useRef, useState } from 'react';
import { useTrip } from '../../app/TripContext';
import { newPlace, suggestionCity, suggestions } from './suggestions';

export function PlaceSuggestions({ formOpen, cityId }: { formOpen: boolean; cityId: string }) {
  const { snapshot, canEdit, busy, command } = useTrip();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const submitting = useRef(false);
  const available = suggestions.flatMap(suggestion => {
    const city = suggestionCity(suggestion, snapshot.data.trip.cities.filter(city => city.id === cityId));
    if (!city || snapshot.data.places.some(place => place.cityId === city.id &&
      place.title.trim().toLowerCase() === suggestion.title.toLowerCase())) return [];
    return [{ suggestion, city }];
  });
  if (!canEdit || available.length === 0) return null;

  return (
    <section className="panel stack" aria-labelledby="place-suggestions">
      <div><p className="eyebrow">A few starting points</p><h2 id="place-suggestions">Ideas, not bookings</h2>
        <p className="muted">These examples are not in your trip until you save them. Check opening hours, prices and availability.</p></div>
      <ul className="place-suggestions">
        {available.map(({ suggestion, city }) => <li key={suggestion.title}>
          <div><h3>{suggestion.title}</h3><p className="muted">{city.name} · {suggestion.durationMinutes} minutes, suggested</p></div>
          <button className="button secondary" type="button" disabled={busy || saving || formOpen}
            aria-label={`Save suggestion: ${suggestion.title}`}
            onClick={async () => {
              if (busy || submitting.current) return;
              submitting.current = true;
              setSaving(true);
              try {
                const { title, category, description, durationMinutes } = suggestion;
                if (await command({
                  type: 'place.save',
                  place: { ...newPlace(city.id), title, category, description, durationMinutes },
                })) setMessage(`${title} saved as an idea.`);
              } finally {
                submitting.current = false;
                setSaving(false);
              }
            }}>Save suggestion</button>
        </li>)}
      </ul>
      <p role="status">{message}</p>
    </section>
  );
}
