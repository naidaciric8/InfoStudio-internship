// Jedna funkcija za sve pozive backendu. Kad server vrati grešku (400, 404, 500),
// baci ApiGreska s porukom sa servera i greškama po poljima, da ih forma može prikazati.

export class ApiGreska extends Error {
  status: number;
  polja: Record<string, string>;

  constructor(poruka: string, status: number, polja: Record<string, string> = {}) {
    super(poruka);
    this.status = status;
    this.polja = polja;
  }
}

export async function api<T>(url: string, opcije: RequestInit = {}): Promise<T> {
  let odgovor: Response;
  try {
    odgovor = await fetch(url, {
      ...opcije,
      headers: { "Content-Type": "application/json", ...opcije.headers },
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiGreska("Server ne odgovara. Provjeri da li je backend pokrenut.", 0);
  }

  // Tijelo može biti prazno ili ne-JSON (npr. kad proxy ne dođe do backenda).
  const tijelo = await odgovor.json().catch(() => null);

  // VAŽNO: fetch NE baca grešku kad server vrati 400, 404 ili 500.
  // Za fetch je to "server je odgovorio", pa to smatra uspjehom.
  // Grešku baca samo kad server uopšte ne odgovara (to hvata catch iznad).
  // Zato SAMI provjeravamo odgovor.ok: true za 200/201, false za 400/404/500.
  if (!odgovor.ok) {
    // Bez JSON-a i s 5xx: backend uopšte nije odgovorio (Vite proxy vraća 500/502).
    if (tijelo === null && odgovor.status >= 500) {
      throw new ApiGreska("Server ne odgovara. Provjeri da li je backend pokrenut.", odgovor.status);
    }
    throw new ApiGreska(tijelo?.poruka ?? `Greška ${odgovor.status}.`, odgovor.status, tijelo?.polja);
  }
  return tijelo as T;
}

// Poruka za prikaz korisniku iz bilo koje greške.
export function porukaGreske(e: unknown) {
  return e instanceof Error ? e.message : "Nepoznata greška.";
}
