import type { CreateTripInput, InviteInput, TripCommand } from '../shared/model.ts';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new HttpError(422, message);
}

export function object(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected a JSON object.');
  return value as Record<string, unknown>;
}

export function text(value: unknown, label: string, max = 200, allowEmpty = false): string {
  check(typeof value === 'string', `${label} must be text.`);
  const result = value.trim();
  check(result.length <= max && (allowEmpty || result.length > 0), `${label} is empty or too long.`);
  check(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result), `${label} contains invalid characters.`);
  return result;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  check(typeof value === 'string' && allowed.includes(value as T), `Invalid ${label}.`);
  return value as T;
}

export function list<T>(value: unknown, parse: (value: unknown) => T, max = 500): T[] {
  check(Array.isArray(value) && value.length <= max, 'Invalid or oversized list.');
  return value.map(parse);
}

export const id = (value: unknown): string => {
  const result = text(value, 'ID', 100);
  check(/^[a-zA-Z0-9_-]+$/.test(result), 'Invalid ID.');
  return result;
};
const saveId = (value: unknown) => value === '' ? '' : id(value);

export function date(value: unknown): string {
  const result = text(value, 'Date', 10);
  check(/^\d{4}-\d{2}-\d{2}$/.test(result) && !result.startsWith('0000'), 'Use a YYYY-MM-DD date.');
  const parsed = new Date(`${result}T00:00:00Z`);
  check(!Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === result, 'Invalid calendar date.');
  return result;
}

function time(value: unknown): string {
  const result = text(value, 'Time', 5);
  check(/^([01]\d|2[0-3]):[0-5]\d$/.test(result), 'Use a valid HH:MM time.');
  return result;
}

export function dateRange(start: string, end: string) {
  check(start <= end, 'The end date must not precede the start date.');
}

function url(value: unknown): string {
  const result = text(value, 'URL', 2000, true);
  if (!result) return '';
  check(/^https?:\/\//i.test(result) && !/[\s\\\u0000-\u001f\u007f]/u.test(result), 'Use an absolute HTTP or HTTPS URL.');
  let parsed: URL;
  try { parsed = new URL(result); } catch { throw new HttpError(422, 'Invalid URL.'); }
  check(['http:', 'https:'].includes(parsed.protocol) && !!parsed.hostname && !parsed.username && !parsed.password, 'Unsafe URL.');
  return parsed.href;
}

export function createTripInput(value: unknown): CreateTripInput {
  const v = object(value);
  const startDate = date(v.startDate), endDate = date(v.endDate);
  dateRange(startDate, endDate);
  const cities = list(v.cities, (city) => text(city, 'City', 100), 30);
  check(cities.length > 0 && new Set(cities.map((city) => city.toLowerCase())).size === cities.length, 'Provide unique cities.');
  return { title: text(v.title, 'Trip title'), ownerName: text(v.ownerName, 'Name', 100), startDate, endDate, cities };
}

export function inviteInput(value: unknown): InviteInput {
  const v = object(value);
  return {
    name: text(v.name, 'Name', 100),
    role: oneOf(v.role, ['editor', 'viewer', 'family'], 'role'),
    eventIds: [...new Set(list(v.eventIds, id))],
    placeIds: [...new Set(list(v.placeIds, id))],
  };
}

// Construct each object from known fields. Never spread untrusted JSON into domain data.
export function commandInput(value: unknown): TripCommand {
  const v = object(value);
  const type = text(v.type, 'Command type', 40);
  const assignee = () => text(v.assignee, 'Assignee', 100, true);
  const status = () => oneOf(v.status, ['pending', 'done', 'skipped'], 'check status');
  switch (type) {
    case 'trip.update': {
      const t = object(v.trip);
      const cities = list(t.cities, (value) => {
        const city = object(value);
        return { id: id(city.id), name: text(city.name, 'City', 100) };
      }, 30);
      check(cities.length > 0 && new Set(cities.map((city) => city.id)).size === cities.length, 'Provide unique city IDs.');
      const startDate = date(t.startDate), endDate = date(t.endDate);
      dateRange(startDate, endDate);
      return { type, trip: { title: text(t.title, 'Trip title'), startDate, endDate, cities } };
    }
    case 'place.save': {
      const p = object(v.place);
      check(typeof p.durationMinutes === 'number' && Number.isInteger(p.durationMinutes) && p.durationMinutes >= 0 && p.durationMinutes <= 1440, 'Invalid duration.');
      return { type, place: {
        id: saveId(p.id), title: text(p.title, 'Place title'), cityId: id(p.cityId),
        category: oneOf(p.category, ['walk', 'museum', 'food', 'sight', 'other'], 'category'),
        status: oneOf(p.status, ['idea', 'planned', 'visited'], 'place status'),
        description: text(p.description, 'Description', 10000, true), address: text(p.address, 'Address', 1000, true),
        url: url(p.url), durationMinutes: p.durationMinutes, cost: text(p.cost, 'Cost', 200, true),
      } };
    }
    case 'event.save': {
      const e = object(v.event);
      const startTime = time(e.startTime), endTime = time(e.endTime);
      check(startTime < endTime, 'The event must end after it starts on the same day.');
      return { type, event: {
        id: saveId(e.id), title: text(e.title, 'Event title'), cityId: id(e.cityId),
        date: date(e.date), startTime, endTime,
        kind: oneOf(e.kind, ['activity', 'transport', 'stay'], 'event kind'),
        status: oneOf(e.status, ['planned', 'tentative'], 'event status'),
        placeId: e.placeId === '' ? '' : id(e.placeId), description: text(e.description, 'Description', 10000, true),
      } };
    }
    case 'note.save': {
      const n = object(v.note);
      const linkType = oneOf(n.linkType, ['trip', 'city', 'place', 'day'], 'note link');
      return { type, note: {
        id: saveId(n.id), title: text(n.title, 'Note title'), body: text(n.body, 'Note', 20000, true),
        visibility: oneOf(n.visibility, ['private', 'trip'], 'visibility'), linkType,
        linkId: linkType === 'day' ? date(n.linkId) : text(n.linkId, 'Note link', 100, linkType === 'trip'),
      } };
    }
    case 'note.comment': return { type, id: id(v.id), body: text(v.body, 'Comment', 5000) };
    case 'packing.add': return { type, title: text(v.title, 'Item title'), assignee: assignee() };
    case 'packing.update': return { type, id: id(v.id), status: status(), assignee: assignee() };
    case 'transfer.add': return { type, fromCityId: id(v.fromCityId), toCityId: id(v.toCityId), date: date(v.date), time: time(v.time) };
    case 'transfer.item.add': return { type, transferId: id(v.transferId), title: text(v.title, 'Item title'), assignee: assignee() };
    case 'transfer.item.update': return { type, transferId: id(v.transferId), id: id(v.id), status: status(), assignee: assignee() };
    case 'place.delete':
    case 'event.delete':
    case 'note.delete':
    case 'packing.delete':
    case 'transfer.delete': return { type, id: id(v.id) };
    default: throw new HttpError(422, 'Unknown command.');
  }
}
