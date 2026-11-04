import { useId, useRef, useState, type FormEvent } from 'react';
import type { City } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';
import { useNavigationGuard } from '../../app/useNavigationGuard';
import type { RouteActions } from './RouteBoard';
import { newPlace } from './suggestions';

export function QuickAddActivity({ city, disabled, onFullForm }: {
  city: City; disabled: boolean; onFullForm: RouteActions['addActivity'];
}) {
  const { canEdit, busy, command } = useTrip();
  // Keep the same ID on retry, including when a response is lost after a save.
  const [draft, setDraft] = useState(() => newPlace(city.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const submitting = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const blocked = disabled || busy || saving || !canEdit;
  useNavigationGuard(busy || saving);

  function clearDraft() {
    setDraft(newPlace(city.id));
    setError('');
    setMessage('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || submitting.current || !draft.title.trim()) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const title = draft.title.trim();
      if (await command({ type: 'place.save', place: { ...draft, title } })) {
        clearDraft();
        setMessage(`${title} salva como ideia em ${city.name}. Nada foi agendado.`);
      } else {
        setError('Seu rascunho foi mantido. Confira a mensagem da viagem e tente novamente.');
      }
    } finally {
      submitting.current = false;
      setSaving(false);
      requestAnimationFrame(() => input.current?.focus());
    }
  }

  return <form className="checkpoint-quick-add" onSubmit={submit} aria-label={`Adicionar ideia em ${city.name}`}>
    <fieldset className="places-form-fields" disabled={blocked}>
      <legend className="visually-hidden">Adicionar ideia rapidamente</legend>
      <label htmlFor={`${id}-title`}>Nova ideia</label>
      <div className="quick-add-controls">
        <input ref={input} id={`${id}-title`} name="title" required maxLength={200}
          placeholder={`O que gostaria de fazer em ${city.name}?`} value={draft.title}
          aria-describedby={`${id}-hint`} onChange={event => {
            setDraft(current => ({ ...current, title: event.target.value }));
            setError(''); setMessage('');
          }} />
        <button className="button secondary" type="submit" disabled={!draft.title.trim()}>
          {saving ? 'Salvando…' : 'Adicionar'}
        </button>
        <button className="button ghost" type="button" id={`checkpoint-add-${city.id}`}
          onClick={event => onFullForm(draft, event.currentTarget, clearDraft)}>Mais detalhes</button>
      </div>
      <p className="quick-add-hint" id={`${id}-hint`}>Salva uma ideia em {city.name}, sem agendar.</p>
    </fieldset>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <p className="quick-add-status" role="status">{message}</p>
  </form>;
}
