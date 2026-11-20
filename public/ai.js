// Gemini client. Uses the visitor's own key if they've added one (stored only in this browser, sent only to Google);
// otherwise uses the site's shared, rate-limited proxy at /api/ai.
const KEY = "finprep.geminiKey";
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

export const getKey = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
export const setKey = k => { try { k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY); } catch {} };

let shared;
/** Whether the site's shared AI is available (cached for the page's life). */
export function sharedAI() {
  shared ??= fetch("/api/ai").then(r => r.ok ? r.json() : { enabled: false }).then(j => !!j.enabled).catch(() => false);
  return shared;
}
export const aiAvailable = async () => !!getKey() || await sharedAI();

/** messages: [{ role: "user" | "model", text }] */
export async function askGemini(messages, system) {
  if (!getKey()) {
    if (!(await sharedAI())) throw new Error("Add a free Gemini API key in Settings to use AI.");
    const res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, system }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.text) throw new Error(j.error || "The AI is busy right now. Try again in a moment.");
    return j.text;
  }
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] })),
  });
  let lastErr;
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": getKey() },
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
