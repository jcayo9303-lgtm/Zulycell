import { Badge } from "@/components/ui";
import { REPAIR_STATUS, type RepairStatus } from "@/lib/labels";

const TONE: Record<RepairStatus, "success" | "danger" | "warning" | "info" | undefined> = {
  RECEIVED: "info",
  DIAGNOSING: "info",
  WAITING_PARTS: "warning",
  REPAIRING: "info",
  READY: "success",
  DELIVERED: undefined,
  UNREPAIRABLE: "danger",
  CANCELLED: undefined,
};

export function StatusBadge({ status }: { status: RepairStatus }) {
  return <Badge tone={TONE[status]}>{REPAIR_STATUS[status]}</Badge>;
}
