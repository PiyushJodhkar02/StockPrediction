import Groq from "groq-sdk";
import { PrismaClient } from "@prisma/client";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const prisma = new PrismaClient();

const SYSTEM_PROMPT = `You are a financial analysis writer. You will be given a JSON object containing
a stock symbol, its current price, and a rules-based technical signal that has
ALREADY been computed by a deterministic system — you are not generating this
signal, only explaining it.

Rules:
- Never state a signal, confidence score, or price target other than the ones
  given to you in the input JSON.
- Never claim certainty about future price movement. Use hedged, analyst-style
  language ("suggests", "indicates", "consistent with").
- Reference the specific indicators provided (RSI, MACD, moving averages) by
  name and explain what each is showing in plain English a non-technical
  founder or investor would understand.
- Keep the tone like a sell-side analyst note: measured, factual, no hype.
- 120-180 words. No bullet points, no headers, prose only.
- End with one sentence naming the key risk that would invalidate this read.
- If the input signal is HOLD, do not manufacture urgency — say plainly that
  the indicators are mixed or neutral.`;

export async function generateAnalysis(symbol: string, currentPrice: number, signalData: any, recentPrices: number[]) {
  const today = new Date().toISOString().slice(0, 10);

  // Check cache
  const cached = await prisma.analysisCache.findUnique({
    where: { symbol_date: { symbol, date: today } }
  });

  if (cached) {
    return { narrative: cached.narrativeText, generatedAt: cached.createdAt };
  }

  const payload = {
    symbol,
    currentPrice,
    signalData,
    recentPrices
  };

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) }
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const narrativeText = completion.choices[0]?.message?.content || "Analysis unavailable.";

    const newCache = await prisma.analysisCache.upsert({
      where: { symbol_date: { symbol, date: today } },
      update: {
        signalSnapshotJson: JSON.stringify(signalData),
        narrativeText
      },
      create: {
        symbol,
        date: today,
        signalSnapshotJson: JSON.stringify(signalData),
        narrativeText
      }
    });

    return { narrative: newCache.narrativeText, generatedAt: newCache.createdAt };
  } catch (error) {
    console.error("Groq API error:", error);
    return { narrative: "Analyst note unavailable right now.", generatedAt: new Date() };
  }
}
