const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const maxQuote = await prisma.quote.findFirst({
    where: { symbol: 'RELIANCE.NS' },
    orderBy: { high: 'desc' }
  });
  console.log("Max high in DB for RELIANCE.NS:", maxQuote);
}

check().catch(console.error).finally(() => prisma.$disconnect());
