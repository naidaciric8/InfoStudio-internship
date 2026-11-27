// Oblik podataka koje backend vraća. Isti nazivi polja kao u JSON-u sa servera.

// Statusi su definisani u shared/narudzba.ts (koristi ih i server), ovdje se samo prosljeđuju dalje.
import type { Status } from "../shared/narudzba";
export { STATUSI, type Status } from "../shared/narudzba";

// Red u listi narudžbi (GET /api/narudzbe)
export type NarudzbaRed = {
  id: number;
  broj: string;
  kupac_id: number;
  kupac: string;
  datum: string; // "2025-12-31"
  status: Status;
  iznos: number;
};

// Stavka u detaljima narudžbe
export type Stavka = {
  id: number;
  proizvod_id: number;
  sifra: string;
  proizvod: string;
  jedinica_mjere: string;
  kolicina: number;
  cijena_po_komadu: number;
  rabat_posto: number;
  iznos: number;
};

// Detalji narudžbe (GET /api/narudzbe/:id)
export type NarudzbaDetalji = {
  id: number;
  broj: string;
  kupac_id: number;
  kupac: string;
  kupac_grad: string;
  datum: string;
  datum_isporuke: string | null;
  status: Status;
  napomena: string | null;
  stavke: Stavka[];
  ukupno: number;
};

export type Kupac = { id: number; sifra: string; naziv: string; vrsta: string; grad: string };

export type Proizvod = {
  id: number;
  sifra: string;
  naziv: string;
  jedinica_mjere: string;
  cijena: number;
  kategorija: string;
};
