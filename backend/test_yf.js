const yahooFinanceDefault = require('yahoo-finance2').default;
const yahooFinance = new yahooFinanceDefault({ suppressNotices: ['ripHistorical', 'yahooSurvey'] });

async function test() {
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 1);
  const results = await yahooFinance.historical('RELIANCE.NS', {
    period1,
    period2: new Date(),
    interval: '1d'
  });
  console.log("Last 5 quotes:");
  console.log(results.slice(-5));
  console.log("First 5 quotes:");
  console.log(results.slice(0, 5));
}
test().catch(console.error);
