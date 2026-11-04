import { useEffect, useRef, useState } from 'react';
import { visitLabel } from '../../../shared/route';
import { useTrip } from '../../app/TripContext';
import { brusselsToday } from '../../app/dates';
import { Icon } from '../../components/Icon';
import { CalendarPage } from '../calendar/CalendarPage';
import { tripDates } from '../calendar/itinerary';
import { PlacesPage } from '../places/PlacesPage';
import { CityDates } from '../places/CityDates';
import { CityChecklists } from '../places/CityChecklists';
import { RouteMap, CityIllustration } from './RouteMap';
import { RouteNotes } from './RouteNotes';
import { restoreSelection, visitDates, visitsOnDate } from './selection';
import './roteiro.css';

const format = (date: string, options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }) =>
  new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

export function RoteiroPage({ ideas = false }: { ideas?: boolean }) {
  const { snapshot, canEdit, busy, navigate } = useTrip();
  const { data } = snapshot;
  const { trip } = data;
  const dates = tripDates(trip);
  // The parent owns selection; changing the visual tab does not remount forms.
  // https://react.dev/learn/sharing-state-between-components
  const [selection, setSelection] = useState(() => restoreSelection(data, typeof location === 'undefined' ? '' : location.search, brusselsToday()));
  const [mapOpen, setMapOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 900);
  const [organizing, setOrganizing] = useState(false);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [placeFormOpen, setPlaceFormOpen] = useState(false);
  const family = snapshot.session.role === 'family';
  const date = dates.includes(selection.date) ? selection.date : trip.startDate;
  const city = trip.cities.find(city => city.id === selection.cityId);
  const dayVisits = visitsOnDate(data, date);
  const index = dates.indexOf(date);
  const weekStart = Math.floor(index / 7) * 7;
  const week = dates.slice(weekStart, weekStart + 7);
  const blocked = busy || eventFormOpen || placeFormOpen;
  const cityDays = city ? visitDates(data, city) : [];
  const unscheduled = data.places.filter(place => place.cityId === city?.id && !data.events.some(event => event.placeId === place.id));
  const weekNav = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = weekNav.current;
    const active = nav?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!nav || !active) return;
    // Only move the horizontal rail, never the page or an open form.
    nav.scrollLeft += active.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - active.clientWidth) / 2;
  }, [date, organizing]);

  function rememberSelection(next: { date: string; cityId: string }) {
    setSelection(next);
    const url = new URL(location.href);
    url.searchParams.set('roteiroViagem', trip.id);
    url.searchParams.set('dia', next.date);
    if (next.cityId) url.searchParams.set('parada', next.cityId);
    else url.searchParams.delete('parada');
    history.replaceState(null, '', url);
  }

  function selectDay(next: string) {
    if (blocked || !dates.includes(next)) return;
    const visits = visitsOnDate(data, next);
    rememberSelection({ date: next, cityId: visits.some(visit => visit.id === city?.id) ? city!.id : visits[0]?.id ?? '' });
  }
  function selectCity(id: string) {
    const next = trip.cities.find(city => city.id === id);
    if (!next || busy) return;
    const nextDates = visitDates(data, next);
    rememberSelection({ date: nextDates.includes(date) ? date : nextDates[0] ?? date, cityId: id });
  }
  function openOrganizer() {
    if (blocked) return;
    setOrganizing(true);
    requestAnimationFrame(() => document.getElementById('roteiro-back')?.focus());
  }
  if (organizing) return <section className="roteiro-organizer">
    <button id="roteiro-back" className="button secondary" disabled={blocked} onClick={() => {
      setOrganizing(false);
      requestAnimationFrame(() => document.getElementById('roteiro-organize')?.focus());
    }}>Voltar ao roteiro</button>
    <PlacesPage onFormChange={setPlaceFormOpen} />
  </section>;

  return <div className="roteiro-page">
    <header className="roteiro-heading">
      <div><p className="eyebrow">{format(trip.startDate)} a {format(trip.endDate, { day: '2-digit', month: 'short', year: 'numeric' })} · entre amigos</p>
        <h1>{trip.title}</h1><p className="muted">Cidades no mapa. Planos por dia.</p></div>
      <button id="roteiro-organize" className="button secondary" disabled={blocked} onClick={openOrganizer}><Icon name="ordered" />{canEdit ? 'Organizar rota' : 'Ver todas as paradas'}</button>
    </header>
    {!canEdit && <p className="fine-print">{family ? 'Você vê apenas os planos compartilhados com este acesso.' : 'Somente leitura. Organizadores e participantes podem alterar os planos.'}</p>}
    <div className="roteiro-layout">
      <aside className="roteiro-context">
        <details className="roteiro-map-disclosure" open={mapOpen} onToggle={event => setMapOpen(event.currentTarget.open)}>
          <summary><Icon name="places" /><span>Mapa da viagem</span><small>{trip.cities.length} paradas</small></summary>
          <RouteMap cities={trip.cities} selectedId={city?.id} disabled={blocked} onSelect={id => {
            selectCity(id);
            if (window.innerWidth < 900) {
              setMapOpen(false);
              requestAnimationFrame(() => document.querySelector<HTMLElement>('.roteiro-map-disclosure > summary')?.focus());
            }
          }} />
        </details>
        <section className="roteiro-city-context">
          <div className="roteiro-city-heading"><div><span className="eyebrow">Parada selecionada</span><h2>{city ? visitLabel(trip.cities, city.id) : 'Onde vamos?'}</h2></div><CityIllustration /></div>
          {!city && <p className="muted">Nenhuma cidade definida para este dia. Escolha uma parada no mapa ou na lista.</p>}
          {city && <>
            {!family && <CityDates key={city.id} city={city} disabled={blocked}
              summary={`${city.arrivalDate ? format(city.arrivalDate) : 'Chegada a definir'} · ${city.departureDate ? format(city.departureDate) : 'Saída a definir'}`} />}
            <nav className="roteiro-city-days" aria-label="Dias desta parada">
              {cityDays.map(day => <button key={day} disabled={blocked} aria-pressed={date === day}
                onClick={() => rememberSelection({ date: day, cityId: city.id })}>{format(day)}</button>)}
            </nav>
            {!cityDays.length && <p className="fine-print">Esta parada ainda não tem datas ou atividades agendadas.</p>}
            {!family && <div className="roteiro-city-checklists"><h3>Listas desta parada</h3><CityChecklists key={city.id} city={city} disabled={blocked} /></div>}
          </>}
        </section>
      </aside>
      <section className="roteiro-agenda" aria-label="Agenda e ideias">
        <div className="roteiro-agenda-controls"><h2>Agenda</h2><label className="field"><span className="visually-hidden">Dia da viagem</span>
          <input type="date" aria-label="Dia da viagem" value={date} min={trip.startDate} max={trip.endDate}
            disabled={blocked} onChange={event => selectDay(event.target.value)} /></label></div>
        <div className="roteiro-week-controls"><button disabled={blocked || weekStart === 0} aria-label="Semana anterior" onClick={() => selectDay(dates[Math.max(0, weekStart - 7)])}>←</button>
          <span>{format(week[0])} a {format(week[week.length - 1])}</span>
          <button disabled={blocked || weekStart + 7 >= dates.length} aria-label="Próxima semana" onClick={() => selectDay(dates[weekStart + 7])}>→</button></div>
        <nav ref={weekNav} className="roteiro-week" aria-label="Dias da viagem">
          {week.map(day => <button key={day} disabled={blocked} aria-pressed={day === date} aria-label={format(day, { weekday: 'long', day: 'numeric', month: 'long' })}
            onClick={() => selectDay(day)}><small>{format(day, { weekday: 'short' })}</small><strong>{day.slice(-2)}</strong>
            <span>{[...new Set(visitsOnDate(data, day).map(city => city.name))].join(' / ') || 'Dia livre'}</span></button>)}
        </nav>
        <div className="roteiro-view-controls" role="group" aria-label="Conteúdo do roteiro">
          <button aria-pressed={!ideas} disabled={blocked} onClick={() => navigate('today')}>Atividades do dia</button>
          <button aria-pressed={ideas} disabled={blocked} onClick={() => navigate('places')}>Ideias da cidade{city ? ` · ${unscheduled.length}` : ''}</button>
        </div>
        {dayVisits.length > 1 && !ideas && <p className="roteiro-multi-city">Este dia passa por {dayVisits.map(city => visitLabel(trip.cities, city.id)).join(' e ')}. Todas as atividades do dia aparecem abaixo.</p>}
        <div hidden={ideas}><CalendarPage selectedDate={date} initialCityId={city?.id} onFormChange={setEventFormOpen} /></div>
        <div hidden={!ideas} className="roteiro-ideas">
          <h2>{city ? `Ideias em ${visitLabel(trip.cities, city.id)}` : 'Ideias da cidade'}</h2>
          <p className="fine-print">Salvar uma ideia não agenda uma atividade. Escolha a data quando decidir ir.</p>
          {city ? <PlacesPage embedded cityId={city.id} selectedDate={date} onSelectCity={selectCity} onFormChange={setPlaceFormOpen} /> : <p>Escolha uma parada no mapa ou na lista.</p>}
        </div>
        <RouteNotes date={date} cityId={city?.id} />
      </section>
    </div>
  </div>;
}
