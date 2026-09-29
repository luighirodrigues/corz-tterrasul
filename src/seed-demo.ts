import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";

export async function seedDemoData() {
  const tenantId = env.DEFAULT_TENANT_ID;
  console.log(`[Seed] Inserindo dados de demonstração para o tenant: ${tenantId}...`);

  // 1. Garantir Tenant
  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: {
      id: tenantId,
      name: env.DEFAULT_TENANT_NAME,
      timezone: env.TIMEZONE,
      panelVendasId: "panel-vendas-1",
      panelCampanhasId: "panel-campanhas-1",
      panelPecasId: "panel-pecas-1",
      panelOficinaId: "panel-oficina-1",
      ignoredLostReasons: "falta de peca fornecedor,cancelamento de fabrica",
    },
  });

  // 2. Agentes de teste
  const agent1 = await prisma.agent.upsert({
    where: { tenantId_externalId: { tenantId, externalId: "agent-rodrigo" } },
    update: {},
    create: {
      tenantId,
      externalId: "agent-rodrigo",
      name: "Rodrigo Silva",
      email: "rodrigo@tterrasul.com.br",
      role: "Vendedor Novos",
    },
  });

  const agent2 = await prisma.agent.upsert({
    where: { tenantId_externalId: { tenantId, externalId: "agent-camila" } },
    update: {},
    create: {
      tenantId,
      externalId: "agent-camila",
      name: "Camila Rocha",
      email: "camila@tterrasul.com.br",
      role: "Consultora Pós-Venda",
    },
  });

  // 3. Sessão 1: Atendimento exemplar de Vendas (COMPLETED)
  const now = new Date();
  const start1 = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
  const end1 = new Date(start1.getTime() + 45 * 60 * 1000);

  const session1 = await prisma.session.upsert({
    where: { tenantId_externalId: { tenantId, externalId: "flw-sess-101" } },
    update: {},
    create: {
      tenantId,
      externalId: "flw-sess-101",
      number: "101",
      title: "Interesse Nivus Highline",
      contactName: "João Pedro",
      contactPhone: "51988881111",
      channelType: "WHATSAPP",
      agentExternalId: agent1.externalId,
      agentId: agent1.id,
      agentName: agent1.name,
      departmentName: "Vendas",
      status: "COMPLETED",
      startAt: start1,
      firstResponseAt: new Date(start1.getTime() + 3 * 60 * 1000), // 3 min de TMR
      endAt: end1,
      timeWait: 180,
      timeService: 2700,
    },
  });

  // Mensagens da Sessão 1
  await prisma.message.createMany({
    data: [
      {
        tenantId,
        externalId: "msg-101-1",
        sessionId: session1.id,
        timestamp: start1,
        direction: "TO_HUB",
        origin: "DEFAULT",
        type: "TEXT",
        text: "Boa tarde! Gostaria de saber as condições do Nivus Highline 2026 à pronta entrega.",
      },
      {
        tenantId,
        externalId: "msg-101-2",
        sessionId: session1.id,
        timestamp: new Date(start1.getTime() + 3 * 60 * 1000),
        direction: "FROM_HUB",
        origin: "DEFAULT",
        type: "TEXT",
        text: "Olá João Pedro, boa tarde! Me chamo Rodrigo da Tterrasul. Temos sim duas unidades cinza platinum com taxa zero em 24x!",
      },
      {
        tenantId,
        externalId: "msg-101-3",
        sessionId: session1.id,
        timestamp: new Date(start1.getTime() + 10 * 60 * 1000),
        direction: "TO_HUB",
        origin: "DEFAULT",
        type: "TEXT",
        text: "Sensacional! Aceitam meu Polo 2022 na troca?",
      },
      {
        tenantId,
        externalId: "msg-101-4",
        sessionId: session1.id,
        timestamp: new Date(start1.getTime() + 12 * 60 * 1000),
        direction: "FROM_HUB",
        origin: "DEFAULT",
        type: "TEXT",
        text: "Com certeza, pagamos excelente avaliação. Você pode vir na concessionária amanhã às 14h para avaliar o Polo e fazer um test drive no Nivus?",
      },
      {
        tenantId,
        externalId: "msg-101-5",
        sessionId: session1.id,
        timestamp: new Date(start1.getTime() + 15 * 60 * 1000),
        direction: "TO_HUB",
        origin: "DEFAULT",
        type: "TEXT",
        text: "Combinado, estarei aí às 14h amanhã!",
      },
      {
        tenantId,
        externalId: "msg-101-6",
        sessionId: session1.id,
        timestamp: new Date(start1.getTime() + 16 * 60 * 1000),
        direction: "FROM_HUB",
        origin: "DEFAULT",
        type: "TEXT",
        text: "Perfeito, agendamento confirmado! Até amanhã.",
      },
    ],
    skipDuplicates: true,
  });

  // Card CRM da Sessão 1
  await prisma.panelCard.upsert({
    where: { tenantId_externalId: { tenantId, externalId: "card-101" } },
    update: {},
    create: {
      tenantId,
      externalId: "card-101",
      panelId: "panel-vendas-1",
      stepTitle: "Agendamento / Test Drive",
      status: "OPEN",
      responsibleUserId: agent1.externalId,
      sessionExternalId: session1.externalId,
      sessionId: session1.id,
      flwCreatedAt: start1,
    },
  });

  // 4. Sessão 2: Atendimento de Peças (COMPLETED com oportunidade de melhoria)
  const start2 = new Date(now.getTime() - 1 * 24 * 3600 * 1000);
  const end2 = new Date(start2.getTime() + 2 * 3600 * 1000);

  const session2 = await prisma.session.upsert({
    where: { tenantId_externalId: { tenantId, externalId: "flw-sess-102" } },
    update: {},
    create: {
      tenantId,
      externalId: "flw-sess-102",
      number: "102",
      title: "Pastilha de Freio T-Cross",
      contactName: "Mariana Souza",
      contactPhone: "51977772222",
      channelType: "WHATSAPP",
      agentExternalId: agent2.externalId,
      agentId: agent2.id,
      agentName: agent2.name,
      departmentName: "Peças",
      status: "COMPLETED",
      startAt: start2,
      firstResponseAt: new Date(start2.getTime() + 18 * 60 * 1000), // 18 min de TMR
      endAt: end2,
      timeWait: 1080,
      timeService: 7200,
    },
  });

  await prisma.message.createMany({
    data: [
      {
        tenantId,
        externalId: "msg-102-1",
        sessionId: session2.id,
        timestamp: start2,
        direction: "TO_HUB",
        origin: "DEFAULT",
        type: "TEXT",
        text: "Vocês têm a pastilha dianteira da T-Cross 2023?",
      },
      {
        tenantId,
        externalId: "msg-102-2",
        sessionId: session2.id,
        timestamp: new Date(start2.getTime() + 18 * 60 * 1000),
        direction: "FROM_HUB",
        origin: "DEFAULT",
        type: "TEXT",
        text: "Olá. Tenho sim, sai R$ 420 o jogo original.",
      },
      {
        tenantId,
        externalId: "msg-102-3",
        sessionId: session2.id,
        timestamp: new Date(start2.getTime() + 25 * 60 * 1000),
        direction: "TO_HUB",
        origin: "DEFAULT",
        type: "TEXT",
        text: "Vocês instalam também ou só vendem a peça?",
      },
      {
        tenantId,
        externalId: "msg-102-4",
        sessionId: session2.id,
        timestamp: new Date(start2.getTime() + 50 * 60 * 1000),
        direction: "FROM_HUB",
        origin: "DEFAULT",
        type: "TEXT",
        text: "Aqui é só o balcão de peças. A oficina é outro setor.",
      },
      {
        tenantId,
        externalId: "msg-102-5",
        sessionId: session2.id,
        timestamp: new Date(start2.getTime() + 55 * 60 * 1000),
        direction: "TO_HUB",
        origin: "DEFAULT",
        type: "TEXT",
        text: "Ah ok, qualquer coisa eu aviso.",
      },
    ],
    skipDuplicates: true,
  });

  await prisma.panelCard.upsert({
    where: { tenantId_externalId: { tenantId, externalId: "card-102" } },
    update: {},
    create: {
      tenantId,
      externalId: "card-102",
      panelId: "panel-pecas-1",
      stepTitle: "Perdido",
      status: "LOST",
      lostReason: "Cliente não respondeu mais",
      responsibleUserId: agent2.externalId,
      sessionExternalId: session2.externalId,
      sessionId: session2.id,
      flwCreatedAt: start2,
    },
  });

  console.log("[Seed] Dados de demonstração inseridos com sucesso!");
}

if (process.argv[1]?.endsWith("seed-demo.ts")) {
  seedDemoData()
    .catch((err) => console.error("Erro no seed:", err))
    .finally(() => prisma.$disconnect());
}
