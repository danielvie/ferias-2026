import { useId } from 'react';
import type { Trip, TripEvent } from '../../../shared/model';

type EventTime = Pick<TripEvent, 'date' | 'startTime' | 'endTime'>;

export function DateTimeFields({ value, trip, onChange, autoFocus = false }: {
  value: EventTime;
  trip: Trip;
  onChange: (change: Partial<EventTime>) => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="form-grid">
      <div className="field">
        <label htmlFor={`${id}-date`}>Date</label>
        <input id={`${id}-date`} name="date" type="date" required autoFocus={autoFocus}
          min={trip.startDate} max={trip.endDate} value={value.date}
          onChange={event => onChange({ date: event.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-start`}>Start time</label>
        <input id={`${id}-start`} name="startTime" type="time" required value={value.startTime}
          onChange={event => onChange({ startTime: event.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-end`}>End time</label>
        <input id={`${id}-end`} name="endTime" type="time" required value={value.endTime}
          onChange={event => onChange({ endTime: event.target.value })} />
      </div>
    </div>
  );
}
