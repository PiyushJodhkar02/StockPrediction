require('dotenv').config();

// The endpoint is Azure AI Foundry (GitHub Models style)
// Format: https://models.inference.ai.azure.com OR https://<resource>.services.ai.azure.com/models
async function testFormats() {
  const key = process.env.AZURE_OPENAI_API_KEY;
  
  const formats = [
    // Format 1: Azure AI Foundry models endpoint  
    {
      url: 'https://coder-resource.services.ai.azure.com/models/chat/completions',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }
    },
    // Format 2: With api-key header instead
    {
      url: 'https://coder-resource.services.ai.azure.com/models/chat/completions',
      headers: { 'Content-Type': 'application/json', 'api-key': key }
    },
    // Format 3: GitHub models style with api-version
    {
      url: 'https://coder-resource.services.ai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-08-01-preview',
      headers: { 'Content-Type': 'application/json', 'api-key': key }
    },
  ];

  for (const f of formats) {
    console.log("\nTesting:", f.url.slice(0, 80));
    try {
      const res = await fetch(f.url, {
        method: 'POST',
        headers: f.headers,
        body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
      });
      const text = await res.text();
      console.log("Status:", res.status, "| Body:", text.slice(0, 200));
    } catch(e) {
      console.log("Error:", e.message);
    }
  }
}
testFormats();
