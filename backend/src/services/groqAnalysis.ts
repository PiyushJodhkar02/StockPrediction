import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Primary: Groq (fast, free, available immediately)
const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// Secondary: Azure AI (once a deployment is set up in the portal)
const azureClient = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: process.env.AZURE_OPENAI_ENDPOINT,
});

const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';

const SYSTEM_PROMPT = `You are a senior sell-side financial analyst. You will receive a JSON object with:
- symbol: the stock ticker
- currentPrice: the latest price (in INR for NSE/BSE stocks)
- simulationDate: (optional) if present, this is a simulated past date, not today
- signalData: a rules-based technical signal already computed by a deterministic engine (BUY/SELL/HOLD)
- recentPrices: last 5 closing prices for trend context
- indicators: concrete RSI, MACD, and SMA values at this exact point in time

Your job is to write a precise, data-driven analyst note.

Rules:
- ALWAYS quote the exact indicator values provided (e.g. "RSI at 48.3", "MACD histogram at -0.12", "price 2.1% above its 20-day average").
- Explain what each indicator value means in plain English.
- Reference the specific signal and rule agreement score.
- Keep tone: factual, measured, sell-side analyst style. No hype.
- If simulationDate is present, write in past tense ("as of [date]...").
- 150-200 words. Prose only — no bullet points, no headers.
- Final sentence: name the single biggest risk that would invalidate this read.`;

export async function generateAnalysis(
  symbol: string,
  currentPrice: number,
  signalData: any,
  recentPrices: number[],
  simulationDate?: string
) {
  // Cache key — separate cache for simulation dates so they don't overwrite live notes
  const cacheDate = simulationDate || new Date().toISOString().slice(0, 10);
  const cacheSymbol = simulationDate ? `${symbol}__sim__${simulationDate}` : symbol;
  const signalSnapshot = JSON.stringify(signalData);

  // Return cached note if signal hasn't changed
  try {
    const cached = await prisma.analysisCache.findUnique({
      where: { symbol_date: { symbol: cacheSymbol, date: cacheDate } }
    });
    if (cached && cached.signalSnapshotJson === signalSnapshot) {
      return { narrative: cached.narrativeText, generatedAt: cached.createdAt };
    }
  } catch (_) { /* cache miss — proceed */ }

  const payload = {
    symbol,
    currentPrice: `₹${currentPrice.toFixed(2)}`,
    simulationDate: simulationDate || null,
    signalData,
    recentPrices: recentPrices.map(p => `₹${p.toFixed(2)}`),
  };

  let narrativeText: string | null = null;

  // Try Azure first (GPT-4o) if configured
  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_DEPLOYMENT) {
    try {
      const completion = await azureClient.chat.completions.create({
        model: AZURE_DEPLOYMENT,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload, null, 2) }
        ],
        temperature: 0.4,
        max_tokens: 400,
      });
      narrativeText = completion.choices[0]?.message?.content?.trim() || null;
      if (narrativeText) console.log("[Analysis] Used Azure GPT-4o");
    } catch (azureErr: any) {
      console.warn("[Analysis] Azure failed, falling back to Groq:", azureErr?.message?.slice(0, 100));
    }
  }

  // Fallback: Groq Llama 3.3
  if (!narrativeText) {
    try {
      const completion = await groqClient.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload, null, 2) }
        ],
        temperature: 0.4,
        max_tokens: 400,
      });
      narrativeText = completion.choices[0]?.message?.content?.trim() || null;
      if (narrativeText) console.log("[Analysis] Used Groq Llama 3.3 (fallback)");
    } catch (groqErr: any) {
      console.error("[Analysis] Groq also failed:", groqErr?.message);
    }
  }

  if (!narrativeText) {
    return { narrative: "Analyst note unavailable right now. Please try again shortly.", generatedAt: new Date() };
  }

  // Cache the result
  try {
    await prisma.analysisCache.upsert({
      where: { symbol_date: { symbol: cacheSymbol, date: cacheDate } },
      update: { signalSnapshotJson: signalSnapshot, narrativeText },
      create: { symbol: cacheSymbol, date: cacheDate, signalSnapshotJson: signalSnapshot, narrativeText }
    });
  } catch (_) { /* non-fatal */ }

  return { narrative: narrativeText, generatedAt: new Date() };
}
