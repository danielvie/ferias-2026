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
  if (!canEdit || (available.length === 0 && !message)) return null;

  return (
    <section className="checkpoint-ideas" aria-label="Activity ideas">
      {available.length > 0 && <>
      <h3>Activity ideas</h3>
      <ul className="place-suggestions" aria-label="Suggested activities">
        {available.map(({ suggestion, city }) => <li key={suggestion.title}>
          <button className="button secondary" type="button" disabled={busy || saving || formOpen}
            aria-label={`Save suggestion: ${suggestion.title}`}
            title={`${suggestion.description} ${suggestion.durationMinutes} minutes, suggested. Saves an idea, not a booking.`}
            onClick={async event => {
              if (busy || formOpen || submitting.current) return;
              const input = event.currentTarget.closest('#checkpoint-details')?.querySelector<HTMLInputElement>('.checkpoint-quick-add input');
              submitting.current = true;
              setSaving(true);
              try {
                const { title, category, description, durationMinutes } = suggestion;
                if (await command({
                  type: 'place.save',
                  place: { ...newPlace(city.id), title, category, description, durationMinutes },
                })) {
                  setMessage(`${title} saved as an idea.`);
                  requestAnimationFrame(() => input?.focus());
                }
              } finally {
                submitting.current = false;
                setSaving(false);
              }
            }}>+ {suggestion.title}</button>
        </li>)}
      </ul>
      </>}
      <p className="checkpoint-ideas-status" role="status">{message}</p>
    </section>
  );
}
