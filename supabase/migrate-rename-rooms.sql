-- Run once in Supabase SQL editor if you already seeded with "Bedroom 1" etc.
-- Updates display names only; UUIDs and reservation_spots stay the same.

update sleeping_spots set name = 'Grandma''s bedroom' where name = 'Bedroom 1';
update sleeping_spots set name = 'Grandpa''s bedroom' where name = 'Bedroom 2';
update sleeping_spots set name = 'The lavender room' where name = 'Bedroom 3';
update sleeping_spots set name = 'Porch couch' where name in ('Porch Couch', 'Porch couch');
