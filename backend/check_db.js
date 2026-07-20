const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const quotes = await prisma.quote.findMany({
    where: { symbol: 'RELIANCE.NS' },
    orderBy: { date: 'desc' },
    take: 10
  });
  console.log("Last 10 quotes in DB:");
  console.log(quotes);
  
  const maxQuote = await prisma.quote.findFirst({
    where: { symbol: 'RELIANCE.NS' },
    orderBy: { high: 'desc' }
  });
  console.log("Max high in DB:", maxQuote);
}

check().catch(console.error).finally(() => prisma.$disconnect());
