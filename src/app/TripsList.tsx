import type { RememberedTrip } from './remembered-trips';

export function TripsList({ entries, currentId, busy, onOpen, onForget, onOpenLink, onCreate, onMasterKey }: {
  entries: RememberedTrip[]; currentId: string | null; busy: boolean;
  onOpen: (id: string) => void; onForget: (id: string) => void;
  onOpenLink: () => void; onCreate: () => void;
  onMasterKey?: () => void;
}) {
  return <div className="stack trips-list">
    <p className="muted">Viagens que você já abriu neste navegador.</p>
    {entries.length ? <ul className="remembered-trips" aria-label="Viagens lembradas">
      {entries.map(entry => <li key={entry.id}>
        <div className="remembered-trip-copy">
          <strong>{entry.title}</strong>
          <p>{entry.startDate} a {entry.endDate}</p>
          <p>{entry.memberName} · {entry.role}</p>
          {!entry.credential && <p className="remembered-trip-invalid">Acesso indisponível. Abra um convite ou use Gerenciar todas as viagens.</p>}
        </div>
        <div className="actions remembered-trip-actions">
          {entry.id === currentId ? <span className="badge">Viagem atual</span> :
            <button className="button secondary" type="button" disabled={busy || !entry.credential}
              aria-label={`Abrir ${entry.title} como ${entry.memberName}`}
              onClick={() => onOpen(entry.id)}>Abrir viagem</button>}
          <button className="button ghost" type="button" disabled={busy}
            aria-label={`Esquecer ${entry.title} neste navegador`}
            onClick={() => onForget(entry.id)}>Esquecer neste navegador</button>
        </div>
      </li>)}
    </ul> : <p className="muted">{onMasterKey ? 'Nenhuma viagem lembrada. Use Gerenciar todas as viagens para consultar o banco.' : 'Nenhuma viagem lembrada. Abra um convite ou crie uma viagem.'}</p>}
    <div className="actions">
      <button className="button secondary" type="button" disabled={busy} onClick={onOpenLink}>Abrir convite</button>
      {onMasterKey && <button className="button secondary" type="button" disabled={busy} onClick={onMasterKey}>Gerenciar todas as viagens</button>}
      <button className="button" type="button" disabled={busy} onClick={onCreate}>Criar viagem</button>
    </div>
    <p className="fine-print">Esquecer remove o acesso deste navegador, sem excluir a viagem.</p>
  </div>;
}
