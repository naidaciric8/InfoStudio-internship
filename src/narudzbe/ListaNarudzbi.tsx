// Stranica Narudžbe: sve narudžbe u Data Gridu, sa sortiranjem, filterom i brzim filterom po statusu.
// Klik na red otvara detalje.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, Paper, Snackbar, Stack, Typography, useMediaQuery, useTheme } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { DataGrid, type GridColDef, type GridColumnVisibilityModel, type GridFilterModel } from "@mui/x-data-grid";
import { api, porukaGreske } from "../api";
import { formatDatum, formatKM, STATUS_NAZIV, uDate } from "../format";
import { STATUSI, type NarudzbaRed, type Status } from "../tipovi";
import DetaljiNarudzbe from "./DetaljiNarudzbe";
import NarudzbaForma from "./NarudzbaForma";
import StatusChip from "./StatusChip";

const kolone: GridColDef<NarudzbaRed>[] = [
  { field: "broj", headerName: "Broj", width: 150 },
  { field: "kupac", headerName: "Kupac", flex: 1, minWidth: 180 },
  {
    field: "datum",
    headerName: "Datum",
    type: "date",
    width: 130,
    // Grid sortira i filtrira po Date vrijednosti, a prikazuje naš format.
    valueGetter: (vrijednost: string) => uDate(vrijednost),
    valueFormatter: (_v, red) => formatDatum(red.datum),
  },
  {
    field: "status",
    headerName: "Status",
    type: "singleSelect",
    width: 140,
    valueOptions: STATUSI.map((s) => ({ value: s, label: STATUS_NAZIV[s] })),
    renderCell: (p) => <StatusChip status={p.row.status} />,
  },
  {
    field: "iznos",
    headerName: "Iznos",
    type: "number",
    width: 140,
    valueFormatter: (v: number) => formatKM(v),
  },
  // Kolona samo za mobitel: cijela narudžba u jednoj ćeliji, u dva reda, da se vidi bez pomjeranja ulijevo.
  {
    field: "kartica",
    headerName: "Narudžbe",
    flex: 1,
    sortable: false,
    filterable: false,
    disableColumnMenu: true,
    // Tekst po kojem radi pretraga (lupa) na mobitelu.
    valueGetter: (_v, red) => `${red.broj} ${red.kupac} ${STATUS_NAZIV[red.status]}`,
    renderCell: ({ row }) => (
      <Box sx={{ width: "100%", lineHeight: 1.4, py: 1 }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {row.kupac}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
            {formatKM(row.iznos)}
          </Typography>
        </Stack>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1, mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary" noWrap>
            {row.broj} · {formatDatum(row.datum)}
          </Typography>
          <StatusChip status={row.status} />
        </Stack>
      </Box>
    ),
  },
];

// Koje kolone se vide: na mobitelu samo "kartica", na većem ekranu sve osim nje.
const VIDLJIVOST_MOBITEL: GridColumnVisibilityModel = {
  broj: false,
  kupac: false,
  datum: false,
  status: false,
  iznos: false,
  kartica: true,
};
const VIDLJIVOST_RACUNAR: GridColumnVisibilityModel = { kartica: false };

export default function ListaNarudzbi() {
  const theme = useTheme();
  const naMobitelu = useMediaQuery(theme.breakpoints.down("sm"));
  const [vidljivost, setVidljivost] = useState<GridColumnVisibilityModel>(VIDLJIVOST_RACUNAR);
  // Kad se ekran suzi ili raširi (npr. okretanje telefona), vrati odgovarajuće kolone.
  useEffect(() => {
    setVidljivost(naMobitelu ? VIDLJIVOST_MOBITEL : VIDLJIVOST_RACUNAR);
  }, [naMobitelu]);

  const [narudzbe, setNarudzbe] = useState<NarudzbaRed[]>([]);
  const [ucitava, setUcitava] = useState(true);
  const [greska, setGreska] = useState<string | null>(null);
  const [odabranaId, setOdabranaId] = useState<number | null>(null);
  const [filter, setFilter] = useState<GridFilterModel>({ items: [] });
  const [formaOtvorena, setFormaOtvorena] = useState(false);
  const [poruka, setPoruka] = useState<string | null>(null); // tekst za Snackbar

  const ucitaj = useCallback(async () => {
    setUcitava(true);
    setGreska(null);
    try {
      setNarudzbe(await api<NarudzbaRed[]>("/api/narudzbe"));
    } catch (e) {
      setGreska(porukaGreske(e));
    } finally {
      setUcitava(false);
    }
  }, []);

  useEffect(() => {
    ucitaj();
  }, [ucitaj]);

  // Broj narudžbi po statusu, za brojke na čipovima iznad tabele.
  const poStatusu = useMemo(() => {
    const broj = Object.fromEntries(STATUSI.map((s) => [s, 0])) as Record<Status, number>;
    for (const n of narudzbe) broj[n.status]++;
    return broj;
  }, [narudzbe]);

  // Brzi filter: čip postavlja isti filter koji bi korisnik napravio u meniju kolone Status.
  const aktivniStatus = filter.items.find((f) => f.field === "status" && f.operator === "is")?.value as
    | Status
    | undefined;

  function filtrirajStatus(status: Status | undefined) {
    const ostali = filter.items.filter((f) => f.field !== "status");
    setFilter({
      ...filter,
      items: status ? [...ostali, { field: "status", operator: "is", value: status }] : ostali,
    });
  }

  return (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "flex-end" }, mb: 2 }}
      >
        <Box>
          <Typography variant="h5" component="h1">
            Narudžbe
          </Typography>
          <Typography color="text.secondary">Pregled svih narudžbi kupaca.</Typography>
        </Box>
        <Button variant="contained" size="large" startIcon={<AddIcon />} onClick={() => setFormaOtvorena(true)}>
          Nova narudžba
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mb: 2 }}>
        <Chip
          label={`Sve (${narudzbe.length})`}
          color={aktivniStatus ? "default" : "primary"}
          variant={aktivniStatus ? "outlined" : "filled"}
          onClick={() => filtrirajStatus(undefined)}
        />
        {STATUSI.map((s) => (
          <Chip
            key={s}
            label={`${STATUS_NAZIV[s]} (${poStatusu[s]})`}
            color={aktivniStatus === s ? "primary" : "default"}
            variant={aktivniStatus === s ? "filled" : "outlined"}
            onClick={() => filtrirajStatus(aktivniStatus === s ? undefined : s)}
          />
        ))}
      </Stack>

      {greska && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={ucitaj}>
              Pokušaj ponovo
            </Button>
          }
        >
          Narudžbe se nisu učitale: {greska}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ height: { xs: 560, md: "calc(100vh - 250px)" }, minHeight: 420 }}>
        <DataGrid
          rows={narudzbe}
          columns={kolone}
          columnVisibilityModel={vidljivost}
          onColumnVisibilityModelChange={setVidljivost}
          rowHeight={naMobitelu ? 72 : 52}
          columnHeaderHeight={naMobitelu ? 0 : 56}
          loading={ucitava}
          showToolbar
          filterModel={filter}
          onFilterModelChange={setFilter}
          onRowClick={(p) => setOdabranaId(p.row.id)}
          initialState={{
            sorting: { sortModel: [{ field: "datum", sort: "desc" }] },
            pagination: { paginationModel: { pageSize: 25 } },
          }}
          pageSizeOptions={[10, 25, 50, 100]}
          // Klik na zaglavlje mijenja samo uzlazno ↔ silazno. Bez ovoga treći klik poništi sortiranje.
          sortingOrder={["asc", "desc"]}
          // Pretraga i filter ne gledaju kvačice: "kafic" nađe "Kafić", "cokolada" nađe "Čokolada".
          ignoreDiacritics
          disableRowSelectionOnClick
        />
      </Paper>

      <Box sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Klikni na narudžbu da vidiš stavke.
        </Typography>
      </Box>

      <DetaljiNarudzbe id={odabranaId} onClose={() => setOdabranaId(null)} />

      <NarudzbaForma
        otvorena={formaOtvorena}
        onClose={() => setFormaOtvorena(false)}
        onSacuvano={(broj) => {
          setFormaOtvorena(false);
          setPoruka(`Narudžba ${broj} je sačuvana.`);
          ucitaj(); // nova narudžba se odmah vidi u listi
        }}
      />

      <Snackbar
        open={poruka !== null}
        autoHideDuration={5000}
        onClose={() => setPoruka(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setPoruka(null)} sx={{ width: "100%" }}>
          {poruka}
        </Alert>
      </Snackbar>
    </>
  );
}
