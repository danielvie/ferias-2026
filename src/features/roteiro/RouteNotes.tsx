import { useState } from 'react';
import { useTrip } from '../../app/TripContext';
import { ModalPane } from '../../components/ModalPane';
import { Icon } from '../../components/Icon';
import { NoteCard } from '../notes/NoteCard';
import { NoteForm } from '../notes/NoteForm';
import { notesForDay } from './selection';
import '../notes/notes.css';

export function RouteNotes({ date, cityId }: { date: string; cityId?: string }) {
  const { snapshot, canEdit, busy, navigate } = useTrip();
  const [noteId, setNoteId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const visible = snapshot.data.notes.filter(note => note.visibility === 'trip' || note.authorId === snapshot.session.id);
  const notes = notesForDay({ ...snapshot.data, notes: visible }, date, cityId);
  const selected = visible.find(note => note.id === noteId);
  if (snapshot.session.role === 'family') return null;
  const close = () => { setNoteId(null); setEditing(false); };
  return <section className="roteiro-notes" aria-labelledby="roteiro-notes-title">
    <div className="roteiro-section-heading"><h2 id="roteiro-notes-title"><Icon name="notes" /> Para lembrar</h2>
      <button className="button ghost" disabled={busy} onClick={() => navigate('notes')}>Todas as notas</button></div>
    {notes.length ? <ul>{notes.map(note => <li key={note.id}>
      <button disabled={busy} onClick={() => { setNoteId(note.id); setEditing(false); }}>
        <span><strong>{note.title}</strong><small>{note.visibility === 'private' ? 'Só você' : 'Compartilhada'} · {note.linkType === 'day' ? 'Neste dia' : note.linkType === 'city' ? 'Nesta parada' : 'Na atividade'}</small></span>
        <Icon name="arrow" />
      </button>
    </li>)}</ul> : <p className="muted">Nenhuma nota vinculada a este dia ou parada.</p>}
    {noteId && <ModalPane title={selected?.title ?? 'Nota indisponível'} onClose={close} busy={busy}>
      {selected ? editing && canEdit ? <NoteForm key={selected.id} note={selected} onClose={() => setEditing(false)} /> :
        <NoteCard note={selected} linkLabel="Nota do roteiro" writable={canEdit}
          editingDisabled={false} onEdit={() => setEditing(true)} /> : <p>Esta nota não está mais disponível para seu acesso.</p>}
    </ModalPane>}
  </section>;
}
