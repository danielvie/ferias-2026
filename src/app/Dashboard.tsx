export function Dashboard({ busy, onDetails, onQuickStart }: { busy: boolean; onDetails: () => void; onQuickStart: () => void }) {
  return <section className="empty-itinerary">
    <p className="muted">De férias, entre amigos</p>
    <h1>Roteiro</h1>
    <p>Os planos da viagem, dia a dia.<br />Adicione as datas e as cidades para começar.</p>
    <div className="actions">
      <button id="trip-details-button" className="button" disabled={busy} onClick={onDetails}>Criar viagem</button>
      <button id="quick-start-button" className="button secondary" disabled={busy} onClick={onQuickStart}>{busy ? 'Criando exemplo…' : 'Explorar exemplo'}</button>
    </div>
    <p className="fine-print">O exemplo cria uma viagem com planos ilustrativos. Nada é reservado.</p>
    <p className="fine-print">Já tem uma viagem? Use Viagem → Abrir convite.</p>
  </section>;
}
