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
        <span className="badge">{note.visibility === 'private' ? 'Private' : 'Trip members'}</span>
      </div>
      <p className="muted">{linkLabel} · By {note.authorName} · Updated <time dateTime={note.updatedAt}>{new Date(note.updatedAt).toLocaleString()}</time></p>
      <p className="notes-text">{note.body}</p>
      {writable && <div className="actions">
        <button type="button" className="button secondary" disabled={busy || editingDisabled} onClick={onEdit}>Edit note</button>
        <button type="button" className="button ghost" disabled={busy || editingDisabled} onClick={() => setConfirmDelete(true)}>Delete note</button>
      </div>}
      {writable && confirmDelete && <div className="notes-confirm" role="group" aria-label={`Delete ${note.title}`}>
        <p>Delete this note and its comments? This cannot be undone.</p>
        <div className="actions">
          <button type="button" className="button danger" disabled={busy} onClick={() => {
            if (!busy) void command({ type: 'note.delete', id: note.id });
          }}>Confirm delete note</button>
          <button type="button" className="button secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep note</button>
        </div>
      </div>}
      <section className="stack" aria-label={`Comments on ${note.title}`}>
        <h3>Comments <span className="muted">{note.comments.length}</span></h3>
        {note.comments.length === 0 && <p className="muted">No comments yet.</p>}
        {note.comments.map((entry) => <div className="notes-comment" key={entry.id}>
          <p className="muted">{entry.authorName} · <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time></p>
          <p className="notes-text">{entry.body}</p>
        </div>)}
        {writable && <form className="stack" onSubmit={addComment}>
          <label className="field">Add a comment
            <textarea required rows={2} value={comment} disabled={busy} onChange={(e) => setComment(e.target.value)} />
          </label>
          <div className="actions"><button type="submit" className="button" disabled={busy || !comment.trim()}>Post comment</button></div>
        </form>}
      </section>
    </article>
  );
}
