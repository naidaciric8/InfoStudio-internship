import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import App from "./App";
import { tema } from "./tema";

// ThemeProvider daje temu svim MUI komponentama, a CssBaseline ujednači osnovni CSS u svim preglednicima.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={tema}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
);
