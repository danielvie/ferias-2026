import { adoptChecklists, checklistStrategies } from '../shared/checklists.ts';
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

function insertBefore<T extends { id: string }>(items: T[], item: T, beforeId: string | null) {
  check(beforeId !== item.id, 'An item cannot be placed before itself.');
  if (beforeId !== null) find(items, beforeId);
  items.splice(beforeId === null ? items.length : items.findIndex(old => old.id === beforeId), 0, item);
}

function moveLinkedEvents(data: TripData, placeId: string, cityId: string) {
  // Scheduling is a separate decision. Only the visit reference follows the
  // activity; dates, times, booking descriptions and private notes stay intact.
  for (const event of data.events) if (event.placeId === placeId) event.cityId = cityId;
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
  for (const list of data.checklists ?? []) {
    if (list.transition) {
      city(list.transition.fromCityId);
      city(list.transition.toCityId);
    }
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
  adoptChecklists(data);
  const checklists = data.checklists!;
  let message: string;
  switch (command.type) {
    case 'visit.add':
      check(data.trip.cities.length < 30, 'A trip can have at most 30 city visits.');
      check(!data.trip.cities.some(city => city.id === command.visit.id), 'This visit ID already exists.');
      insertBefore(data.trip.cities, command.visit, command.beforeId);
      message = `${member.name} added a visit to ${command.visit.name}.`;
      break;
    case 'visit.move': {
      const visit = find(data.trip.cities, command.id);
      remove(data.trip.cities, command.id);
      insertBefore(data.trip.cities, visit, command.beforeId);
      message = `${member.name} reordered the route. Scheduled dates are unchanged.`;
      break;
    }
    case 'place.move': {
      const place = find(data.places, command.id);
      find(data.trip.cities, command.cityId);
      if (command.beforeId !== null) {
        check(find(data.places, command.beforeId).cityId === command.cityId, 'Choose an activity in the destination visit.');
      }
      remove(data.places, place.id);
      place.cityId = command.cityId;
      insertBefore(data.places, place, command.beforeId);
      moveLinkedEvents(data, place.id, place.cityId);
      message = `${member.name} moved an activity. Scheduled dates are unchanged.`;
      break;
    }
    case 'trip.update':
      data.trip = { ...data.trip, ...command.trip };
      message = `${member.name} updated the trip.`;
      break;
    case 'place.save':
      save(data.places, command.place);
      moveLinkedEvents(data, command.place.id, command.place.cityId);
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
    case 'checklist.add':
      check(checklists.length < 100, 'A trip can have at most 100 checklists.');
      check(command.id !== 'packing' && !checklists.some(list => list.id === command.id), 'This checklist ID already exists.');
      save(checklists, { id: command.id, title: command.title, items: [] });
      message = `${member.name} added a checklist.`;
      break;
    case 'checklist.addTransition': {
      check(checklists.length < 100, 'A trip can have at most 100 checklists.');
      check(command.id !== 'packing' && !checklists.some(list => list.id === command.id), 'This checklist ID already exists.');
      const index = data.trip.cities.findIndex(city => city.id === command.fromCityId);
      check(index >= 0 && data.trip.cities[index + 1]?.id === command.toCityId, 'Choose two consecutive checkpoints.');
      const source = command.sourceId === null ? null : find(checklists, command.sourceId);
      save(checklists, {
        id: command.id, title: command.title,
        transition: { fromCityId: command.fromCityId, toCityId: command.toCityId },
        // A copied checklist starts fresh without changing the source or another journey.
        items: source?.items.map(item => ({ ...item, id: randomUUID(), status: 'pending' as const })) ?? [],
      });
      message = `${member.name} added a transition checklist.`;
      break;
    }
    case 'checklist.rename':
      find(checklists, command.id).title = command.title;
      message = `${member.name} renamed a checklist.`;
      break;
    case 'checklist.delete':
      remove(checklists, command.id);
      message = `${member.name} removed a checklist.`;
      break;
    case 'checklist.item.add':
      save(find(checklists, command.checklistId).items, {
        id: randomUUID(), title: command.title, assignee: '', status: 'pending',
      });
      message = `${member.name} added a checklist item.`;
      break;
    case 'checklist.item.rename':
      find(find(checklists, command.checklistId).items, command.id).title = command.title;
      message = `${member.name} edited a checklist item.`;
      break;
    case 'checklist.item.move': {
      const items = find(checklists, command.checklistId).items;
      const item = find(items, command.id);
      check(command.beforeId !== item.id, 'An item cannot be placed before itself.');
      if (command.beforeId !== null) {
        const target = find(items, command.beforeId);
        check((item.status === 'done') === (target.status === 'done'), 'Reorder items within the same pending or completed section.');
      }
      remove(items, item.id);
      insertBefore(items, item, command.beforeId);
      message = `${member.name} reordered checklist items.`;
      break;
    }
    case 'checklist.item.update':
      Object.assign(find(find(checklists, command.checklistId).items, command.id), {
        status: command.status, assignee: command.assignee,
      });
      message = `${member.name} updated a checklist item.`;
      break;
    case 'checklist.item.delete':
      remove(find(checklists, command.checklistId).items, command.id);
      message = `${member.name} removed a checklist item.`;
      break;
    case 'packing.add':
      find(checklists, 'packing');
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
  adoptChecklists(data);
  validateReferences(data);
  // A generic note message still exposes private activity and its timing.
  // Structured note history is separately permission-filtered.
  if (!command.type.startsWith('note.')) addActivity(data, message);
}
