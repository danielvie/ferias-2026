import type { ChangeTarget, HistoryRecord, TripData } from '../shared/model.ts';
import { tripChecklists } from '../shared/checklists.ts';

// Visibility metadata is storage-only. Never include it in browser history.
export interface Change {
  action: HistoryRecord['action'];
  target: ChangeTarget;
  noteId: string;
  privateTo: string;
}
interface Entity {
  target: ChangeTarget;
  value: unknown;
  noteId: string;
  privateTo: string;
}

function entities(data: TripData) {
  const result = new Map<string, Entity>();
  function add(type: ChangeTarget['type'], id: string, label: string, value: unknown, parentId = '', noteId = '', privateTo = '') {
    result.set(`${type}:${parentId}:${id}`, { target: { type, id, parentId, label }, value, noteId, privateTo });
  }
  add('trip', data.trip.id, data.trip.title, data.trip);
  for (const place of data.places) add('place', place.id, place.title, place);
  for (const event of data.events) add('event', event.id, event.title, event);
  for (const { items, ...list } of tripChecklists(data)) {
    add('checklist', list.id, list.title, list);
    for (const item of items) {
      if (list.id === 'packing') add('packing', item.id, item.title, item);
      else add('checklist-item', item.id, item.title, item, list.id);
    }
  }
  for (const { items, ...departure } of data.transfers) {
    const city = (id: string) => data.trip.cities.find((city) => city.id === id)?.name ?? id;
    const label = `${city(departure.fromCityId)} to ${city(departure.toCityId)} · ${departure.date} ${departure.time}`;
    add('departure', departure.id, label, departure);
    for (const item of items) add('departure-check', item.id, `${item.title} · ${label}`, item, departure.id);
  }
  for (const { comments, updatedAt: _updatedAt, ...note } of data.notes) {
    const privateTo = note.visibility === 'private' ? note.authorId : '';
    // Even shared-note titles/text can become private later. Do not copy them.
    add('note', note.id, 'Note', note, '', note.id, privateTo);
    for (const comment of comments) add('comment', comment.id, 'Comment', comment, note.id, note.id, privateTo);
  }
  return result;
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = Object.entries(a), right = Object.entries(b);
  return left.length === right.length && left.every(([key, value]) =>
    Object.hasOwn(b, key) && equal(value, (b as Record<string, unknown>)[key]));
}

/** Compare trusted full states, not the privacy-filtered browser snapshot. */
export function changesBetween(before: TripData, after: TripData): Change[] {
  const previous = entities(before), next = entities(after);
  const changes: Change[] = [];
  for (const key of new Set([...previous.keys(), ...next.keys()])) {
    const old = previous.get(key), current = next.get(key);
    if (old && current && equal(old.value, current.value)) continue;
    const entity = current ?? old!;
    changes.push({
      action: !old ? 'added' : !current ? 'deleted' : 'changed',
      target: entity.target, noteId: entity.noteId, privateTo: entity.privateTo,
    });
  }
  // Additions and deletions have their own records. Only changed relative order
  // of surviving items needs an extra parent record.
  const previousLists = new Map(tripChecklists(before).map(list => [list.id, list]));
  for (const list of tripChecklists(after)) {
    const old = previousLists.get(list.id);
    if (!old) continue;
    const oldIds = new Set(old.items.map(item => item.id));
    const newIds = new Set(list.items.map(item => item.id));
    const oldOrder = old.items.filter(item => newIds.has(item.id)).map(item => item.id);
    const newOrder = list.items.filter(item => oldIds.has(item.id)).map(item => item.id);
    if (equal(oldOrder, newOrder) || changes.some(change => change.target.type === 'checklist' && change.target.id === list.id)) continue;
    changes.push({
      action: 'changed', target: { type: 'checklist', id: list.id, parentId: '', label: list.title },
      noteId: '', privateTo: '',
    });
  }
  return changes;
}

export function memberChange(action: HistoryRecord['action'], type: 'member' | 'link', id: string, label: string): Change {
  return { action, target: { type, id, label, parentId: '' }, noteId: '', privateTo: '' };
}
