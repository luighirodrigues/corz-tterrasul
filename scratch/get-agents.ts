import { prisma } from '../src/db/prisma.js';

async function main() {
  const agents = await prisma.agent.findMany({
    orderBy: { name: 'asc' },
  });

  const sessionAgents = await prisma.session.groupBy({
    by: ['agentId', 'agentName'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  console.log('=== AGENTS TABLE ===');
  console.log(JSON.stringify(agents, null, 2));

  const sessionDistinct = await prisma.session.findMany({
    select: { agentExternalId: true, agentName: true },
    distinct: ['agentExternalId', 'agentName']
  });
  console.log('SESSION DISTINCT:', JSON.stringify(sessionDistinct, null, 2));
  await prisma.$disconnect();
}

main().catch(console.error);
