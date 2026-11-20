// Server-side Gemini proxy. The key lives in the GEMINI_API_KEY secret and never reaches the browser.
// Limits: PER_IP requests per visitor per day, and DAILY_CAP across everyone, so the quota can't be drained.
const PER_IP = 30;
const DAILY_CAP = 1000;
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const MAX_CHARS = 40000;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function onRequestGet({ env }) {
  return json({ enabled: Boolean(env.GEMINI_API_KEY) });
}

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) return json({ error: "Shared AI isn't set up on this site yet." }, 503);
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: "Forbidden" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const { messages, system } = body || {};
  if (!Array.isArray(messages) || !messages.length || messages.length > 12 || typeof system !== "string") return json({ error: "Bad request" }, 400);
  const size = system.length + messages.reduce((n, m) => n + String(m?.text || "").length, 0);
  if (size > MAX_CHARS) return json({ error: "That text is too long for the shared AI. Shorten it or add your own key in Settings." }, 413);

  if (env.RATE) {
    const day = new Date().toISOString().slice(0, 10);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipKey = `ip:${day}:${ip}`, allKey = `all:${day}`;
    const [ipCount, allCount] = await Promise.all([env.RATE.get(ipKey), env.RATE.get(allKey)]).then(v => v.map(x => +x || 0));
    if (ipCount >= PER_IP) return json({ error: `You've used today's ${PER_IP} free AI answers. Add your own free Gemini key in Settings to keep going.`, limit: true }, 429);
    if (allCount >= DAILY_CAP) return json({ error: "The shared AI is at today's limit. Add your own free Gemini key in Settings to keep going.", limit: true }, 429);
    await Promise.all([
      env.RATE.put(ipKey, String(ipCount + 1), { expirationTtl: 172800 }),
      env.RATE.put(allKey, String(allCount + 1), { expirationTtl: 172800 }),
    ]);
  }

  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: String(m.text) }] })),
  });
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: payload,
      });
      if (!res.ok) { console.error(`gemini ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`); continue; }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
      if (text) return json({ text });
    } catch (e) { console.error(`gemini ${model} fetch failed: ${e.message}`); }
  }
  return json({ error: "The AI is busy right now. Try again in a moment." }, 502);
}
