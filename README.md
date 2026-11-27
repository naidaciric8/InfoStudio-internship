# Narudžbe: praksa

Aplikacija za pregled i unos narudžbi kupaca (distribucija pića i grickalica).
Zadatak i uputstvo za postavljanje od nule: [kit/zadatak.md](kit/zadatak.md).

## Pokretanje

```bash
npm install
cp .env.example .env.local
npm run baza
npm run dev
```

U `.env.local` upiši `DATABASE_URL`. `npm run baza` briše sve i učitava tabele, početne podatke i `migracije/`. `npm run dev` pokreće frontend (obično http://localhost:5173) i backend (port 3000).

`npm run dev` radi u jednom terminalu, a ostale komande (`npm run baza`, `git`) idu u drugi.

## Šta radi (Faza 1)

- Lista narudžbi u Data Gridu: sortiranje, filter, pretraga (i bez kvačica), brzi filter po statusu, prikaz za mobitel.
- Detalji narudžbe: stavke, ukupan iznos, način plaćanja.
- Nova narudžba i izmjena narudžbe u statusu `KREIRANA` (ista forma). Broj narudžbe dodjeljuje server.
- Provjere na serveru i u formi (ista Zod šema u `shared/narudzba.ts`), uključujući neaktivan i nepostojeći proizvod.
- Brisanje narudžbe u statusu `KREIRANA`.
- Promjena statusa samo po tabeli dozvoljenih prelaza.
- Način plaćanja (`GOTOVINA`, `KARTICA`, `VIRMAN`), migracija `migracije/001-nacin-placanja.sql`.

Sve stavke Faze 1 iz kontrolne liste su testirane i označene u `kit/zadatak.md`.

## Odluke koje treba potvrditi

- Forma za novu narudžbu kao početni datum stavlja pravi današnji datum, a ne zadnji datum u podacima (31.12.2025.).
- Kad status postane `ISPORUCENA`, server sam upiše datum isporuke (današnji, ali ne raniji od datuma narudžbe).
- Nova narudžba nema unaprijed izabran način plaćanja: korisnik ga mora izabrati.

## Šta još ne radi / nije urađeno

- Faza 2 (analitika) i Faza 3 (pametni algoritmi) nisu urađene.
- Nema automatskih testova; testirano je ručno, po kontrolnoj listi.
- Iz dijela „Početak“ još nisu urađeni SQLBolt (lekcije 1–17) i React Tutorial.
- `npm run baza` briše i sve narudžbe unesene kroz aplikaciju (tako je zamišljeno).

## Struktura

- `server/index.ts`: sve API rute (Hono), `server/db.ts`: veza s bazom i transakcije
- `shared/narudzba.ts`: pravila za narudžbu (Zod), statusi i načini plaćanja; koriste ih i forma i server
- `src/narudzbe/`: lista, detalji i forma
- `migracije/`: promjene šeme baze
- `sql/prvi-upit.sql`: deset kupaca s najvećim prometom u zadnjoj godini podataka
