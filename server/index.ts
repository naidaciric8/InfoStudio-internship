// Backend: Hono na Node.js, port 3000. Frontend ga zove preko /api (vidi vite.config.ts).
// GET /api/provjera je samo provjera okruženja, a GET /api/kupci/:id primjer rute. Svoje rute dodaj pored njih.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pool, transakcija } from "./db";
import {
  DOZVOLJENI_PRELAZI,
  NarudzbaSema,
  PromjenaStatusaSema,
  type NarudzbaUlaz,
  type Status,
  type StavkaUlaz,
} from "../shared/narudzba";

const app = new Hono();

function opisGreske(e: unknown) {
  if (e instanceof AggregateError) return e.errors.map((x) => String(x?.message ?? x)).join("; ");
  return e instanceof Error ? e.message || e.name : String(e);
}

// Greške iz Zoda kao { "stavke.0.kolicina": "poruka" }: isti ključevi koje forma koristi u setError.
// Greška koja nije vezana za jedno polje (npr. .refine na cijelom objektu) ide pod "root".
function poljaIzZoda(greska: z.ZodError) {
  const polja: Record<string, string> = {};
  for (const issue of greska.issues) polja[issue.path.join(".") || "root"] ??= issue.message;
  return polja;
}

app.get("/api/provjera", async (c) => {
  if (!process.env.DATABASE_URL) {
    return c.json({ poruka: "Baza: nema DATABASE_URL. Kopiraj .env.example u .env.local." });
  }
  try {
    const r = await pool.query(`
      select (select count(*) from kupci)           as kupci,
             (select count(*) from proizvodi)       as proizvodi,
             (select count(*) from narudzbe)        as narudzbe,
             (select count(*) from stavke_narudzbe) as stavke_narudzbe`);
    const brojevi = Object.entries(r.rows[0]).map(([tabela, n]) => `${tabela} ${n}`);
    return c.json({ poruka: `Baza odgovara: ${brojevi.join(", ")}.` });
  } catch (e) {
    return c.json({ poruka: `Baza ne odgovara: ${opisGreske(e)}` });
  }
});

// Iznos jedne stavke: količina × cijena × (1 − rabat / 100), zaokružen na 2 decimale.
// Isti izraz koriste lista i detalji, pa se ukupni iznosi uvijek slažu.
const IZNOS_STAVKE = "round(s.kolicina * s.cijena_po_komadu * (1 - s.rabat_posto / 100), 2)";

// Primjer: jedan kupac po id-u. Neispravan zahtjev vraća 400 s porukom za svako polje.
// Vrijednost od korisnika ide u upit samo kao parametar ($1), nikad lijepljenjem u tekst upita.
// Ista provjera vrijedi za svaki id u adresi (kupac, narudžba...).
const IdParametri = z.object({
  id: z.coerce
    .number({ error: "Id mora biti broj." })
    .int({ error: "Id mora biti cijeli broj." })
    .positive({ error: "Id mora biti veći od nule." })
    .max(2147483647, { error: "Id je prevelik." }),
});

app.get("/api/kupci/:id", async (c) => {
  const ulaz = IdParametri.safeParse({ id: c.req.param("id") });
  if (!ulaz.success) {
    return c.json({ poruka: "Neispravan zahtjev.", polja: poljaIzZoda(ulaz.error) }, 400);
  }
  const r = await pool.query(
    "select id, sifra, naziv, vrsta, grad, email, kreiran from kupci where id = $1",
    [ulaz.data.id],
  );
  if (r.rows.length === 0) return c.json({ poruka: "Kupac ne postoji." }, 404);
  return c.json(r.rows[0]);
});

// Sve narudžbe za listu: broj, kupac, datum, status i ukupan iznos.
// LEFT JOIN: narudžba bez stavki se i dalje vidi, s iznosom 0.
app.get("/api/narudzbe", async (c) => {
  const rezultat = await pool.query(`
    SELECT
      n.id,
      n.broj,
      n.kupac_id,
      k.naziv AS kupac,
      n.datum,
      n.status,
      n.nacin_placanja,
      coalesce(sum(${IZNOS_STAVKE}), 0) AS iznos
    FROM narudzbe n
    JOIN kupci k ON k.id = n.kupac_id
    LEFT JOIN stavke_narudzbe s ON s.narudzba_id = n.id
    GROUP BY n.id, k.naziv
    ORDER BY n.datum DESC, n.id DESC
  `);
  return c.json(rezultat.rows);
});

// Detalji jedne narudžbe: zaglavlje, stavke s iznosom i ukupan iznos.
app.get("/api/narudzbe/:id", async (c) => {
  const ulaz = IdParametri.safeParse({ id: c.req.param("id") });
  if (!ulaz.success) {
    return c.json({ poruka: "Neispravan zahtjev.", polja: poljaIzZoda(ulaz.error) }, 400);
  }
  const id = ulaz.data.id;

  const zaglavlje = await pool.query(
    `SELECT n.id, n.broj, n.kupac_id, k.naziv AS kupac, k.grad AS kupac_grad,
            n.datum, n.datum_isporuke, n.status, n.nacin_placanja, n.napomena
     FROM narudzbe n
     JOIN kupci k ON k.id = n.kupac_id
     WHERE n.id = $1`,
    [id],
  );
  if (zaglavlje.rows.length === 0) return c.json({ poruka: "Narudžba ne postoji." }, 404);

  const stavke = await pool.query(
    `SELECT s.id, s.proizvod_id, p.sifra, p.naziv AS proizvod, p.jedinica_mjere,
            s.kolicina, s.cijena_po_komadu, s.rabat_posto,
            ${IZNOS_STAVKE} AS iznos
     FROM stavke_narudzbe s
     JOIN proizvodi p ON p.id = s.proizvod_id
     WHERE s.narudzba_id = $1
     ORDER BY s.id`,
    [id],
  );

  // Ukupno sabiramo u centima (cijeli brojevi), da izbjegnemo greške zaokruživanja (0.1 + 0.2).
  const ukupnoCenti = stavke.rows.reduce((zbir, s) => zbir + Math.round(s.iznos * 100), 0);
  return c.json({ ...zaglavlje.rows[0], stavke: stavke.rows, ukupno: ukupnoCenti / 100 });
});

// Brisanje narudžbe. Smije se obrisati samo KREIRANA; stavke briše baza (on delete cascade).
app.delete("/api/narudzbe/:id", async (c) => {
  // 1. Provjeri id (isto kao u ruti iznad)
  const ulaz = IdParametri.safeParse({ id: c.req.param("id") });
  if (!ulaz.success) {
    return c.json({ poruka: "Neispravan zahtjev.", polja: poljaIzZoda(ulaz.error) }, 400);
  }
  const id = ulaz.data.id;

  // 2. Obriši SAMO ako je KREIRANA. RETURNING id vrati id obrisanog reda (ili ništa).
  //    Provjera i brisanje su u JEDNOM upitu, pa niko ne može promijeniti status između njih.
  const obrisano = await pool.query(
    "DELETE FROM narudzbe WHERE id = $1 AND status = 'KREIRANA' RETURNING id",
    [id],
  );
  if (obrisano.rows.length > 0) {
    return c.json({ poruka: "Narudžba je obrisana." });
  }

  // 3. Ništa nije obrisano. Zašto? Ili ne postoji, ili nije KREIRANA.
  const postoji = await pool.query("SELECT status FROM narudzbe WHERE id = $1", [id]);
  if (postoji.rows.length === 0) {
    return c.json({ poruka: "Narudžba ne postoji." }, 404);
  }
  return c.json({ poruka: "Može se obrisati samo narudžba u statusu KREIRANA." }, 400);
});

// Promjena statusa, samo po tabeli dozvoljenih prelaza (shared/narudzba.ts).
// Kad narudžba postane ISPORUCENA, upiše se i datum isporuke.
// PATCH (a ne PUT) jer se mijenja samo jedan dio narudžbe, status, a ne cijela narudžba.
app.patch("/api/narudzbe/:id/status", async (c) => {
  const idUlaz = IdParametri.safeParse({ id: c.req.param("id") });
  if (!idUlaz.success) {
    return c.json({ poruka: "Neispravan zahtjev.", polja: poljaIzZoda(idUlaz.error) }, 400);
  }
  const tijelo = await c.req.json().catch(() => null);
  const ulaz = PromjenaStatusaSema.safeParse(tijelo);
  if (!ulaz.success) {
    return c.json({ poruka: "Neispravan zahtjev.", polja: poljaIzZoda(ulaz.error) }, 400);
  }
  const id = idUlaz.data.id;
  const novi = ulaz.data.status;

  const rezultat = await transakcija(async (client) => {
    // FOR UPDATE zaključa ovaj red do kraja transakcije: dvije istovremene promjene ne mogu se ispreplesti.
    const r = await client.query<{ status: Status }>("SELECT status FROM narudzbe WHERE id = $1 FOR UPDATE", [id]);
    if (r.rows.length === 0) return { kod: 404 as const };

    const trenutni = r.rows[0].status;
    if (!DOZVOLJENI_PRELAZI[trenutni].includes(novi)) return { kod: 400 as const, trenutni };

    // greatest(...): datum isporuke ne smije biti prije datuma narudžbe (pravilo u bazi).
    // $2::varchar kaže bazi da je $2 tekst (isti parametar se koristi na dva mjesta, pa ga ne zna sama odrediti).
    const azurirano = await client.query(
      `UPDATE narudzbe
       SET status = $2::varchar,
           datum_isporuke = CASE WHEN $2::varchar = 'ISPORUCENA' THEN greatest(current_date, datum) ELSE datum_isporuke END
       WHERE id = $1
       RETURNING id, broj, status, datum_isporuke`,
      [id, novi],
    );
    return { kod: 200 as const, narudzba: azurirano.rows[0] };
  });

  if (rezultat.kod === 404) return c.json({ poruka: "Narudžba ne postoji." }, 404);
  if (rezultat.kod === 400) {
    const poruka = `Status se ne može promijeniti iz ${rezultat.trenutni} u ${novi}.`;
    return c.json({ poruka, polja: { status: poruka } }, 400);
  }
  return c.json(rezultat.narudzba);
});

// Nova narudžba. Redoslijed:
// 1. Zod provjeri oblik podataka (kupac, datum, stavke, količine, cijene, rabat, duplikati).
// 2. U transakciji: provjera u bazi da kupac postoji i da su proizvodi aktivni,
//    pa novi broj narudžbe i upis narudžbe i stavki. Ako bilo šta padne, ne upiše se ništa.
app.post("/api/narudzbe", async (c) => {
  const tijelo = await c.req.json().catch(() => null);
  const ulaz = NarudzbaSema.safeParse(tijelo);
  if (!ulaz.success) {
    return c.json({ poruka: "Narudžba nije ispravna.", polja: poljaIzZoda(ulaz.error) }, 400);
  }
  const narudzba = ulaz.data;

  const rezultat = await transakcija(async (client) => {
    const greske = await provjeriUBazi(client, narudzba);
    if (Object.keys(greske).length > 0) return { greske };

    const broj = await sljedeciBroj(client, narudzba.datum);
    const nova = await client.query(
      `INSERT INTO narudzbe (broj, kupac_id, datum, nacin_placanja, status)
       VALUES ($1, $2, $3, $4, 'KREIRANA') RETURNING id, broj, status`,
      [broj, narudzba.kupac_id, narudzba.datum, narudzba.nacin_placanja],
    );
    await upisiStavke(client, nova.rows[0].id, narudzba.stavke);
    return { narudzba: nova.rows[0] };
  });

  if ("greske" in rezultat) {
    return c.json({ poruka: "Narudžba nije ispravna.", polja: rezultat.greske }, 400);
  }
  return c.json(rezultat.narudzba, 201);
});

// Izmjena narudžbe (kupac, datum, stavke). Ista pravila kao za novu narudžbu (NarudzbaSema, provjeriUBazi).
// Smije se mijenjati samo KREIRANA narudžba. Broj se ne mijenja ni kad se promijeni datum.
// PUT (a ne PATCH) jer se šalje i zamjenjuje CIJELA narudžba: kupac, datum i sve stavke.
app.put("/api/narudzbe/:id", async (c) => {
  const idUlaz = IdParametri.safeParse({ id: c.req.param("id") });
  if (!idUlaz.success) {
    return c.json({ poruka: "Neispravan zahtjev.", polja: poljaIzZoda(idUlaz.error) }, 400);
  }
  const tijelo = await c.req.json().catch(() => null);
  const ulaz = NarudzbaSema.safeParse(tijelo);
  if (!ulaz.success) {
    return c.json({ poruka: "Narudžba nije ispravna.", polja: poljaIzZoda(ulaz.error) }, 400);
  }
  const id = idUlaz.data.id;
  const narudzba = ulaz.data;

  const rezultat = await transakcija(async (client) => {
    // FOR UPDATE: niko drugi ne može mijenjati ovu narudžbu (npr. status) dok traje izmjena.
    const r = await client.query<{ status: Status }>("SELECT status FROM narudzbe WHERE id = $1 FOR UPDATE", [id]);
    if (r.rows.length === 0) return { kod: 404 as const };
    if (r.rows[0].status !== "KREIRANA") return { kod: 400 as const };

    const greske = await provjeriUBazi(client, narudzba);
    if (Object.keys(greske).length > 0) return { kod: 422 as const, greske };

    const azurirana = await client.query(
      "UPDATE narudzbe SET kupac_id = $2, datum = $3, nacin_placanja = $4 WHERE id = $1 RETURNING id, broj, status",
      [id, narudzba.kupac_id, narudzba.datum, narudzba.nacin_placanja],
    );
    // Stavke: najjednostavnije je obrisati stare i upisati nove (sve je u istoj transakciji).
    await client.query("DELETE FROM stavke_narudzbe WHERE narudzba_id = $1", [id]);
    await upisiStavke(client, id, narudzba.stavke);
    return { kod: 200 as const, narudzba: azurirana.rows[0] };
  });

  if (rezultat.kod === 404) return c.json({ poruka: "Narudžba ne postoji." }, 404);
  if (rezultat.kod === 400) {
    return c.json({ poruka: "Mijenjati se može samo narudžba u statusu KREIRANA." }, 400);
  }
  if (rezultat.kod === 422) {
    return c.json({ poruka: "Narudžba nije ispravna.", polja: rezultat.greske }, 400);
  }
  return c.json(rezultat.narudzba);
});

// Provjere koje traže bazu: kupac postoji, svaki proizvod postoji i aktivan je.
// Vraća greške po poljima, u istom obliku kao poljaIzZoda, da ih forma prikaže uz pravo polje.
async function provjeriUBazi(client: PoolClient, narudzba: NarudzbaUlaz) {
  const greske: Record<string, string> = {};

  const kupac = await client.query("SELECT 1 FROM kupci WHERE id = $1", [narudzba.kupac_id]);
  if (kupac.rows.length === 0) greske.kupac_id = "Kupac ne postoji.";

  // Jedan upit za sve proizvode: "= ANY($1)" znači "id je u ovoj listi".
  const ids = narudzba.stavke.map((s) => s.proizvod_id);
  const proizvodi = await client.query<{ id: number; naziv: string; aktivan: boolean }>(
    "SELECT id, naziv, aktivan FROM proizvodi WHERE id = ANY($1)",
    [ids],
  );
  const poId = new Map(proizvodi.rows.map((p) => [p.id, p]));
  narudzba.stavke.forEach((s, i) => {
    const p = poId.get(s.proizvod_id);
    if (!p) greske[`stavke.${i}.proizvod_id`] = "Proizvod ne postoji.";
    else if (!p.aktivan) greske[`stavke.${i}.proizvod_id`] = `Proizvod „${p.naziv}" više nije aktivan.`;
  });

  return greske;
}

// Sljedeći broj u godini iz datuma narudžbe: N-2025-00001, N-2025-00002...
// Zaključavanje (advisory lock) za tu godinu traje do kraja transakcije: ako dvoje snima u isto vrijeme,
// drugi čeka da prvi završi, pa ne mogu dobiti isti broj.
async function sljedeciBroj(client: PoolClient, datum: string) {
  const godina = Number(datum.slice(0, 4));
  await client.query("SELECT pg_advisory_xact_lock($1)", [godina]);
  const r = await client.query(
    "SELECT coalesce(max(substring(broj from 8)::int), 0) + 1 AS sljedeci FROM narudzbe WHERE broj LIKE $1",
    [`N-${godina}-%`],
  );
  return `N-${godina}-${String(r.rows[0].sljedeci).padStart(5, "0")}`;
}

async function upisiStavke(client: PoolClient, narudzbaId: number, stavke: StavkaUlaz[]) {
  for (const s of stavke) {
    await client.query(
      `INSERT INTO stavke_narudzbe (narudzba_id, proizvod_id, kolicina, cijena_po_komadu, rabat_posto)
       VALUES ($1, $2, $3, $4, $5)`,
      [narudzbaId, s.proizvod_id, s.kolicina, s.cijena_po_komadu, s.rabat_posto],
    );
  }
}

// Svi kupci, za izbor u formi.
app.get("/api/kupci", async (c) => {
  const rezultat = await pool.query(
    "SELECT id, sifra, naziv, vrsta, grad FROM kupci ORDER BY naziv",
  );
  return c.json(rezultat.rows);
});

// Aktivni proizvodi s trenutnom cijenom iz cjenovnika, za izbor stavki u formi.
app.get("/api/proizvodi", async (c) => {
  const rezultat = await pool.query(`
    SELECT p.id, p.sifra, p.naziv, p.jedinica_mjere, p.cijena, k.naziv AS kategorija
    FROM proizvodi p
    JOIN kategorije k ON k.id = p.kategorija_id
    WHERE p.aktivan
    ORDER BY k.naziv, p.naziv
  `);
  return c.json(rezultat.rows);
});

// Neočekivana greška (npr. iz baze) vraća JSON s porukom, ne običan tekst "Internal Server Error".
app.onError((e, c) => {
  if (e instanceof HTTPException) return e.getResponse();
  console.error(e);
  return c.json({ poruka: `Greška na serveru: ${opisGreske(e)}` }, 500);
});

// Samo na ovom računaru (127.0.0.1), da backend nije otvoren na mreži.
serve({ fetch: app.fetch, port: 3000, hostname: "127.0.0.1" }, (info) => {
  console.log(`Backend radi na http://localhost:${info.port}`);
});
