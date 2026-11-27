// Pravila za narudžbu, zajednička za frontend i backend.
// Forma (React Hook Form) i server (Hono) koriste ISTU Zod šemu, pa poruke i pravila ne mogu da se razilaze.
// Server ipak uvijek provjerava sam: ono što pošalje forma ili fetch iz konzole za njega je isto nepouzdano.
// Ono što se ne može provjeriti bez baze (da li proizvod postoji i da li je aktivan) provjerava samo server.
import { z } from "zod";

// Gornje granice štite kolone u bazi: integer ide do ~2,1 milijardu, numeric(12,2) do 9.999.999.999,99.
const MAX_KOLICINA = 1_000_000;
const MAX_CIJENA = 1_000_000;

export const StavkaSema = z.object({
  proizvod_id: z
    .number({ error: "Izaberi proizvod." })
    .int({ error: "Izaberi proizvod." })
    .positive({ error: "Izaberi proizvod." }),
  kolicina: z
    .number({ error: "Upiši količinu." })
    .int({ error: "Količina mora biti cijeli broj." })
    .positive({ error: "Količina mora biti veća od nule." })
    .max(MAX_KOLICINA, { error: "Količina je prevelika." }),
  cijena_po_komadu: z
    .number({ error: "Upiši cijenu." })
    .min(0, { error: "Cijena ne može biti negativna." })
    .max(MAX_CIJENA, { error: "Cijena je prevelika." }),
  rabat_posto: z
    .number({ error: "Upiši rabat (0 ako ga nema)." })
    .min(0, { error: "Rabat mora biti od 0 do 100." })
    .max(100, { error: "Rabat mora biti od 0 do 100." }),
});

export const NarudzbaSema = z
  .object({
    kupac_id: z
      .number({ error: "Izaberi kupca." })
      .int({ error: "Izaberi kupca." })
      .positive({ error: "Izaberi kupca." }),
    datum: z
      .string({ error: "Upiši datum." })
      .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Upiši datum." })
      .refine(postojiDatum, { error: "Datum nije ispravan." }),
    stavke: z.array(StavkaSema, { error: "Dodaj bar jednu stavku." }).min(1, { error: "Dodaj bar jednu stavku." }),
  }, { error: "Zahtjev mora biti JSON objekat s narudžbom." })
  // Isti proizvod smije biti samo jednom. Greška ide na drugo (ponovljeno) pojavljivanje.
  .superRefine((narudzba, ctx) => {
    const vidjeni = new Set<number>();
    narudzba.stavke.forEach((stavka, i) => {
      if (vidjeni.has(stavka.proizvod_id)) {
        ctx.addIssue({
          code: "custom",
          path: ["stavke", i, "proizvod_id"],
          message: "Ovaj proizvod je već u narudžbi.",
        });
      }
      vidjeni.add(stavka.proizvod_id);
    });
  });

export type NarudzbaUlaz = z.infer<typeof NarudzbaSema>;
export type StavkaUlaz = z.infer<typeof StavkaSema>;

// "2025-02-30" ima ispravan oblik, ali takav dan ne postoji. Godina je ograničena jer broj narudžbe ima 4 cifre godine.
function postojiDatum(tekst: string) {
  const [g, m, d] = tekst.split("-").map(Number);
  const datum = new Date(Date.UTC(g, m - 1, d));
  return (
    g >= 2000 && g <= 2100 && datum.getUTCFullYear() === g && datum.getUTCMonth() === m - 1 && datum.getUTCDate() === d
  );
}

// Iznos stavke, isto pravilo kao u SQL-u na serveru: količina × cijena × (1 − rabat / 100), na 2 decimale.
export function iznosStavke(s: { kolicina: number; cijena_po_komadu: number; rabat_posto: number }) {
  const iznos = s.kolicina * s.cijena_po_komadu * (1 - s.rabat_posto / 100);
  return Number.isFinite(iznos) ? Math.round(iznos * 100) / 100 : 0;
}
