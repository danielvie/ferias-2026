import { useState } from 'react';
import type { Note } from '../../../shared/model';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { NoteCard } from './NoteCard';
import { NoteForm } from './NoteForm';
import './notes.css';

export function NotesPage() {
  const { snapshot, canEdit, busy } = useTrip();
  const { notes, trip, places } = snapshot.data;
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('all');
  const [linkType, setLinkType] = useState('all');
  const [editing, setEditing] = useState<Note | 'new' | null>(null);
  const eligible = notes.filter((note) => snapshot.session.role !== 'family'
    && (note.visibility === 'trip' || note.authorId === snapshot.session.id));
  const matches = eligible.filter((note) => (visibility === 'all' || note.visibility === visibility)
    && (linkType === 'all' || note.linkType === linkType)
    && `${note.title} ${note.body} ${note.authorName}`.toLowerCase().includes(query.trim().toLowerCase()));

  function linkLabel(note: Note) {
    if (note.linkType === 'city') return `Parada: ${visitLabel(trip.cities, note.linkId)}`;
    if (note.linkType === 'place') return `Atividade: ${places.find((place) => place.id === note.linkId)?.title ?? 'Atividade removida'}`;
    if (note.linkType === 'day') return `Dia: ${note.linkId}`;
    return trip.title;
  }

  return (
    <div className="stack notes-page">
      <header className="page-heading">
        <div><p className="eyebrow">Caderno da viagem</p><h1>Notas</h1><p className="muted">Guarde detalhes para você ou compartilhe com o grupo.</p></div>
        {canEdit && <button type="button" className="button" disabled={busy || editing !== null} onClick={() => setEditing('new')}>Nova nota</button>}
      </header>
      {!canEdit && <p className="muted">Somente leitura. Você pode consultar as notas disponíveis para seu acesso.</p>}
      {canEdit && editing !== null && <NoteForm key={editing === 'new' ? 'new' : editing.id}
        note={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <div className="toolbar">
        <label className="field">Buscar notas
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Título, texto ou autor" />
        </label>
        <label className="field">Visibilidade
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="all">Todas as notas disponíveis</option><option value="private">Minhas notas privadas</option><option value="trip">Notas do grupo</option>
          </select>
        </label>
        <label className="field">Vinculada a
          <select value={linkType} onChange={(e) => setLinkType(e.target.value)}>
            <option value="all">Tudo</option><option value="trip">Viagem</option><option value="city">Parada</option>
            <option value="place">Atividade</option><option value="day">Dia</option>
          </select>
        </label>
      </div>
      <p className="muted" role="status">{matches.length} {matches.length === 1 ? 'nota' : 'notas'}</p>
      {matches.length === 0 && <div className="empty-state">{eligible.length ? 'Nenhuma nota corresponde aos filtros.' : 'Nenhuma nota disponível ainda.'}</div>}
      {matches.map((note) => <NoteCard key={note.id} note={note} linkLabel={linkLabel(note)}
        writable={canEdit && (note.visibility === 'trip' || note.authorId === snapshot.session.id)}
        editingDisabled={editing !== null}
        onEdit={() => setEditing(note)} />)}
    </div>
  );
}
