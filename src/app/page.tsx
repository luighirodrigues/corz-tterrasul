import { requireUser } from "@/auth/dal";
import { Dashboard } from "@/components/Dashboard";
import { loadLastSyncAt } from "@/lib/sync-status";

export default async function DashboardPage() {
  const user = await requireUser();
  const atualizadoEm = await loadLastSyncAt();
  return <Dashboard usuario={{ name: user.name, email: user.email, role: user.role }} atualizadoEm={atualizadoEm} />;
}
