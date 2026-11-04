import { useState, type FormEvent } from 'react';
import type { Note } from '../../../shared/model';
import { useTrip } from '../../app/TripContext';

export function NoteCard({ note, linkLabel, writable, editingDisabled, onEdit }: {
  note: Note; linkLabel: string; writable: boolean; editingDisabled: boolean; onEdit: () => void;
}) {
  const { command, busy } = useTrip();
  const [comment, setComment] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!comment.trim() || busy) return;
    if (await command({ type: 'note.comment', id: note.id, body: comment.trim() })) setComment('');
  }

  return (
    <article className="panel stack">
      <div className="panel-header">
        <h2>{note.title}</h2>
        <span className="badge">{note.visibility === 'private' ? 'Privada' : 'Grupo da viagem'}</span>
      </div>
      <p className="muted">{linkLabel} · Por {note.authorName} · Atualizada em <time dateTime={note.updatedAt}>{new Date(note.updatedAt).toLocaleString('pt-BR', { timeZone: 'Europe/Brussels' })}</time></p>
      <p className="notes-text">{note.body}</p>
      {writable && <div className="actions">
        <button type="button" className="button secondary" disabled={busy || editingDisabled} onClick={onEdit}>Editar nota</button>
        <button type="button" className="button ghost" disabled={busy || editingDisabled} onClick={() => setConfirmDelete(true)}>Excluir nota</button>
      </div>}
      {writable && confirmDelete && <div className="notes-confirm" role="group" aria-label={`Excluir ${note.title}`}>
        <p>Excluir esta nota e seus comentários? Não é possível desfazer.</p>
        <div className="actions">
          <button type="button" className="button danger" disabled={busy} onClick={() => {
            if (!busy) void command({ type: 'note.delete', id: note.id });
          }}>Confirmar exclusão</button>
          <button type="button" className="button secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Manter nota</button>
        </div>
      </div>}
      <section className="stack" aria-label={`Comentários em ${note.title}`}>
        <h3>Comentários <span className="muted">{note.comments.length}</span></h3>
        {note.comments.length === 0 && <p className="muted">Nenhum comentário ainda.</p>}
        {note.comments.map((entry) => <div className="notes-comment" key={entry.id}>
          <p className="muted">{entry.authorName} · <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString('pt-BR', { timeZone: 'Europe/Brussels' })}</time></p>
          <p className="notes-text">{entry.body}</p>
        </div>)}
        {writable && <form className="stack" onSubmit={addComment}>
          <label className="field">Adicionar comentário
            <textarea required rows={2} value={comment} disabled={busy} onChange={(e) => setComment(e.target.value)} />
          </label>
          <div className="actions"><button type="submit" className="button" disabled={busy || !comment.trim()}>Enviar comentário</button></div>
        </form>}
      </section>
    </article>
  );
}
