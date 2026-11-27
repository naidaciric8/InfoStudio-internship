// Osnovni raspored aplikacije: traka na vrhu i sadržaj stranice.
import { AppBar, Box, Container, Toolbar, Typography } from "@mui/material";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ListaNarudzbi from "./narudzbe/ListaNarudzbi";

export default function App() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky">
        <Toolbar>
          {/* Logo: bijela ikona u tamnoplavom kvadratu */}
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "10px",
              bgcolor: "primary.main",
              color: "primary.contrastText",
              display: "grid",
              placeItems: "center",
              mr: 1.5,
            }}
          >
            <ReceiptLongIcon fontSize="small" />
          </Box>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, color: "primary.main" }}>
            Narudžbe
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: "none", sm: "block" } }}>
            Distribucija pića i grickalica
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
        <ListaNarudzbi />
      </Container>
    </Box>
  );
}
