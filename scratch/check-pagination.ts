import { FlwClient } from "../src/flw/flw-client.js";
import { prisma } from "../src/db/prisma.js";

async function test() {
  const client = new FlwClient();
  const tenant = await prisma.tenant.findUnique({
    where: { id: "0288268d-895b-48b8-b4d4-1b90c4ea8901" },
  });

  if (!tenant?.panelOficinaId) {
    console.log("Tenant ou painel oficina não encontrado");
    return;
  }

  console.log("Chamando listAllPanelCards (todas as páginas)...");
  const all = await client.listAllPanelCards(tenant.panelOficinaId);
  console.log(`TOTAL DE CARDS COLETADOS EM TODAS AS PÁGINAS: ${all.length}`);

  await prisma.$disconnect();
}

test().catch(console.error);
