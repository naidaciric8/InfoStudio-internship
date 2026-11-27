-- Dodaje način plaćanja u narudžbe. Postojeće narudžbe dobiju VIRMAN.
alter table narudzbe
  add column nacin_placanja varchar(20) not null default 'VIRMAN'
  check (nacin_placanja in ('GOTOVINA', 'KARTICA', 'VIRMAN'));
