-- City IDs identify route visits. A return visit may have the same city name.
-- Keep the primary key and unique route positions; no existing rows are changed.
drop index trip_private.cities_unique_name;
