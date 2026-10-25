import type { Member, Note, Role, TripData, TripSnapshot } from '../shared/model.ts';
import { HttpError } from './validation.ts';

interface PermissionStrategy {
  mutate: boolean;
  manageInvites: boolean;
  familyProjection: boolean;
}

export const permissionStrategies: Record<Role, PermissionStrategy> = {
  owner: { mutate: true, manageInvites: true, familyProjection: false },
  editor: { mutate: true, manageInvites: false, familyProjection: false },
  viewer: { mutate: false, manageInvites: false, familyProjection: false },
  family: { mutate: false, manageInvites: false, familyProjection: true },
};

export interface Access {
  member: Member;
  tripId: string;
  eventIds: string[];
  placeIds: string[];
}

export function requirePermission(member: Member, permission: 'mutate' | 'manageInvites') {
  if (!permissionStrategies[member.role][permission]) throw new HttpError(403, 'This link does not allow that action.');
}

export function canReadNote(member: Member, note: Note): boolean {
  return member.role !== 'family' && (note.visibility === 'trip' || note.authorId === member.id);
}

export function requireNoteMutation(member: Member, note: Note) {
  requirePermission(member, 'mutate');
  if (!canReadNote(member, note)) throw new HttpError(403, 'This note is private.');
}

export function snapshot(revision: number, data: TripData, access: Access, members: Member[]): TripSnapshot {
  const session = access.member;
  if (!permissionStrategies[session.role].familyProjection) {
    return { revision, data: { ...data, notes: data.notes.filter((note) => canReadNote(session, note)) }, session, members };
  }

  // Whitelist every field in the family projection, including fields of nested entities.
  // Required IDs/timezone remain for the shared client contract; no booking details do.
  const trip = data.trip;
  const places = data.places.filter((place) => access.placeIds.includes(place.id)).map((place) => ({
    id: place.id, title: place.title, cityId: place.cityId, category: place.category, status: place.status,
    durationMinutes: place.durationMinutes, description: '', address: '', url: '', cost: '',
  }));
  const visiblePlaces = new Set(places.map((place) => place.id));
  const events = data.events.filter((event) => access.eventIds.includes(event.id) && event.kind !== 'stay').map((event) => ({
    id: event.id, title: event.title, cityId: event.cityId, date: event.date, startTime: event.startTime,
    endTime: event.endTime, kind: event.kind, status: event.status, description: '',
    placeId: visiblePlaces.has(event.placeId) ? event.placeId : '',
  }));
  return {
    // Family cannot write. Do not expose counts/timing of unrelated private mutations.
    revision: 0, session, members: [session],
    data: {
      trip: { id: trip.id, title: trip.title, startDate: trip.startDate, endDate: trip.endDate,
        timezone: 'Europe/Brussels', cities: trip.cities.map((city) => ({ id: city.id, name: city.name })) },
      places, events, notes: [], packing: [], transfers: [], activity: [],
    },
  };
}
