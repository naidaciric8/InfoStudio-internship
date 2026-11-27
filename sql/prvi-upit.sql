-- Deset kupaca s najvećim prometom u zadnjoj godini podataka, bez otkazanih narudžbi.
-- "Zadnja godina" = 12 mjeseci do zadnjeg datuma u podacima (zadatak: zadnji datum je "danas").
-- Iznos stavke = količina × cijena po komadu × (1 − rabat / 100).

with granica as (
  select max(datum) as danas from narudzbe
)
select
  k.naziv,
  count(distinct n.id) as broj_narudzbi,  -- distinct: join sa stavkama ponavlja narudžbu za svaku stavku
  round(sum(s.kolicina * s.cijena_po_komadu * (1 - s.rabat_posto / 100)), 2) as promet
from kupci k
join narudzbe n        on n.kupac_id = k.id
join stavke_narudzbe s on s.narudzba_id = n.id
cross join granica g
where n.status <> 'OTKAZANA'
  and n.datum > g.danas - interval '1 year'
group by k.id, k.naziv
order by promet desc
limit 10;
