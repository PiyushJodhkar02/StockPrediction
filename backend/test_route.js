const { PrismaClient } = require('@prisma/client');
const { getLiveIntradayQuotes } = require('./src/services/marketData');
// wait, marketData is ts, so I will just require it using ts-node or just copy the logic.
// Nevermind, I will just do a console log inside the route.
