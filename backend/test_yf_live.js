const yahooFinanceDefault = require('yahoo-finance2').default;
const yahooFinance = new yahooFinanceDefault({ suppressNotices: ['ripHistorical', 'yahooSurvey'] });

async function testLive() {
  try {
    const symbol = 'RELIANCE.NS';
    console.log("Fetching live intraday for", symbol);
    
    const period1 = new Date();
    period1.setDate(period1.getDate() - 2);

    const results = await yahooFinance.chart(symbol, {
      period1,
      interval: '1m'
    });
    console.log("Results quotes count:", results.quotes?.length);
    if (results.quotes?.length > 0) {
      console.log("First quote:", results.quotes[0]);
    }
  } catch(e) {
    console.error("Error:", e);
  }
}
testLive();
