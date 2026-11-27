// Forma za novu narudžbu i za izmjenu postojeće (ista forma): kupac, datum, način plaćanja i stavke.
// Stavka se dodaje i uklanja, a cijena se popuni iz cjenovnika kad se izabere proizvod (i može se promijeniti).
// Nova narudžba: POST /api/narudzbe. Izmjena: forma se popuni postojećom narudžbom i šalje PUT /api/narudzbe/:id.
// Provjera: ista Zod šema kao na serveru (shared/narudzba.ts). Greške koje vrati server
// (npr. proizvod u međuvremenu nije aktivan) prikazuju se uz polje na koje se odnose.
import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch, type Control, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { api, ApiGreska, porukaGreske } from "../api";
import { formatKM, NACIN_PLACANJA_NAZIV } from "../format";
import type { Kupac, NarudzbaDetalji, Proizvod } from "../tipovi";
import { iznosStavke, NACINI_PLACANJA, NarudzbaSema, type NarudzbaUlaz, type StavkaUlaz } from "../../shared/narudzba";

type Props = {
  otvorena: boolean;
  izmjenaId?: number | null; // id narudžbe koja se mijenja; null ili bez ovoga = nova narudžba
  onClose: () => void;
  onSacuvano: (broj: string) => void;
};

// Nova, prazna stavka. 0 znači "proizvod nije izabran", NaN "cijena nije upisana".
const praznaStavka = (): StavkaUlaz => ({ proizvod_id: 0, kolicina: 1, cijena_po_komadu: NaN, rabat_posto: 0 });

// Današnji datum kao "2026-11-26", po lokalnom vremenu (toISOString bi dao UTC i nekad jučerašnji dan).
function danas() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function NarudzbaForma({ otvorena, izmjenaId = null, onClose, onSacuvano }: Props) {
  const theme = useTheme();
  const naMobitelu = useMediaQuery(theme.breakpoints.down("sm"));

  const [kupci, setKupci] = useState<Kupac[]>([]);
  const [proizvodi, setProizvodi] = useState<Proizvod[]>([]);
  const [ucitava, setUcitava] = useState(false);
  const [greskaUcitavanja, setGreskaUcitavanja] = useState<string | null>(null);
  const [greskaServera, setGreskaServera] = useState<string | null>(null);
  const [brojIzmjene, setBrojIzmjene] = useState<string | null>(null); // broj narudžbe koja se mijenja (za naslov)

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NarudzbaUlaz>({
    resolver: zodResolver(NarudzbaSema),
    mode: "onTouched", // greška se pokaže kad korisnik napusti polje, ne dok tek kuca
    defaultValues: { kupac_id: 0, datum: danas(), stavke: [praznaStavka()] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "stavke" });

  // Svaki put kad se forma otvori: svježi kupci i proizvodi (cjenovnik se može promijeniti).
  // Kod izmjene se učita i narudžba, pa se forma popuni njenim podacima.
  useEffect(() => {
    if (!otvorena) return;
    reset({ kupac_id: 0, datum: danas(), stavke: [praznaStavka()] });
    setGreskaServera(null);
    setGreskaUcitavanja(null);
    setBrojIzmjene(null);
    setUcitava(true);
    Promise.all([
      api<Kupac[]>("/api/kupci"),
      api<Proizvod[]>("/api/proizvodi"),
      izmjenaId ? api<NarudzbaDetalji>(`/api/narudzbe/${izmjenaId}`) : Promise.resolve(null),
    ])
      .then(([k, p, postojeca]) => {
        setKupci(k);
        if (!postojeca) {
          setProizvodi(p);
          return;
        }
        // Proizvod iz stare narudžbe koji više nije aktivan nije u cjenovniku, pa ga dodajemo u listu
        // (označen), da se vidi šta je bilo. Server će ga pri snimanju odbiti, pa ga korisnik zamijeni.
        const aktivni = new Set(p.map((x) => x.id));
        const neaktivni: Proizvod[] = postojeca.stavke
          .filter((s) => !aktivni.has(s.proizvod_id))
          .map((s) => ({
            id: s.proizvod_id,
            sifra: s.sifra,
            naziv: `${s.proizvod} (nije aktivan)`,
            jedinica_mjere: s.jedinica_mjere,
            cijena: s.cijena_po_komadu,
            kategorija: "Neaktivni proizvodi",
          }));
        setProizvodi([...p, ...neaktivni]);
        setBrojIzmjene(postojeca.broj);
        // Cijene ostaju one iz narudžbe (cijena u trenutku narudžbe), ne današnje iz cjenovnika.
        reset({
          kupac_id: postojeca.kupac_id,
          datum: postojeca.datum,
          nacin_placanja: postojeca.nacin_placanja,
          stavke: postojeca.stavke.map((s) => ({
            proizvod_id: s.proizvod_id,
            kolicina: s.kolicina,
            cijena_po_komadu: s.cijena_po_komadu,
            rabat_posto: s.rabat_posto,
          })),
        });
      })
      .catch((e) => setGreskaUcitavanja(porukaGreske(e)))
      .finally(() => setUcitava(false));
  }, [otvorena, izmjenaId, reset]);

  async function sacuvaj(narudzba: NarudzbaUlaz) {
    setGreskaServera(null);
    try {
      // Nova narudžba → POST na /api/narudzbe. Izmjena → PUT na /api/narudzbe/:id (ista pravila na serveru).
      const odgovor = await api<{ id: number; broj: string }>(
        izmjenaId ? `/api/narudzbe/${izmjenaId}` : "/api/narudzbe",
        { method: izmjenaId ? "PUT" : "POST", body: JSON.stringify(narudzba) },
      );
      onSacuvano(odgovor.broj);
    } catch (e) {
      if (e instanceof ApiGreska && Object.keys(e.polja).length > 0) {
        // Ključevi sa servera ("stavke.0.proizvod_id") su isti kao nazivi polja u formi.
        for (const [polje, poruka] of Object.entries(e.polja)) {
          if (polje === "root") setGreskaServera(poruka);
          else setError(polje as FieldPath<NarudzbaUlaz>, { type: "server", message: poruka });
        }
        setGreskaServera((p) => p ?? `${e.message} Provjeri označena polja.`);
      } else {
        setGreskaServera(porukaGreske(e));
      }
    }
  }

  // Klik pored dijaloga ga ne zatvara, da se slučajno ne izgubi unos. Zatvara se dugmetom Odustani ili Esc.
  function zatvori(_: unknown, razlog?: string) {
    if (isSubmitting || razlog === "backdropClick") return;
    onClose();
  }

  const greskaStavki = errors.stavke?.message ?? errors.stavke?.root?.message;

  return (
    <Dialog open={otvorena} onClose={zatvori} fullWidth maxWidth="md" fullScreen={naMobitelu}>
      <form onSubmit={handleSubmit(sacuvaj)} noValidate>
        <DialogTitle>{izmjenaId ? `Izmjena narudžbe ${brojIzmjene ?? ""}` : "Nova narudžba"}</DialogTitle>
        {ucitava && <LinearProgress />}

        <DialogContent dividers>
          {greskaUcitavanja && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Podaci za formu se nisu učitali: {greskaUcitavanja}
            </Alert>
          )}
          {greskaServera && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {greskaServera}
            </Alert>
          )}

          {/* Kupac, datum i način plaćanja */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr 1fr" }, gap: 2, mb: 3 }}>
            <Controller
              name="kupac_id"
              control={control}
              render={({ field, fieldState }) => (
                <Autocomplete
                  options={kupci}
                  value={kupci.find((k) => k.id === field.value) ?? null}
                  onChange={(_, kupac) => field.onChange(kupac?.id ?? 0)}
                  onBlur={field.onBlur}
                  getOptionLabel={(k) => k.naziv}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  renderOption={(props, k) => (
                    <li {...props} key={k.id}>
                      <Box>
                        <Typography variant="body2">{k.naziv}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {k.grad} · {k.sifra}
                        </Typography>
                      </Box>
                    </li>
                  )}
                  noOptionsText="Nema takvog kupca"
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      inputRef={field.ref}
                      label="Kupac"
                      required
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message}
                    />
                  )}
                />
              )}
            />
            <Controller
              name="datum"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  type="date"
                  label="Datum narudžbe"
                  required
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              )}
            />
            {/* Nova narudžba nema unaprijed izabran način plaćanja: korisnik ga mora izabrati sam. */}
            <Controller
              name="nacin_placanja"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ""} // "" = ništa nije izabrano
                  select
                  label="Način plaćanja"
                  required
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                >
                  {NACINI_PLACANJA.map((n) => (
                    <MenuItem key={n} value={n}>
                      {NACIN_PLACANJA_NAZIV[n]}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Box>

          {/* Stavke */}
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Stavke
            </Typography>
            <Button startIcon={<AddIcon />} onClick={() => append(praznaStavka())}>
              Dodaj stavku
            </Button>
          </Stack>

          {greskaStavki && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {greskaStavki}
            </Alert>
          )}

          <Stack divider={<Divider flexItem />} spacing={2}>
            {fields.map((f, i) => (
              <RedStavke
                key={f.id} // f.id daje useFieldArray: stabilan ključ i kad se stavka iz sredine obriše
                indeks={i}
                control={control}
                proizvodi={proizvodi}
                moguceBrisanje={fields.length > 1}
                onProizvod={(p) => {
                  // Cijena iz cjenovnika; korisnik je poslije može promijeniti.
                  if (p) setValue(`stavke.${i}.cijena_po_komadu`, p.cijena, { shouldValidate: true });
                }}
                onUkloni={() => remove(i)}
              />
            ))}
          </Stack>

          <Divider sx={{ my: 2 }} />
          <Ukupno control={control} />
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting} color="inherit">
            Odustani
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting} disabled={ucitava || !!greskaUcitavanja}>
            {izmjenaId ? "Sačuvaj izmjene" : "Sačuvaj narudžbu"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

type RedProps = {
  indeks: number;
  control: Control<NarudzbaUlaz>;
  proizvodi: Proizvod[];
  moguceBrisanje: boolean;
  onProizvod: (p: Proizvod | null) => void;
  onUkloni: () => void;
};

// Jedan red stavke: proizvod, količina, cijena, rabat, iznos i dugme za uklanjanje.
function RedStavke({ indeks: i, control, proizvodi, moguceBrisanje, onProizvod, onUkloni }: RedProps) {
  const stavke = useWatch({ control, name: "stavke" });
  const stavka = stavke[i];
  // Proizvodi koji su već u drugim stavkama ne mogu se izabrati ponovo.
  const zauzeti = new Set(stavke.filter((_, j) => j !== i).map((s) => s.proizvod_id));
  const proizvod = proizvodi.find((p) => p.id === stavka?.proizvod_id);

  return (
    <Box
      sx={{
        display: "grid",
        // Mobitel: proizvod u svom redu, ostala polja po dva u redu. Računar: sve u jednom redu.
        gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr 1fr auto", md: "minmax(0, 3fr) 1fr 1.3fr 1fr 1fr auto" },
        gap: 1.5,
        alignItems: "start",
      }}
    >
      <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}>
        <Controller
          name={`stavke.${i}.proizvod_id`}
          control={control}
          render={({ field, fieldState }) => (
            <Autocomplete
              options={proizvodi}
              value={proizvodi.find((p) => p.id === field.value) ?? null}
              onChange={(_, p) => {
                field.onChange(p?.id ?? 0);
                onProizvod(p);
              }}
              onBlur={field.onBlur}
              groupBy={(p) => p.kategorija}
              getOptionLabel={(p) => p.naziv}
              getOptionDisabled={(p) => zauzeti.has(p.id)}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="Nema takvog proizvoda"
              renderInput={(params) => (
                <TextField
                  {...params}
                  inputRef={field.ref}
                  label="Proizvod"
                  size="small"
                  required
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                />
              )}
            />
          )}
        />
      </Box>

      <BrojPolje
        control={control}
        name={`stavke.${i}.kolicina`}
        label="Količina"
        korak={1}
        jedinica={proizvod?.jedinica_mjere}
      />
      <BrojPolje control={control} name={`stavke.${i}.cijena_po_komadu`} label="Cijena" korak={0.01} jedinica="KM" />
      <BrojPolje control={control} name={`stavke.${i}.rabat_posto`} label="Rabat" korak={1} jedinica="%" />

      <Box sx={{ display: { xs: "none", md: "block" }, textAlign: "right", pt: 1 }}>
        <Typography variant="caption" color="text.secondary" component="div">
          Iznos
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
          {stavka ? formatKM(iznosStavke(stavka)) : "—"}
        </Typography>
      </Box>

      <Tooltip title={moguceBrisanje ? "Ukloni stavku" : "Narudžba mora imati bar jednu stavku"}>
        <Box component="span" sx={{ justifySelf: { xs: "end", sm: "auto" } }}>
          <IconButton onClick={onUkloni} disabled={!moguceBrisanje} aria-label="Ukloni stavku" sx={{ mt: 0.25 }}>
            <DeleteOutlinedIcon />
          </IconButton>
        </Box>
      </Tooltip>
    </Box>
  );
}

type BrojProps = {
  control: Control<NarudzbaUlaz>;
  name: FieldPath<NarudzbaUlaz>;
  label: string;
  korak: number;
  jedinica?: string;
};

// Polje za broj. TextField daje tekst, a šema očekuje broj: prazno polje postaje NaN,
// pa Zod javi "Upiši ...". Tako "1.5" ostaje 1.5 i server/šema kažu da količina mora biti cijeli broj.
function BrojPolje({ control, name, label, korak, jedinica }: BrojProps) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <TextField
          name={field.name}
          inputRef={field.ref}
          onBlur={field.onBlur}
          value={typeof field.value === "number" && !Number.isNaN(field.value) ? field.value : ""}
          onChange={(e) => field.onChange(e.target.value === "" ? NaN : Number(e.target.value))}
          // Polje tipa "number" inače prihvata naučni zapis (3e3 = 3000) i predznak. To ovdje nema smisla.
          onKeyDown={(e) => {
            if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
          }}
          type="number"
          label={label}
          size="small"
          required
          error={!!fieldState.error}
          helperText={fieldState.error?.message}
          slotProps={{
            htmlInput: { step: korak, min: 0 },
            input: jedinica ? { endAdornment: <InputAdornment position="end">{jedinica}</InputAdornment> } : undefined,
          }}
        />
      )}
    />
  );
}

// Ukupan iznos se računa uživo dok korisnik kuca (useWatch prati promjene stavki).
function Ukupno({ control }: { control: Control<NarudzbaUlaz> }) {
  const stavke = useWatch({ control, name: "stavke" });
  const ukupnoCenti = stavke.reduce((zbir, s) => zbir + Math.round(iznosStavke(s) * 100), 0);
  return (
    <Stack direction="row" sx={{ justifyContent: "flex-end", alignItems: "baseline", gap: 2 }}>
      <Typography color="text.secondary">Ukupno</Typography>
      <Typography variant="h6">{formatKM(ukupnoCenti / 100)}</Typography>
    </Stack>
  );
}
