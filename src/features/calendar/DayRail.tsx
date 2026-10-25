import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { City, TripEvent } from '../../../shared/model';
import { displayDate } from '../../app/dates';
import { ModalPane } from '../../components/ModalPane';
import { Icon } from '../../components/Icon';
import { markerEmphasis } from './rail-emphasis';
import { tripWeekday } from './itinerary';

export interface ItineraryDay { date: string; events: TripEvent[] }
const dayLabel = (date: string) => displayDate(date, { weekday: 'long', day: 'numeric', month: 'long' });

function Summary({ day, cities }: { day: ItineraryDay; cities: City[] }) {
  const names = [...new Set(day.events.map((event) => cities.find((city) => city.id === event.cityId)?.name).filter(Boolean))];
  return <>
    {names.length > 0 && <p className="muted">{names.join(' / ')}</p>}
    {day.events.length ? <ul className="day-summary">{day.events.slice(0, 3).map((event) =>
      <li key={event.id}><time>{event.startTime}</time><span>{event.title}</span></li>)}</ul> : <p className="muted">Nothing planned yet.</p>}
    {day.events.length > 3 && <p className="fine-print">+ {day.events.length - 3} more activities</p>}
  </>;
}

export function DayRail({ days, cities, onJump }: {
  days: ItineraryDay[];
  cities: City[];
  onJump: (date: string) => boolean;
}) {
  const [active, setActive] = useState(days[0]?.date);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewTop, setPreviewTop] = useState(160);
  const [emphasized, setEmphasized] = useState<number | null>(null);
  const [numbering, setNumbering] = useState<'date' | 'trip'>('date');
  const [dense, setDense] = useState(days.length > 16);
  const [sheet, setSheet] = useState<string | null>(null);
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);
  const touch = useRef(false);
  const previewDay = days.find((day) => day.date === preview);
  const sheetDay = days.find((day) => day.date === sheet);
  const pickerDay = days.find((day) => day.date === pickerDate);

  useEffect(() => {
    let frame = 0;
    const headings = days.map((day) => document.getElementById(`day-${day.date}`));
    function update() {
      frame = 0;
      const edge = (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 100) + 32;
      let date = days[0]?.date;
      for (let i = 0; i < headings.length; i++) {
        if (headings[i] && headings[i]!.getBoundingClientRect().top <= edge) date = days[i].date;
        else break;
      }
      setActive(date);
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [days]);

  useEffect(() => {
    const element = nav.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const height = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const badgeHeight = element.querySelector('.weekday-badge')?.getBoundingClientRect().height ?? 14;
      setDense(height / days.length < badgeHeight + 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [days.length]);

  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setPreview(null); setEmphasized(null); }
    };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, []);

  function show(date: string, button: HTMLButtonElement, index: number) {
    setPreview(date);
    setEmphasized(index);
    setPreviewTop(Math.max(120, Math.min(button.getBoundingClientRect().top - 72, window.innerHeight - 300)));
  }
  function dismissPreview() { setPreview(null); setEmphasized(null); }
  return <aside className="day-rail" aria-label="Day navigator" onMouseLeave={dismissPreview}>
    <button className="rail-label" type="button" aria-label="Use trip day numbers" aria-pressed={numbering === 'trip'}
      title={numbering === 'date' ? 'Showing day of month. Click for trip day numbers.' : 'Showing trip day numbers. Click for day of month.'}
      onClick={() => { dismissPreview(); setNumbering((current) => current === 'date' ? 'trip' : 'date'); }}>
      <Icon name={numbering === 'date' ? 'calendar' : 'ordered'} />Days
    </button>
    <p id="day-rail-help" className="visually-hidden">Days toggles day-of-month and trip-day numbering. Use Up and Down to preview days. Enter moves to the selected day. The calendar button opens a full-size date chooser.</p>
    <nav ref={nav} aria-label="Trip days" aria-describedby="day-rail-help" style={{ '--day-count': days.length } as CSSProperties}
      data-dense={dense ? 'true' : undefined} data-previewing={emphasized !== null ? 'true' : undefined}>
      {days.map((day, index) => {
        const weekday = tripWeekday(day.date);
        const emphasis = markerEmphasis(index, emphasized);
        return <button key={day.date} type="button" className="day-marker"
        data-date={day.date}
        data-weekend={weekday.weekend ? 'true' : undefined}
        data-emphasized={emphasized === index ? 'true' : undefined}
        style={{ '--tick-growth': emphasis.width, '--tick-tint': emphasis.color } as CSSProperties}
        aria-label={`Go to ${dayLabel(day.date)}${weekday.weekend ? ', weekend' : ''}`} aria-current={active === day.date ? 'date' : undefined}
        aria-describedby={preview === day.date ? 'day-preview' : undefined}
        onPointerDown={(event) => { touch.current = event.pointerType === 'touch'; }}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') show(day.date, event.currentTarget, index); }}
        onFocus={(event) => show(day.date, event.currentTarget, index)}
        onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) dismissPreview(); }}
        onKeyDown={(event) => {
          const target = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 :
            event.key === 'Home' ? 0 : event.key === 'End' ? days.length - 1 : null;
          if (target === null) return;
          event.preventDefault();
          nav.current?.querySelectorAll('button')[Math.max(0, Math.min(target, days.length - 1))]?.focus({ preventScroll: true });
        }}
        onClick={(event) => {
          if (event.detail !== 0 && (touch.current || window.matchMedia('(max-width: 640px)').matches)) {
            setSheet(day.date); dismissPreview();
          } else if (onJump(day.date)) dismissPreview();
        }}>
        <span className="marker-number" aria-hidden="true">{numbering === 'date' ? displayDate(day.date, { day: 'numeric' }) : index + 1}</span><span className="marker-tick" aria-hidden="true" />
        <span className="weekday-badge" aria-hidden="true">{weekday.initial}</span>
      </button>;
      })}
    </nav>
    <button className="rail-date-button" type="button" aria-label="Choose a trip day" title="Jump to a date"
      onClick={() => { dismissPreview(); setPickerDate(active ?? days[0].date); }}><Icon name="calendar" /></button>
    {previewDay && <div className="day-preview" id="day-preview" role="tooltip" style={{ top: previewTop }}>
      <div className="day-preview-card"><strong>{dayLabel(previewDay.date)}</strong>
        <Summary day={previewDay} cities={cities} /><p className="preview-hint">Click marker to go to day</p>
      </div>
    </div>}
    {sheetDay && <ModalPane title={dayLabel(sheetDay.date)} variant="sheet" onClose={() => setSheet(null)}>
      <Summary day={sheetDay} cities={cities} />
      <button className="button" onClick={() => { if (onJump(sheetDay.date)) setSheet(null); }}>
        Go to {displayDate(sheetDay.date, { day: 'numeric', month: 'long' })}
      </button>
    </ModalPane>}
    {pickerDate !== null && <ModalPane title="Choose a trip day" variant="sheet" onClose={() => setPickerDate(null)}>
      <form className="stack" onSubmit={(event) => {
        event.preventDefault();
        if (onJump(pickerDate)) setPickerDate(null);
      }}>
        <div className="field"><label htmlFor="rail-trip-date">Trip date</label>
          <input id="rail-trip-date" type="date" required min={days[0].date} max={days[days.length - 1].date}
            value={pickerDate} onChange={(event) => setPickerDate(event.target.value)} /></div>
        {pickerDay && <Summary day={pickerDay} cities={cities} />}
        <button className="button" type="submit">Go to day</button>
      </form>
    </ModalPane>}
  </aside>;
}
