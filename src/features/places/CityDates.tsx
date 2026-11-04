import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { City } from '../../../shared/model';
import { visitLabel } from '../../../shared/route';
import { displayDate } from '../../app/dates';
import { useTrip } from '../../app/TripContext';
import { DateRangePicker } from '../../components/DateRangePicker';
import { Icon } from '../../components/Icon';

export function CityDates({ city, disabled, summary }: { city: City; disabled: boolean; summary: string }) {
  const { snapshot, canEdit, busy, command } = useTrip();
  const [open, setOpen] = useState(false);
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [editing, setEditing] = useState<'arrival' | 'departure'>('arrival');
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const arrivalButton = useRef<HTMLButtonElement>(null);
  const { trip } = snapshot.data;
  const label = visitLabel(trip.cities, city.id);
  const hasDates = Boolean(city.arrivalDate || city.departureDate);

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus());
  }
  function begin() {
    setArrival(city.arrivalDate ?? '');
    setDeparture(city.departureDate ?? '');
    setEditing(city.arrivalDate && !city.departureDate ? 'departure' : 'arrival');
    setError('');
    setOpen(true);
  }

  // Keep the floating panel within the viewport without changing route layout.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      if (!trigger.current || !panel.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const box = panel.current.getBoundingClientRect();
      const margin = 8;
      const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - box.width - margin));
      const below = anchor.bottom + 4;
      const top = below + box.height + margin <= window.innerHeight ? below
        : Math.max(margin, Math.min(anchor.top - box.height - 4, window.innerHeight - box.height - margin));
      setPosition({ top, left });
    }
    place();
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  useEffect(() => { if (open) arrivalButton.current?.focus(); }, [open]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!busy && !panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); close(true); }
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [open, busy]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (arrival && departure && departure < arrival) {
      setError('A saída não pode ser anterior à chegada.');
      return;
    }
    if ([arrival, departure].some(date => date && (date < trip.startDate || date > trip.endDate))) {
      setError('As datas da parada precisam estar dentro da viagem. Ajuste ou limpe as datas fora do período.');
      return;
    }
    setError('');
    const saved = await command({ type: 'visit.dates', id: city.id, arrivalDate: arrival, departureDate: departure });
    if (saved) close(true);
    else setError('Não foi possível salvar. Confira as datas da viagem e tente novamente.');
  }
  const text = (date: string) => date ? displayDate(date, {
    day: 'numeric', month: 'short',
    ...(trip.startDate.slice(0, 4) !== trip.endDate.slice(0, 4) ||
      date.slice(0, 4) !== trip.startDate.slice(0, 4) ? { year: 'numeric' } : {}),
  }) : 'Não definida';
  return <div className="city-dates-anchor" id={`checkpoint-dates-${city.id}`}>
    {canEdit ? <button ref={trigger} type="button" className="city-dates-trigger" disabled={disabled || busy}
      aria-label={`${hasDates ? 'Editar' : 'Definir'} datas de ${label}${hasDates ? `, ${summary}` : ''}`}
      aria-haspopup="dialog" aria-expanded={open}
      onClick={() => open ? close(true) : begin()}>
      <Icon name="calendar" />{hasDates && <span>{summary}</span>}
    </button> : hasDates && <span className="city-dates-readonly"><Icon name="calendar" />{summary}</span>}
    {open && createPortal(<div ref={panel} className="city-dates-popover" role="dialog"
      aria-label={`Datas de ${label}`} style={{ top: position.top, left: position.left }}>
      <form onSubmit={event => void save(event)}>
        <div className="city-dates-endpoints">
          <button ref={arrivalButton} type="button" aria-label={`Chegada: ${text(arrival)}`}
            data-unset={!arrival || undefined} aria-pressed={editing === 'arrival'}
            onClick={() => setEditing('arrival')}>{arrival ? text(arrival) : 'Chegada'}</button>
          <button type="button" disabled={!arrival} aria-label="Limpar data de chegada" onClick={() => setArrival('')}>×</button>
          <button type="button" aria-label={`Saída: ${text(departure)}`}
            data-unset={!departure || undefined} aria-pressed={editing === 'departure'}
            onClick={() => setEditing('departure')}>{departure ? text(departure) : 'Saída'}</button>
          <button type="button" disabled={!departure} aria-label="Limpar data de saída" onClick={() => setDeparture('')}>×</button>
          <button type="button" className="city-dates-close" aria-label="Fechar calendário" disabled={busy}
            onClick={() => close(true)}><Icon name="close" /></button>
        </div>
        <DateRangePicker value={{ startDate: arrival, endDate: departure }} onChange={() => {}}
          label="Datas da parada" initialDate={trip.startDate} minDate={trip.startDate} maxDate={trip.endDate}
          showSummary={false} hideInstructions onDateSelect={date => {
            if (editing === 'arrival') { setArrival(date); setEditing('departure'); }
            else setDeparture(date);
            setError('');
          }} />
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="city-dates-actions">
          <button type="submit" className="button" disabled={busy || disabled}>Salvar</button>
        </div>
      </form>
    </div>, document.body)}
  </div>;
}
