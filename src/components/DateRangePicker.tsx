import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { brusselsToday, displayDate } from '../app/dates';
import { calendarWeeks, selectRangeDate, shiftDate, shiftMonth, type DateRange } from './date-range';
import './date-range.css';

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const months = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, '0'),
  label: displayDate(`2026-${String(index + 1).padStart(2, '0')}-01`, { month: 'long' }),
}));
const fullDate = (date: string) => displayDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (date: string) => displayDate(date, { day: 'numeric', month: 'short', year: 'numeric' });

export function DateRangePicker({ value, onChange, label = 'Trip dates', initialDate, minDate, maxDate,
  onDateSelect, showSummary = true }: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  label?: string;
  initialDate?: string;
  minDate?: string;
  maxDate?: string;
  onDateSelect?: (date: string) => void;
  showSummary?: boolean;
}) {
  const id = useId();
  const today = brusselsToday();
  const firstDate = value.startDate || value.endDate || initialDate || today;
  const [month, setMonth] = useState(() => firstDate.slice(0, 7));
  const [focusedDate, setFocusedDate] = useState(firstDate);
  const [previewDate, setPreviewDate] = useState('');
  const grid = useRef<HTMLTableElement>(null);
  const weeks = calendarWeeks(month);
  const tabDate = focusedDate.startsWith(month) ? focusedDate : `${month}-01`;
  const preview = !onDateSelect && value.startDate && !value.endDate && previewDate
    ? selectRangeDate(value, previewDate) : value;
  const rangeEnd = preview.endDate || preview.startDate;
  const summary = !value.startDate ? 'No dates selected'
    : !value.endDate ? `${shortDate(value.startDate)} to …`
    : value.startDate === value.endDate ? shortDate(value.startDate)
    : `${shortDate(value.startDate)} to ${shortDate(value.endDate)}`;

  function changeMonth(next: string) {
    setMonth(next);
    setPreviewDate('');
  }

  function chooseDate(date: string) {
    if ((minDate && date < minDate) || (maxDate && date > maxDate)) return;
    if (onDateSelect) onDateSelect(date);
    else onChange(selectRangeDate(value, date));
    setFocusedDate(date);
    setPreviewDate('');
  }

  // One tab stop in the grid, with APG date-picker keyboard navigation.
  // https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/#kbd_label
  function navigate(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    let next: string;
    switch (event.key) {
      case 'ArrowLeft': next = shiftDate(date, -1); break;
      case 'ArrowRight': next = shiftDate(date, 1); break;
      case 'ArrowUp': next = shiftDate(date, -7); break;
      case 'ArrowDown': next = shiftDate(date, 7); break;
      case 'Home': next = shiftDate(date, -weekday); break;
      case 'End': next = shiftDate(date, 6 - weekday); break;
      case 'PageUp': next = shiftMonth(date, event.shiftKey ? -12 : -1); break;
      case 'PageDown': next = shiftMonth(date, event.shiftKey ? 12 : 1); break;
      default: return;
    }
    event.preventDefault();
    setMonth(next.slice(0, 7));
    setFocusedDate(next);
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus());
  }

  return <div className="date-range-picker" role="group" aria-labelledby={`${id}-label`}>
    <h3 id={`${id}-label`}>{label}</h3>
    {showSummary && <div className="date-range-summary">
      <p role="status" aria-atomic="true">{summary}</p>
      <button className="button ghost" type="button" disabled={!value.startDate}
        onClick={() => { onChange({ startDate: '', endDate: '' }); setPreviewDate(''); }}>Clear dates</button>
    </div>}
    <p className="date-range-hint" id={`${id}-hint`}>
      {onDateSelect ? 'Choose an arrival or departure date.'
        : value.startDate && !value.endDate ? 'Now select the end date. Select the same day for a one-day trip.'
        : 'Select a start date, then an end date.'}
    </p>
    <div className="date-range-calendar">
      <div className="date-range-navigation">
        <button className="button ghost" type="button" aria-label="Previous month" disabled={month === '0001-01'}
          onClick={() => changeMonth(shiftMonth(`${month}-01`, -1).slice(0, 7))}><span aria-hidden="true">‹</span></button>
        <div className="date-range-month">
          <select aria-label="Calendar month" value={month.slice(5)}
            onChange={(event) => changeMonth(`${month.slice(0, 4)}-${event.target.value}`)}>
            {months.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <input aria-label="Calendar year" type="number" min={1} max={9999} value={Number(month.slice(0, 4))}
            onChange={(event) => {
              const year = event.currentTarget.valueAsNumber;
              if (Number.isInteger(year) && year >= 1 && year <= 9999) {
                changeMonth(`${String(year).padStart(4, '0')}-${month.slice(5)}`);
              }
            }} />
        </div>
        <button className="button ghost" type="button" aria-label="Next month" disabled={month === '9999-12'}
          onClick={() => changeMonth(shiftMonth(`${month}-01`, 1).slice(0, 7))}><span aria-hidden="true">›</span></button>
      </div>
      <span className="visually-hidden" aria-live="polite">{displayDate(`${month}-01`, { month: 'long', year: 'numeric' })}</span>
      <table ref={grid} role="grid" aria-label={label} aria-multiselectable="true" aria-describedby={`${id}-hint ${id}-keyboard`}
        className="date-range-grid" onMouseLeave={() => setPreviewDate('')}>
        <thead><tr>{weekdays.map((day) => <th key={day} scope="col" abbr={day}>{day.slice(0, 2)}</th>)}</tr></thead>
        <tbody>{weeks.map((week, index) => <tr key={index}>{week.map((date, column) => {
          if (!date) return <td key={column} />;
          const selected = value.startDate && value.endDate
            ? date >= value.startDate && date <= value.endDate
            : date === value.startDate || date === value.endDate;
          const inRange = Boolean(preview.startDate && date >= preview.startDate && date <= rangeEnd);
          const start = date === preview.startDate;
          const end = date === rangeEnd;
          return <td key={column} aria-selected={selected} data-in-range={inRange || undefined}
            data-range-start={start || undefined} data-range-end={end || undefined}>
            <button type="button" className="date-range-day" data-date={date} tabIndex={date === tabDate ? 0 : -1}
              aria-label={fullDate(date)} aria-current={date === today ? 'date' : undefined}
              aria-disabled={(minDate && date < minDate) || (maxDate && date > maxDate) ? true : undefined}
              aria-description={date === value.startDate && date === value.endDate ? 'Start and end date'
                : date === value.startDate ? 'Start date' : date === value.endDate ? 'End date' : undefined}
              data-endpoint={date === value.startDate || date === value.endDate || undefined}
              onClick={() => chooseDate(date)} onKeyDown={(event) => navigate(event, date)}
              onMouseEnter={() => setPreviewDate(date)}
              onFocus={() => { setFocusedDate(date); setPreviewDate(date); }}>
              <span>{Number(date.slice(8))}</span>
            </button>
          </td>;
        })}</tr>)}</tbody>
      </table>
      <span className="visually-hidden" id={`${id}-keyboard`}>Use arrow keys to move between days, Page Up or Page Down to change month, and Enter or Space to select.</span>
    </div>
  </div>;
}
