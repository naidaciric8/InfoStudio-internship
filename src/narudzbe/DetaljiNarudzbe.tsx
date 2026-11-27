// Dijalog s detaljima jedne narudžbe: zaglavlje, stavke s iznosom i ukupan iznos.
// Podatke učitava sam, sa GET /api/narudzbe/:id, svaki put kad se otvori za neku narudžbu.
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
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { api, porukaGreske } from "../api";
import { formatDatum, formatKM } from "../format";
import type { NarudzbaDetalji } from "../tipovi";
import StatusChip from "./StatusChip";

// Na mobitelu (xs) sakrivamo Cijenu i Rabat da tabela stane; Iznos ostaje.
const samoSiri = { display: { xs: "none", sm: "table-cell" }, whiteSpace: "nowrap" } as const;

type Props = {
  id: number | null; // null = dijalog je zatvoren
  onClose: () => void;
};

export default function DetaljiNarudzbe({ id, onClose }: Props) {
  const theme = useTheme();
  const naMobitelu = useMediaQuery(theme.breakpoints.down("sm"));

  const [narudzba, setNarudzba] = useState<NarudzbaDetalji | null>(null);
  const [greska, setGreska] = useState<string | null>(null);

  useEffect(() => {
    if (id === null) return;
    // AbortController: ako korisnik brzo otvori drugu narudžbu, stari zahtjev se prekida
    // i njegov odgovor ne prepiše novi.
    const kontroler = new AbortController();
    setNarudzba(null);
    setGreska(null);
    api<NarudzbaDetalji>(`/api/narudzbe/${id}`, { signal: kontroler.signal })
      .then(setNarudzba)
      .catch((e) => {
        if (!kontroler.signal.aborted) setGreska(porukaGreske(e));
      });
    return () => kontroler.abort();
  }, [id]);

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
                gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" },
                gap: 2,
                mb: 3,
              }}
            >
              <Podatak naziv="Kupac" vrijednost={narudzba.kupac} dodatno={narudzba.kupac_grad} />
              <Podatak naziv="Datum narudžbe" vrijednost={formatDatum(narudzba.datum)} />
              <Podatak naziv="Datum isporuke" vrijednost={formatDatum(narudzba.datum_isporuke)} />
              <Podatak naziv="Broj stavki" vrijednost={String(narudzba.stavke.length)} />
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

      <DialogActions>
        <Button onClick={onClose}>Zatvori</Button>
      </DialogActions>
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
