const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const deleted = await prisma.quote.deleteMany({});
  console.log(`Deleted ${deleted.count} quotes.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
