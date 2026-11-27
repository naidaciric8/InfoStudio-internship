// Prikaz iznosa, datuma i statusa na jednom mjestu, da svuda izgledaju isto.
import type { ChipProps } from "@mui/material/Chip";
import type { NacinPlacanja, Status } from "./tipovi";

// 1234.5 → "1.234,50 KM"
// Formatiramo ručno: Chrome nema bosanska pravila za brojeve, pa bi Intl.NumberFormat("bs-BA")
// napisao "1,234.50". Ovako je zapis isti u svakom pregledniku.
export function formatKM(iznos: number) {
  const [cijeli, decimale] = Math.abs(iznos).toFixed(2).split(".");
  const sTackama = cijeli.replace(/\B(?=(\d{3})+(?!\d))/g, "."); // 1234567 → 1.234.567
  return `${iznos < 0 ? "−" : ""}${sTackama},${decimale} KM`;
}

// "2025-12-31" → "31.12.2025."
export function formatDatum(datum: string | null | undefined) {
  if (!datum) return "—";
  const [godina, mjesec, dan] = datum.split("-");
  return `${dan}.${mjesec}.${godina}.`;
}

// Datum iz baze ("2025-12-31") kao Date u lokalnoj ponoći, za sortiranje i filter u Data Gridu.
export function uDate(datum: string) {
  return new Date(`${datum}T00:00:00`);
}

export const STATUS_NAZIV: Record<Status, string> = {
  KREIRANA: "Kreirana",
  U_OBRADI: "U obradi",
  POSLATA: "Poslata",
  ISPORUCENA: "Isporučena",
  OTKAZANA: "Otkazana",
};

export const STATUS_BOJA: Record<Status, ChipProps["color"]> = {
  KREIRANA: "info",
  U_OBRADI: "warning",
  POSLATA: "primary",
  ISPORUCENA: "success",
  OTKAZANA: "error",
};

// Način plaćanja za prikaz (u bazi je VIRMAN, na ekranu Virman).
export const NACIN_PLACANJA_NAZIV: Record<NacinPlacanja, string> = {
  GOTOVINA: "Gotovina",
  KARTICA: "Kartica",
  VIRMAN: "Virman",
};
