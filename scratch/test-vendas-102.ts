import { FlwClient } from "../src/flw/flw-client.js";

async function main() {
  const client = new FlwClient();
  const panelId = "d0f4fb9e-d87d-47de-bd0b-616af4b64f21";
  const createdAtAfter = "2026-09-01T00:00:00Z";
  const createdAtBefore = "2026-09-25T23:59:59Z";

  console.log("Chamando listAllPanelCards com o período de 01/09 a 25/09...");
  const cards = await client.listAllPanelCards(panelId, {
    createdAtAfter,
    createdAtBefore,
  });

  console.log(`Total de cards retornados: ${cards.length}`);
}

main().catch(console.error);
