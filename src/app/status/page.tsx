import { requireAdmin } from "@/auth/dal";
import { StatusView } from "@/components/StatusView";

export const metadata = { title: "Status técnico · Tterrasul" };

export default async function StatusPage() {
  await requireAdmin();
  return <StatusView />;
}
