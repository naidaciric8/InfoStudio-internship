// Forma za novu narudžbu: kupac, datum i stavke. Stavka se dodaje i uklanja,
// a cijena se popuni iz cjenovnika kad se izabere proizvod (i može se promijeniti).
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
import { formatKM } from "../format";
import type { Kupac, Proizvod } from "../tipovi";
import { iznosStavke, NarudzbaSema, type NarudzbaUlaz, type StavkaUlaz } from "../../shared/narudzba";

type Props = {
  otvorena: boolean;
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

export default function NarudzbaForma({ otvorena, onClose, onSacuvano }: Props) {
  const theme = useTheme();
  const naMobitelu = useMediaQuery(theme.breakpoints.down("sm"));

  const [kupci, setKupci] = useState<Kupac[]>([]);
  const [proizvodi, setProizvodi] = useState<Proizvod[]>([]);
  const [ucitava, setUcitava] = useState(false);
  const [greskaUcitavanja, setGreskaUcitavanja] = useState<string | null>(null);
  const [greskaServera, setGreskaServera] = useState<string | null>(null);

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

  // Svaki put kad se forma otvori: prazna forma i svježi kupci i proizvodi (cjenovnik se može promijeniti).
  useEffect(() => {
    if (!otvorena) return;
    reset({ kupac_id: 0, datum: danas(), stavke: [praznaStavka()] });
    setGreskaServera(null);
    setGreskaUcitavanja(null);
    setUcitava(true);
    Promise.all([api<Kupac[]>("/api/kupci"), api<Proizvod[]>("/api/proizvodi")])
      .then(([k, p]) => {
        setKupci(k);
        setProizvodi(p);
      })
      .catch((e) => setGreskaUcitavanja(porukaGreske(e)))
      .finally(() => setUcitava(false));
  }, [otvorena, reset]);

  async function sacuvaj(narudzba: NarudzbaUlaz) {
    setGreskaServera(null);
    try {
      const nova = await api<{ id: number; broj: string }>("/api/narudzbe", {
        method: "POST",
        body: JSON.stringify(narudzba),
      });
      onSacuvano(nova.broj);
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
        <DialogTitle>Nova narudžba</DialogTitle>
        {ucitava && <LinearProgress />}

        <DialogContent dividers>
          {greskaUcitavanja && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Kupci i proizvodi se nisu učitali: {greskaUcitavanja}
            </Alert>
          )}
          {greskaServera && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {greskaServera}
            </Alert>
          )}

          {/* Kupac i datum */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" }, gap: 2, mb: 3 }}>
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
            Sačuvaj narudžbu
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
