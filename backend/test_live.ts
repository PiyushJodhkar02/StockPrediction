import { YahooFinanceProvider } from './src/services/marketData';

async function test() {
  try {
    const marketProvider = new YahooFinanceProvider();
    const quotes = await marketProvider.getLiveIntradayQuotes("RELIANCE.NS", 1);
    console.log("Quotes returned:", quotes.length);
    if (quotes.length > 0) {
      console.log(quotes[0]);
    }
  } catch(e) {
    console.log("Error:", e);
  }
}
test();
