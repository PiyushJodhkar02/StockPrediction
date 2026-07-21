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

const SYSTEM_PROMPT = `You are a senior sell-side financial analyst issuing a TRADE CALL. You will receive a JSON object with:
- symbol: the stock ticker
- currentPrice: the latest price (in INR for NSE/BSE stocks)
- simulationDate: (optional) if present, this is a simulated past date, not today
- signalData: a rules-based technical signal (BUY/SELL/HOLD), including a baseline engine-calculated entry, target, and stop-loss
- recentPrices: last 5 closing prices for trend context
- indicators: concrete RSI, MACD, and SMA values at this exact point in time

Your job is to act as the final decision-maker. Analyze the baseline data and the indicators to PREDICT the optimal Entry, Target, and Stop Loss. 
You must output ONLY a valid JSON object with the following structure:
{
  "entry": number | null,
  "target": number | null,
  "stopLoss": number | null,
  "narrative": "string"
}

Rules:
- This note is written ONCE when the call fires, not as running commentary.
- Use the baseline levels as a reference, but predict your own optimal levels if the indicators suggest a better entry/exit.
- If the signal is HOLD, entry, target, and stopLoss can be null.
- The 'narrative' must explain the rationale for the predicted Entry, Target, and Stop Loss.
- ALWAYS quote the exact indicator values provided (e.g. "RSI at 48.3", "MACD histogram at -0.12").
- Reference the rule agreement score and confidence.
- Keep tone: factual, measured, sell-side analyst style. No hype.
- If simulationDate is present, write in past tense ("as of [date]...").
- 150-200 words for narrative. Prose only.
- Final sentence of narrative: name the single biggest risk that would invalidate this call.`;

export async function generateAnalysis(
  symbol: string,
  currentPrice: number,
  signalData: any,
  recentPrices: number[],
  simulationDate?: string
) {
  const cacheDate = simulationDate || new Date().toISOString().slice(0, 10);
  const cacheSymbol = simulationDate ? `${symbol}__sim__${simulationDate}` : symbol;
  const signalSnapshot = JSON.stringify(signalData);

  try {
    const cached = await prisma.analysisCache.findUnique({
      where: { symbol_date: { symbol: cacheSymbol, date: cacheDate } }
    });
    if (cached && cached.signalSnapshotJson === signalSnapshot) {
      try {
        const parsed = JSON.parse(cached.narrativeText);
        return { ...parsed, generatedAt: cached.createdAt };
      } catch (e) {
        // Fallback for old cached plain-text narratives
        return { narrative: cached.narrativeText, entry: null, target: null, stopLoss: null, generatedAt: cached.createdAt };
      }
    }
  } catch (_) { }

  const payload = {
    symbol,
    currentPrice: `₹${currentPrice.toFixed(2)}`,
    simulationDate: simulationDate || null,
    signalData,
    recentPrices: recentPrices.map(p => `₹${p.toFixed(2)}`),
  };

  let rawJson: string | null = null;

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
        response_format: { type: "json_object" },
      });
      rawJson = completion.choices[0]?.message?.content?.trim() || null;
      if (rawJson) console.log("[Analysis] Used Azure GPT-4o");
    } catch (azureErr: any) {
      console.warn("[Analysis] Azure failed, falling back to Groq:", azureErr?.message?.slice(0, 100));
    }
  }

  if (!rawJson) {
    try {
      const completion = await groqClient.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload, null, 2) }
        ],
        temperature: 0.4,
        max_tokens: 400,
        response_format: { type: "json_object" },
      });
      rawJson = completion.choices[0]?.message?.content?.trim() || null;
      if (rawJson) console.log("[Analysis] Used Groq Llama 3.1");
    } catch (groqErr: any) {
      console.error("[Analysis] Groq also failed:", groqErr?.message);
    }
  }

  let resultObj = { narrative: "Analyst note unavailable right now.", entry: null, target: null, stopLoss: null };
  if (rawJson) {
    try {
      resultObj = JSON.parse(rawJson);
    } catch (err) {
      console.error("Failed to parse LLM JSON:", rawJson);
      resultObj.narrative = rawJson; // fallback
    }
  }

  try {
    const stringified = JSON.stringify(resultObj);
    await prisma.analysisCache.upsert({
      where: { symbol_date: { symbol: cacheSymbol, date: cacheDate } },
      update: { signalSnapshotJson: signalSnapshot, narrativeText: stringified },
      create: { symbol: cacheSymbol, date: cacheDate, signalSnapshotJson: signalSnapshot, narrativeText: stringified }
    });
  } catch (_) { }

  return { ...resultObj, generatedAt: new Date() };
}
