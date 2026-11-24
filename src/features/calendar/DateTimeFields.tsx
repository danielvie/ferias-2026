import { useId } from 'react';
import type { Trip, TripEvent } from '../../../shared/model';

type EventTime = Pick<TripEvent, 'date' | 'startTime' | 'endTime'>;

export function DateTimeFields({ value, trip, onChange, autoFocus = false, timeRequired = false }: {
  value: EventTime;
  trip: Trip;
  onChange: (change: Partial<EventTime>) => void;
  autoFocus?: boolean;
  timeRequired?: boolean;
}) {
  const id = useId();
  return (
    <div className="stack">
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${id}-date`}>Data</label>
          <input id={`${id}-date`} name="date" type="date" required autoFocus={autoFocus}
            min={trip.startDate} max={trip.endDate} value={value.date}
            onChange={event => onChange({ date: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-start`}>Início</label>
          <input id={`${id}-start`} name="startTime" type="time" required={timeRequired} value={value.startTime}
            aria-describedby={`${id}-time-help`} onChange={event => onChange({ startTime: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-end`}>Fim</label>
          <input id={`${id}-end`} name="endTime" type="time" required={timeRequired} value={value.endTime}
            aria-describedby={`${id}-time-help`} onChange={event => onChange({ endTime: event.target.value })} />
        </div>
      </div>
      <p id={`${id}-time-help`} className="fine-print">{timeRequired
        ? 'Preencha início e fim no mesmo dia, no horário local da viagem.'
        : 'Deixe início e fim em branco para planejar só o dia. Se preencher, use o horário local da viagem.'}</p>
    </div>
  );
}
