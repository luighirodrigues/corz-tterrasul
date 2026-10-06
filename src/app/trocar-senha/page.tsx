import { requireUser } from "@/auth/dal";
import { TrocarSenhaForm } from "@/components/auth/TrocarSenhaForm";

export const metadata = { title: "Trocar senha · Tterrasul" };

export default async function TrocarSenhaPage() {
  const user = await requireUser({ permitirProvisoria: true });
  return <TrocarSenhaForm provisoria={user.mustChangePassword} />;
}
