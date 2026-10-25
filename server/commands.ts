import { checklistStrategies } from '../shared/checklists.ts';
import type { Member, Note, TripCommand, TripData } from '../shared/model.ts';
import { requireNoteMutation, requirePermission } from './permissions.ts';
import { check, HttpError } from './validation.ts';

const randomUUID = () => crypto.randomUUID();

function find<T extends { id: string }>(items: T[], id: string): T {
  const item = items.find((item) => item.id === id);
  if (!item) throw new HttpError(422, 'The referenced item does not exist.');
  return item;
}

function save<T extends { id: string }>(items: T[], item: T) {
  if (!item.id) item.id = randomUUID();
  const index = items.findIndex((old) => old.id === item.id);
  if (index === -1) {
    check(items.length < 2000, 'This list has reached its limit.');
    items.push(item);
  } else items[index] = item;
}

function remove<T extends { id: string }>(items: T[], id: string) {
  find(items, id);
  items.splice(items.findIndex((item) => item.id === id), 1);
}

export function addActivity(data: TripData, message: string) {
  data.activity.unshift({ id: randomUUID(), message, at: new Date().toISOString() });
  data.activity = data.activity.slice(0, 50);
}

function inRange(data: TripData, date: string) {
  check(date >= data.trip.startDate && date <= data.trip.endDate, 'The date must be within the trip.');
}

function validateNoteLink(data: TripData, note: Pick<Note, 'linkType' | 'linkId'>) {
  if (note.linkType === 'city') find(data.trip.cities, note.linkId);
  if (note.linkType === 'place') find(data.places, note.linkId);
  if (note.linkType === 'day') inRange(data, note.linkId);
  if (note.linkType === 'trip') check(note.linkId === '' || note.linkId === data.trip.id, 'Invalid trip note link.');
}

function validateReferences(data: TripData) {
  const city = (id: string) => find(data.trip.cities, id);
  for (const place of data.places) city(place.cityId);
  for (const event of data.events) {
    city(event.cityId);
    inRange(data, event.date);
    if (event.placeId) check(find(data.places, event.placeId).cityId === event.cityId, 'Event and place cities must match.');
  }
  for (const transfer of data.transfers) {
    city(transfer.fromCityId);
    city(transfer.toCityId);
    inRange(data, transfer.date);
  }
  for (const note of data.notes) {
    // Invisible annotations must not block or reveal themselves through shared itinerary edits.
    // Their authors can relink them when editing; preserve the original context until then.
    if (note.visibility === 'trip') validateNoteLink(data, note);
  }
}

// The caller owns the transaction. Mutate a freshly loaded full trip, never a filtered snapshot.
export function applyCommand(data: TripData, member: Member, command: TripCommand) {
  requirePermission(member, 'mutate');
  let message: string;
  switch (command.type) {
    case 'trip.update':
      data.trip = { ...data.trip, ...command.trip };
      message = `${member.name} updated the trip.`;
      break;
    case 'place.save':
      save(data.places, command.place);
      message = `${member.name} saved the place "${command.place.title}".`;
      break;
    case 'place.delete':
      remove(data.places, command.id);
      for (const event of data.events) if (event.placeId === command.id) event.placeId = '';
      for (const note of data.notes) {
        if (note.visibility === 'trip' && note.linkType === 'place' && note.linkId === command.id) {
          note.linkType = 'trip';
          note.linkId = data.trip.id;
        }
      }
      message = `${member.name} removed a place.`;
      break;
    case 'event.save':
      save(data.events, command.event);
      if (command.event.placeId) find(data.places, command.event.placeId).status = 'planned';
      message = `${member.name} saved the event "${command.event.title}".`;
      break;
    case 'event.delete':
      remove(data.events, command.id);
      message = `${member.name} removed an event.`;
      break;
    case 'note.save': {
      const previous = data.notes.find((note) => note.id === command.note.id);
      if (previous) {
        requireNoteMutation(member, previous);
        // Only an author can turn shared content into their private note.
        if (command.note.visibility === 'private' && previous.authorId !== member.id) {
          throw new HttpError(403, 'Only the author can make a note private.');
        }
      }
      validateNoteLink(data, command.note);
      save(data.notes, {
        ...command.note, authorId: previous?.authorId ?? member.id,
        authorName: previous?.authorName ?? member.name, comments: previous?.comments ?? [],
        updatedAt: new Date().toISOString(),
      });
      // Note content and titles never enter the global activity log, even when visibility changes later.
      message = `${member.name} saved a note.`;
      break;
    }
    case 'note.delete':
      requireNoteMutation(member, find(data.notes, command.id));
      remove(data.notes, command.id);
      message = `${member.name} removed a note.`;
      break;
    case 'note.comment': {
      const note = find(data.notes, command.id);
      requireNoteMutation(member, note);
      check(note.comments.length < 1000, 'This note has reached its comment limit.');
      note.comments.push({
        id: randomUUID(), authorId: member.id, authorName: member.name,
        body: command.body, createdAt: new Date().toISOString(),
      });
      note.updatedAt = new Date().toISOString();
      message = `${member.name} commented on a note.`;
      break;
    }
    case 'packing.add':
      save(data.packing, { id: randomUUID(), title: command.title, assignee: command.assignee, status: 'pending' });
      message = `${member.name} added a packing item.`;
      break;
    case 'packing.update':
      Object.assign(find(data.packing, command.id), { status: command.status, assignee: command.assignee });
      message = `${member.name} updated a packing item.`;
      break;
    case 'packing.delete':
      remove(data.packing, command.id);
      message = `${member.name} removed a packing item.`;
      break;
    case 'transfer.add':
      check(command.fromCityId !== command.toCityId, 'Choose different departure and destination cities.');
      save(data.transfers, {
        id: randomUUID(), fromCityId: command.fromCityId, toCityId: command.toCityId,
        date: command.date, time: command.time, items: checklistStrategies.departure.create(randomUUID),
      });
      message = `${member.name} added a departure.`;
      break;
    case 'transfer.delete':
      remove(data.transfers, command.id);
      message = `${member.name} removed a departure.`;
      break;
    case 'transfer.item.add':
      save(find(data.transfers, command.transferId).items, {
        id: randomUUID(), title: command.title, assignee: command.assignee, status: 'pending',
      });
      message = `${member.name} added a departure check.`;
      break;
    case 'transfer.item.update':
      Object.assign(find(find(data.transfers, command.transferId).items, command.id), {
        status: command.status, assignee: command.assignee,
      });
      message = `${member.name} updated a departure check.`;
      break;
  }
  validateReferences(data);
  addActivity(data, message);
}
