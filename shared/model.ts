export type Role = 'owner' | 'editor' | 'viewer' | 'family';
export interface Member { id: string; name: string; role: Role }
// A city record is one route visit, not a unique geographic city. Names may repeat.
export interface City { id: string; name: string }
export interface Trip {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  timezone: 'Europe/Brussels';
  cities: City[];
}
export type PlaceStatus = 'idea' | 'planned' | 'visited';
// One movable trip activity. Keep the persisted "place" contract and ID so
// calendar links, notes and family selections survive the route-first UI.
export interface Place {
  id: string;
  title: string;
  cityId: string;
  category: 'walk' | 'museum' | 'food' | 'sight' | 'other';
  status: PlaceStatus;
  description: string;
  address: string;
  url: string;
  durationMinutes: number;
  cost: string;
}
export interface TripEvent {
  id: string;
  title: string;
  cityId: string;
  date: string;
  startTime: string;
  endTime: string;
  kind: 'activity' | 'transport' | 'stay';
  status: 'planned' | 'tentative';
  placeId: string;
  description: string;
}
export interface Comment { id: string; authorId: string; authorName: string; body: string; createdAt: string }
export interface Note {
  id: string;
  title: string;
  body: string;
  visibility: 'private' | 'trip';
  authorId: string;
  authorName: string;
  updatedAt: string;
  linkType: 'trip' | 'city' | 'place' | 'day';
  linkId: string;
  comments: Comment[];
}
export type CheckStatus = 'pending' | 'done' | 'skipped';
export interface ChecklistItem { id: string; title: string; assignee: string; status: CheckStatus }
export interface Transfer {
  id: string;
  fromCityId: string;
  toCityId: string;
  date: string;
  time: string;
  items: ChecklistItem[];
}
export interface ActivityLogEntry { id: string; message: string; at: string }
export interface ChangeTarget {
  type: 'trip' | 'place' | 'event' | 'note' | 'comment' | 'packing' | 'departure' | 'departure-check' | 'member' | 'link';
  id: string;
  parentId: string;
  label: string;
}
export interface HistoryRecord {
  id: string;
  operationId: string;
  actorId: string;
  actorName: string;
  action: 'added' | 'changed' | 'deleted' | 'renamed' | 'revoked' | 'rotated';
  target: ChangeTarget;
  at: string;
}
export interface HistoryPage { items: HistoryRecord[]; before: string | null }
export interface TripData {
  trip: Trip;
  places: Place[];
  events: TripEvent[];
  notes: Note[];
  packing: ChecklistItem[];
  transfers: Transfer[];
  activity: ActivityLogEntry[];
}
export interface TripSnapshot { revision: number; data: TripData; session: Member; members: Member[] }
export interface CreateTripInput { title: string; ownerName: string; startDate: string; endDate: string; cities: string[] }
export interface InviteInput { name: string; role: Exclude<Role, 'owner'>; eventIds: string[]; placeIds: string[] }
export interface InviteInfo { id: string; name: string; role: Exclude<Role, 'owner'>; eventIds: string[]; placeIds: string[]; createdAt: string }

// Commands describe intent. Clients never replace a full, privacy-filtered trip snapshot.
export type TripCommand =
  | { type: 'trip.update'; trip: Pick<Trip, 'title' | 'startDate' | 'endDate' | 'cities'> }
  | { type: 'visit.add'; visit: City; beforeId: string | null }
  | { type: 'visit.move'; id: string; beforeId: string | null }
  | { type: 'place.save'; place: Place }
  | { type: 'place.move'; id: string; cityId: string; beforeId: string | null }
  | { type: 'place.delete'; id: string }
  | { type: 'event.save'; event: TripEvent }
  | { type: 'event.delete'; id: string }
  | { type: 'note.save'; note: Pick<Note, 'id' | 'title' | 'body' | 'visibility' | 'linkType' | 'linkId'> }
  | { type: 'note.delete'; id: string }
  | { type: 'note.comment'; id: string; body: string }
  | { type: 'packing.add'; title: string; assignee: string }
  | { type: 'packing.update'; id: string; status: CheckStatus; assignee: string }
  | { type: 'packing.delete'; id: string }
  | { type: 'transfer.add'; fromCityId: string; toCityId: string; date: string; time: string }
  | { type: 'transfer.delete'; id: string }
  | { type: 'transfer.item.add'; transferId: string; title: string; assignee: string }
  | { type: 'transfer.item.update'; transferId: string; id: string; status: CheckStatus; assignee: string };

export type Page = 'today' | 'calendar' | 'places' | 'notes' | 'checklists' | 'sharing';
