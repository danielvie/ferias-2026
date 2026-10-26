import { useEffect, useState } from 'react';
import type { ChangeTarget, HistoryPage } from '../../shared/model';
import { api, ApiError } from './api';

const types: Record<ChangeTarget['type'], string> = {
  trip: 'Trip', place: 'Place', event: 'Event', note: 'Note', comment: 'Comment',
  packing: 'Packing item', checklist: 'Checklist', 'checklist-item': 'Checklist item',
  departure: 'Departure', 'departure-check': 'Departure check', member: 'Member', link: 'Member link',
};
const dateTime = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Brussels',
});

export function HistoryList({ onExpired }: { onExpired: () => Promise<void> }) {
  const [page, setPage] = useState<HistoryPage>({ items: [], before: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  function failed(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 401) {
      setError('Your session expired or its link was revoked. Open a current trip link to continue.');
      void onExpired();
    } else setError(cause instanceof Error ? cause.message : 'Could not load history. Try again.');
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setPage({ items: [], before: null });
    void api.history().then((next) => { if (active) setPage(next); })
      .catch((cause: unknown) => { if (active) failed(cause); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);
  async function older() {
    if (loading || !page.before) return;
    setLoading(true);
    setError('');
    try {
      const next = await api.history(page.before);
      setPage((previous) => ({ items: [...previous.items, ...next.items], before: next.before }));
    } catch (cause) { failed(cause); }
    finally { setLoading(false); }
  }
  return <section className="history-section" aria-labelledby="history-heading">
    <div className="panel-header">
      <h3 id="history-heading">Change history</h3>
      <button className="button ghost" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Reload history</button>
    </div>
    <p className="fine-print">Newest first · Times in Europe/Brussels. Tracking starts with this feature; older changes may not have a record.</p>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {page.items.length > 0 && <ol className="history-list" aria-label="Recorded changes">
      {page.items.map((record) => <li key={record.id}>
        <p><strong title={`Member ${record.actorId}`}>{record.actorName}</strong> {record.action} {types[record.target.type].toLowerCase()}</p>
        {!['note', 'comment'].includes(record.target.type) && <p className="history-target">{record.target.label}</p>}
        <p className="fine-print"><time dateTime={record.at}>{dateTime.format(new Date(record.at))}</time></p>
        <details className="history-reference">
          <summary>Record details</summary>
          <dl>
            <dt>Member ID</dt><dd>{record.actorId}</dd>
            <dt>{types[record.target.type]} ID</dt><dd>{record.target.id}</dd>
            {record.target.parentId && <><dt>Parent ID</dt><dd>{record.target.parentId}</dd></>}
            <dt>Change group</dt><dd>{record.operationId}</dd>
          </dl>
        </details>
      </li>)}
    </ol>}
    {loading && <p className="fine-print" role="status">Loading history…</p>}
    {!loading && !error && page.items.length === 0 && <p className="empty-state">No recorded changes yet.</p>}
    {page.before && <button className="button secondary" disabled={loading} onClick={() => void older()}>Load older changes</button>}
  </section>;
}
