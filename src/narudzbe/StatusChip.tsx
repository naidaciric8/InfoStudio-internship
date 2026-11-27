import Chip from "@mui/material/Chip";
import { STATUS_BOJA, STATUS_NAZIV } from "../format";
import type { Status } from "../tipovi";

export default function StatusChip({ status, size = "small" }: { status: Status; size?: "small" | "medium" }) {
  return <Chip label={STATUS_NAZIV[status]} color={STATUS_BOJA[status]} size={size} variant="outlined" />;
}
