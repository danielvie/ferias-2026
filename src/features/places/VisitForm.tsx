import { useId, useRef, useState, type FormEvent } from 'react';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { useNavigationGuard } from '../../app/useNavigationGuard';

export function VisitForm({ beforeId, onClose, onSaved }: {
  beforeId: string | null; onClose: () => void; onSaved: (name: string, id: string) => void;
}) {
  const { snapshot, command, busy, canEdit } = useTrip();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const visitId = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const id = useId();
  useNavigationGuard(busy || saving);
  const cities = snapshot.data.trip.cities;
  const repeated = cities.some(city => city.name.toLowerCase() === name.trim().toLowerCase());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || busy || submitting.current || !canEdit) return;
    submitting.current = true;
    setSaving(true);
    try {
      if (await command({ type: 'visit.add', visit: { id: visitId.current, name: name.trim() }, beforeId })) {
        onSaved(name.trim(), visitId.current);
      }
    } finally { submitting.current = false; setSaving(false); }
  }

  return <section className="panel stack" aria-labelledby={`${id}-heading`}>
    <div><h2 id={`${id}-heading`}>Adicionar parada</h2>
      <p className="muted">{beforeId ? `Inserir antes de ${visitLabel(cities, beforeId)}.` : 'Adicionar ao final da rota.'} Uma nova parada começa sem atividades.</p></div>
    <form onSubmit={submit}>
      <fieldset className="places-form-fields stack" disabled={busy || saving || !canEdit}>
        <legend className="visually-hidden">Detalhes da parada</legend>
        <div className="field"><label htmlFor={`${id}-city`}>Nome da cidade</label>
          <input id={`${id}-city`} autoFocus required maxLength={100} value={name} placeholder="Ex.: Bruxelas"
            onChange={event => setName(event.target.value)} />
          <small>{repeated ? 'Esta cidade já está na rota. Será criada uma nova passagem, sem duplicar atividades.' :
            'Vai voltar a uma cidade? Pode usar o mesmo nome.'}</small></div>
        <div className="actions">
          <button className="button" type="submit">{saving ? 'Adicionando…' : 'Adicionar parada'}</button>
          <button className="button secondary" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </fieldset>
    </form>
  </section>;
}
