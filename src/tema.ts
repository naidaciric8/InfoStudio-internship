// Jedna tema za cijelu aplikaciju: boje, slova, zaobljenja i izgled MUI komponenti.
// Ako želiš drugačiju boju aplikacije, mijenjaš je samo ovdje.
import { createTheme } from "@mui/material/styles";
import { hrHR as materialHr } from "@mui/material/locale";
import { hrHR as gridHr } from "@mui/x-data-grid/locales";
import type {} from "@mui/x-data-grid/themeAugmentation";

export const tema = createTheme(
  {
    palette: {
      mode: "light",
      // Tamnoplava: ozbiljna, mirna boja koju koristi većina poslovnih aplikacija.
      // Koristi se samo za naglaske (dugmad, odabrani čip, logo), ne za velike površine.
      primary: { main: "#1e3a5f" },
      secondary: { main: "#2e7d6b" },
      background: { default: "#f5f7fa", paper: "#ffffff" },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: '"Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      h5: { fontWeight: 700 },
      h6: { fontWeight: 600 },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiButton: { defaultProps: { disableElevation: true } },
      // Bijela traka na vrhu s tankom linijom ispod, umjesto obojene trake sa sjenkom.
      MuiAppBar: {
        defaultProps: { color: "inherit", elevation: 0 },
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.palette.background.paper,
            borderBottom: `1px solid ${theme.palette.divider}`,
          }),
        },
      },
      MuiPaper: { defaultProps: { elevation: 0 } },
      MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
      MuiDataGrid: {
        styleOverrides: {
          root: { border: "none" },
          columnHeaderTitle: { fontWeight: 600 },
          row: { cursor: "pointer" },
        },
      },
    },
  },
  // Prijevodi tekstova u MUI komponentama i Data Gridu (hrvatski je najbliži bosanskom).
  materialHr,
  gridHr,
);
