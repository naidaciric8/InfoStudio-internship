// Dijalog s detaljima jedne narudžbe: zaglavlje, stavke s iznosom i ukupan iznos.
// Podatke učitava sam, sa GET /api/narudzbe/:id, svaki put kad se otvori za neku narudžbu.
// Narudžba u statusu KREIRANA može se obrisati, uz potvrdu (DELETE /api/narudzbe/:id).
// Status se mijenja s padajuće liste koja nudi samo dozvoljene prelaze (PATCH /api/narudzbe/:id/status).
import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { api, porukaGreske } from "../api";
import { formatDatum, formatKM, NACIN_PLACANJA_NAZIV, STATUS_NAZIV } from "../format";
import type { NarudzbaDetalji, Status } from "../tipovi";
import { DOZVOLJENI_PRELAZI } from "../../shared/narudzba";
import StatusChip from "./StatusChip";

// Na mobitelu (xs) sakrivamo Cijenu i Rabat da tabela stane; Iznos ostaje.
const samoSiri = { display: { xs: "none", sm: "table-cell" }, whiteSpace: "nowrap" } as const;

type Props = {
  id: number | null; // null = dijalog je zatvoren
  onClose: () => void;
  onObrisano: (broj: string) => void; // poslije brisanja: lista zatvori detalje, osvježi se i javi poruku
  onStatusPromijenjen: (broj: string, status: Status) => void; // lista se osvježi i javi poruku
  onIzmijeni: (id: number) => void; // lista zatvori detalje i otvori formu za izmjenu
};

export default function DetaljiNarudzbe({ id, onClose, onObrisano, onStatusPromijenjen, onIzmijeni }: Props) {
  const theme = useTheme();
  const naMobitelu = useMediaQuery(theme.breakpoints.down("sm"));

  const [narudzba, setNarudzba] = useState<NarudzbaDetalji | null>(null);
  const [greska, setGreska] = useState<string | null>(null);

  // Brisanje: prvo se otvori mali dijalog "Da li ste sigurni?", tek onda se šalje zahtjev.
  const [potvrdaOtvorena, setPotvrdaOtvorena] = useState(false);
  const [brise, setBrise] = useState(false);
  const [greskaBrisanja, setGreskaBrisanja] = useState<string | null>(null);

  // Promjena statusa: izabrani novi status ("" = ništa nije izabrano).
  const [noviStatus, setNoviStatus] = useState<Status | "">("");
  const [mijenja, setMijenja] = useState(false);
  const [greskaStatusa, setGreskaStatusa] = useState<string | null>(null);

  useEffect(() => {
    if (id === null) return;
    // AbortController: ako korisnik brzo otvori drugu narudžbu, stari zahtjev se prekida
    // i njegov odgovor ne prepiše novi.
    const kontroler = new AbortController();
    setNarudzba(null);
    setGreska(null);
    setPotvrdaOtvorena(false);
    setGreskaBrisanja(null);
    setNoviStatus("");
    setGreskaStatusa(null);
    api<NarudzbaDetalji>(`/api/narudzbe/${id}`, { signal: kontroler.signal })
      .then(setNarudzba)
      .catch((e) => {
        if (!kontroler.signal.aborted) setGreska(porukaGreske(e));
      });
    return () => kontroler.abort();
  }, [id]);

  async function obrisi() {
    if (!narudzba) return;
    setBrise(true);
    setGreskaBrisanja(null);
    try {
      await api(`/api/narudzbe/${narudzba.id}`, { method: "DELETE" });
      setPotvrdaOtvorena(false);
      onObrisano(narudzba.broj);
    } catch (e) {
      // Npr. neko je u međuvremenu promijenio status, pa server vrati 400 s porukom.
      setGreskaBrisanja(porukaGreske(e));
    } finally {
      setBrise(false);
    }
  }

  async function promijeniStatus() {
    if (!narudzba || !noviStatus) return;
    setMijenja(true);
    setGreskaStatusa(null);
    try {
      // PATCH = HTTP metoda za promjenu DIJELA postojećeg podatka (ovdje samo statusa).
      // Za poređenje: GET čita, POST pravi novo, DELETE briše, PUT zamijeni cijeli podatak.
      const odgovor = await api<{ status: Status; datum_isporuke: string | null }>(
        `/api/narudzbe/${narudzba.id}/status`,
        { method: "PATCH", body: JSON.stringify({ status: noviStatus }) },
      );
      // Prozor ostaje otvoren s novim statusom (i datumom isporuke, ako je isporučena).
      setNarudzba({ ...narudzba, status: odgovor.status, datum_isporuke: odgovor.datum_isporuke });
      setNoviStatus("");
      onStatusPromijenjen(narudzba.broj, odgovor.status);
    } catch (e) {
      setGreskaStatusa(porukaGreske(e));
    } finally {
      setMijenja(false);
    }
  }

  const mozeBrisati = narudzba?.status === "KREIRANA";
  // Samo statusi u koje se iz trenutnog smije preći (tabela iz zadatka, shared/narudzba.ts).
  const prelazi = narudzba ? DOZVOLJENI_PRELAZI[narudzba.status] : [];

  return (
    <Dialog open={id !== null} onClose={onClose} fullWidth maxWidth="md" fullScreen={naMobitelu}>
      <DialogTitle component="div">
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Typography variant="h6" component="h2">
            {narudzba ? `Narudžba ${narudzba.broj}` : "Narudžba"}
          </Typography>
          {narudzba && <StatusChip status={narudzba.status} />}
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        {greska && <Alert severity="error">{greska}</Alert>}

        {!greska && !narudzba && (
          <Stack spacing={1}>
            <Skeleton variant="rounded" height={64} />
            <Skeleton variant="rounded" height={220} />
          </Stack>
        )}

        {narudzba && (
          <>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", md: "repeat(5, 1fr)" },
                gap: 2,
                mb: 3,
              }}
            >
              <Podatak naziv="Kupac" vrijednost={narudzba.kupac} dodatno={narudzba.kupac_grad} />
              <Podatak naziv="Datum narudžbe" vrijednost={formatDatum(narudzba.datum)} />
              <Podatak naziv="Datum isporuke" vrijednost={formatDatum(narudzba.datum_isporuke)} />
              <Podatak naziv="Način plaćanja" vrijednost={NACIN_PLACANJA_NAZIV[narudzba.nacin_placanja]} />
              <Podatak naziv="Broj stavki" vrijednost={String(narudzba.stavke.length)} />
            </Box>

            {/* Promjena statusa */}
            <Box sx={{ mb: 3, p: 2, borderRadius: 2, bgcolor: "action.hover" }}>
              {prelazi.length > 0 ? (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
                  <TextField
                    select
                    size="small"
                    label="Promijeni status u"
                    value={noviStatus}
                    onChange={(e) => setNoviStatus(e.target.value as Status)}
                    sx={{ minWidth: 220, bgcolor: "background.paper" }}
                  >
                    {prelazi.map((s) => (
                      <MenuItem key={s} value={s}>
                        {STATUS_NAZIV[s]}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button variant="contained" onClick={promijeniStatus} disabled={!noviStatus} loading={mijenja}>
                    Promijeni status
                  </Button>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Status {STATUS_NAZIV[narudzba.status]} je konačan i više se ne može mijenjati.
                </Typography>
              )}
              {greskaStatusa && (
                <Alert severity="error" sx={{ mt: 1.5 }}>
                  {greskaStatusa}
                </Alert>
              )}
            </Box>

            {narudzba.napomena && (
              <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
                {narudzba.napomena}
              </Alert>
            )}

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Proizvod</TableCell>
                    <TableCell align="right">Količina</TableCell>
                    <TableCell align="right" sx={samoSiri}>Cijena</TableCell>
                    <TableCell align="right" sx={samoSiri}>Rabat</TableCell>
                    <TableCell align="right">Iznos</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {narudzba.stavke.map((s) => (
                    <TableRow key={s.id} hover>
                      <TableCell>
                        <Typography variant="body2">{s.proizvod}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {s.sifra}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        {s.kolicina} {s.jedinica_mjere}
                      </TableCell>
                      <TableCell align="right" sx={samoSiri}>{formatKM(s.cijena_po_komadu)}</TableCell>
                      <TableCell align="right" sx={samoSiri}>{s.rabat_posto > 0 ? `${s.rabat_posto} %` : "—"}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{formatKM(s.iznos)}</TableCell>
                    </TableRow>
                  ))}
                  {narudzba.stavke.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ color: "text.secondary" }}>
                        Narudžba nema stavki.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <Divider sx={{ my: 2 }} />
            <Stack direction="row" sx={{ justifyContent: "flex-end", alignItems: "baseline", gap: 2 }}>
              <Typography color="text.secondary">Ukupno</Typography>
              <Typography variant="h6">{formatKM(narudzba.ukupno)}</Typography>
            </Stack>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, justifyContent: "space-between" }}>
        {/* Izmijeni i Obriši: aktivni samo za KREIRANU narudžbu (isto pravilo provjerava i server). */}
        <Stack direction="row" spacing={1}>
          <Tooltip title={mozeBrisati ? "" : "Mijenjati se može samo narudžba u statusu Kreirana"}>
            <span>
              <Button
                startIcon={<EditOutlinedIcon />}
                disabled={!mozeBrisati}
                onClick={() => narudzba && onIzmijeni(narudzba.id)}
              >
                Izmijeni
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={mozeBrisati ? "" : "Obrisati se može samo narudžba u statusu Kreirana"}>
            <span>
              <Button
                color="error"
                startIcon={<DeleteOutlinedIcon />}
                disabled={!mozeBrisati}
                onClick={() => setPotvrdaOtvorena(true)}
              >
                Obriši
              </Button>
            </span>
          </Tooltip>
        </Stack>
        <Button onClick={onClose}>Zatvori</Button>
      </DialogActions>

      {/* Potvrda brisanja: brisanje se ne može poništiti, pa pitamo još jednom. */}
      <Dialog open={potvrdaOtvorena} onClose={() => !brise && setPotvrdaOtvorena(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Obrisati narudžbu?</DialogTitle>
        <DialogContent>
          {greskaBrisanja && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {greskaBrisanja}
            </Alert>
          )}
          <Typography>
            Narudžba <b>{narudzba?.broj}</b> ({narudzba?.kupac}) i sve njene stavke bit će trajno obrisane. Ovo se ne
            može poništiti.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPotvrdaOtvorena(false)} disabled={brise} color="inherit">
            Odustani
          </Button>
          <Button onClick={obrisi} loading={brise} variant="contained" color="error">
            Obriši
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

function Podatak({ naziv, vrijednost, dodatno }: { naziv: string; vrijednost: string; dodatno?: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {naziv}
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 500 }}>
        {vrijednost}
      </Typography>
      {dodatno && (
        <Typography variant="body2" color="text.secondary">
          {dodatno}
        </Typography>
      )}
    </Box>
  );
}
