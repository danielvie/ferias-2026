import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { MasterTrip } from '../../shared/model';
import { api, ApiError } from './api';
import { ModalPane } from '../components/ModalPane';

export function MasterKeyPane({ busy, error, onOpen, onDelete, onClose }: {
  busy: boolean;
  error: string;
  onOpen: (key: string, tripId: string) => Promise<boolean>;
  onDelete: (key: string, tripId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [key, setKey] = useState('');
  const [trips, setTrips] = useState<MasterTrip[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const [openingId, setOpeningId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const locked = useRef(false);
  const pending = loading || busy || Boolean(openingId) || Boolean(deletingId);
  useEffect(() => { if (trips !== null) heading.current?.focus(); }, [trips]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (locked.current || pending) return;
    locked.current = true;
    setLoading(true);
    setFailure('');
    setNotice('');
    try { setTrips(await api.masterTrips(key.trim())); }
    catch (cause) {
      setFailure(cause instanceof ApiError && cause.status === 401 ? 'Senha incorreta.' : 'Não foi possível carregar as viagens. Tente novamente.');
      if (cause instanceof ApiError && cause.status === 401) setKey('');
    } finally { locked.current = false; setLoading(false); }
  }
  async function open(tripId: string) {
    if (locked.current || pending) return;
    locked.current = true;
    setOpeningId(tripId);
    setFailure('');
    try {
      if (await onOpen(key.trim(), tripId)) {
        setKey('');
        onClose();
      }
    } finally { locked.current = false; setOpeningId(''); }
  }
  async function remove(trip: MasterTrip) {
    if (locked.current || pending || !window.confirm(
      `Excluir definitivamente "${trip.title}" [${trip.id.slice(0, 8)}]?\n\nAtividades, notas, listas e acessos desta viagem serão apagados do banco. Os acessos salvos neste navegador também serão removidos. Não é possível desfazer.`,
    )) return;
    locked.current = true;
    setDeletingId(trip.id);
    setFailure('');
    setNotice('');
    try {
      if (await onDelete(key.trim(), trip.id)) {
        setTrips(current => current?.filter(item => item.id !== trip.id) ?? null);
        setNotice(`Viagem "${trip.title}" excluída.`);
      } else setFailure('Não foi possível confirmar a exclusão. Tente novamente.');
    } finally { locked.current = false; setDeletingId(''); }
  }
  return <ModalPane title="Gerenciar todas as viagens" busy={pending} onClose={onClose}>
    <div className="stack" aria-busy={pending}>
      <p>{trips === null ? 'Digite a senha para ver as viagens salvas neste banco.' : 'Abra ou exclua uma das viagens salvas neste banco.'}</p>
      {trips === null ? <form className="stack" onSubmit={event => void unlock(event)}>
        <div className="field">
          <label htmlFor="master-key">Senha</label>
          <input id="master-key" type="password" value={key} autoComplete="off" autoCapitalize="none"
            spellCheck={false} required disabled={pending} autoFocus
            onChange={event => setKey(event.target.value)} aria-describedby="master-key-help" />
        </div>
        <p id="master-key-help" className="fine-print">Ao abrir uma viagem, ela ficará disponível em Minhas viagens neste navegador.</p>
        <div className="actions">
          <button className="button" disabled={pending}>{loading ? 'Carregando…' : 'Ver viagens'}</button>
          <button className="button secondary" type="button" disabled={pending} onClick={onClose}>Cancelar</button>
        </div>
      </form> : <>
        <h3 ref={heading} tabIndex={-1}>Viagens salvas</h3>
        {trips.length ? <ul className="remembered-trips" aria-label="Viagens salvas no banco">
          {trips.map(trip => <li key={trip.id} data-trip-id={trip.id}>
            <div className="remembered-trip-copy">
              <strong>{trip.title}</strong>
              <p>{trip.startDate} a {trip.endDate}</p>
              <p>{trip.ownerName} · organizador · {trip.id.slice(0, 8)}</p>
            </div>
            <div className="actions">
              <button className="button secondary" type="button" disabled={pending}
                aria-label={`${openingId === trip.id ? 'Abrindo' : 'Abrir'} ${trip.title}, ${trip.ownerName}, ${trip.id.slice(0, 8)}`}
                onClick={() => void open(trip.id)}>{openingId === trip.id ? 'Abrindo…' : 'Abrir viagem'}</button>
              <button className="button danger" type="button" disabled={pending}
                aria-label={`Excluir ${trip.title}, ${trip.id.slice(0, 8)}`} onClick={() => void remove(trip)}>
                {deletingId === trip.id ? 'Excluindo…' : 'Excluir viagem'}
              </button>
            </div>
          </li>)}
        </ul> : <p role="status">Nenhuma viagem salva neste banco ainda.</p>}
        <button className="button secondary" type="button" disabled={pending}
          onClick={() => { setKey(''); setTrips(null); setFailure(''); setNotice(''); }}>Voltar à senha</button>
      </>}
      {notice && <p role="status">{notice}</p>}
      {(failure || error) && <p className="inline-error" role="alert">{failure || error}</p>}
    </div>
  </ModalPane>;
}
