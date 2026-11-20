// Gemini client. The visitor's own key stays in their browser and is sent only to Google.
const KEY = "finprep.geminiKey";
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

export const getKey = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
export const setKey = k => { try { k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY); } catch {} };

/** messages: [{ role: "user" | "model", text }] */
export async function askGemini(messages, system) {
  const key = getKey();
  if (!key) throw new Error("Add a Gemini API key in Settings first.");
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] })),
  });
  let lastErr;
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body,
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json?.error?.message || res.statusText;
        if (res.status === 400 || res.status === 403) throw Object.assign(new Error(`Gemini rejected the key: ${msg}`), { fatal: true });
        throw new Error(msg);
      }
      const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
      if (text) return text;
      lastErr = new Error("Gemini returned an empty answer.");
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error("Gemini is unavailable right now.");
}
