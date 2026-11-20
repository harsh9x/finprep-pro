// Pure finance and text logic, ported from the original Python app. No DOM access.

const r2 = n => Math.round(n * 100) / 100;

export function depreciation(d, t) {
  const taxShield = d * t;
  const netIncome = -d * (1 - t);
  const cash = netIncome + d;
  const assets = cash - d;
  return { taxShield, netIncome, cash, assets, equity: netIncome, balanced: Math.abs(assets - netIncome) < 1e-9 };
}

export function dcf({ base = 100, growth, margin, tax = 0.21, capex = 0.05, nwc = 0.02, da = 0.04, wacc, tg, cash = 20, debt = 40, shares = 10 }) {
  if (wacc <= tg) return { valid: false };
  const rows = [];
  let rev = base;
  for (let year = 1; year <= 5; year++) {
    rev *= 1 + growth;
    const ebit = rev * margin;
    const nopat = ebit * (1 - tax);
    const fcf = nopat + rev * da - rev * capex - rev * nwc;
    rows.push({ year, rev, ebit, nopat, fcf, pv: fcf / (1 + wacc) ** year });
  }
  const sumPv = rows.reduce((s, r) => s + r.pv, 0);
  const tv = (rows[4].fcf * (1 + tg)) / (wacc - tg);
  const pvTv = tv / (1 + wacc) ** 5;
  const ev = sumPv + pvTv;
  const equity = ev + cash - debt;
  return { valid: true, rows, ev, equity, price: Math.max(0, equity / shares), tvPct: ev > 0 ? (pvTv / ev) * 100 : 0 };
}

export const ccc = (dio, dso, dpo) => dio + dso - dpo;

export function lbo({ pp, dp, ee, em, pd, hp }) {
  const debtIn = pp * dp, equityIn = pp - debtIn;
  const repaid = Math.min(debtIn, pd * hp), debtOut = debtIn - repaid;
  const exitEv = ee * em, equityOut = Math.max(0, exitEv - debtOut);
  const moic = equityIn > 0 ? equityOut / equityIn : 0;
  const irr = moic > 0 ? (moic ** (1 / hp) - 1) * 100 : -100;
  return { debtIn, equityIn, repaid, debtOut, exitEv, equityOut, moic, irr };
}

export function bva({ br, ar, bc, ac, bo, ao }) {
  const line = (budget, actual, isCost) => {
    const variance = r2(actual - budget);
    return { budget, actual, variance, favourable: isCost ? variance <= 0 : variance >= 0 };
  };
  const eb = br - bc - bo, ea = ar - ac - ao;
  return {
    rev: line(br, ar, false), cogs: line(bc, ac, true), opex: line(bo, ao, true),
    ebitda: { ...line(eb, ea, false), pct: eb !== 0 ? ((ea - eb) / Math.abs(eb)) * 100 : 0 },
  };
}

/* ---------- resume ---------- */
const VERBS = ["spearheaded", "engineered", "built", "modeled", "modelled", "streamlined", "forecasted", "structured", "evaluated", "optimized", "audited", "automated", "led", "reduced", "increased", "negotiated", "delivered", "launched"];
const WEAK_OPENERS = /^(responsible for|helped|assisted|worked on|involved in|participated in|tasked with|duties included)/i;
const METRIC = /(\$\s?\d[\d,.]*\s?[kmb]?|\b\d+(\.\d+)?\s?%|\b\d+(\.\d+)?x\b|\b\d+\s?bps\b|₹\s?\d[\d,.]*)/gi;
const has = (text, kw) => new RegExp(`(^|[^a-z])${kw.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}([^a-z]|$)`, "i").test(text);

export function analyzeResume(text, role, reqs) {
  const spec = reqs[role] || Object.values(reqs)[0];
  const split = list => [list.filter(k => has(text, k)), list.filter(k => !has(text, k))];
  const [foundKw, missingKw] = split(spec.core_keywords);
  const [foundTools, missingTools] = split(spec.tools);
  const [foundModel, missingModel] = split(spec.modeling);
  const metrics = (text.match(METRIC) || []).length;
  const verbs = VERBS.filter(v => has(text, v));

  const kwScore = Math.round((foundKw.length / spec.core_keywords.length) * 100);
  const score = Math.round(
    kwScore * 0.4 +
    Math.min(100, foundTools.length * 25) * 0.2 +
    Math.min(100, foundModel.length * 30) * 0.2 +
    Math.min(100, metrics * 15) * 0.2
  );

  // Find the user's own weak bullets instead of showing canned examples.
  const weakBullets = text.split(/\n|•|▪|●/).map(l => l.replace(/^[\s\-*–]+/, "").trim())
    .filter(l => l.length > 30 && l.length < 260 && /^[a-z]/i.test(l))
    .map(l => {
      const weak = WEAK_OPENERS.test(l), noNum = !new RegExp(METRIC.source, "i").test(l);
      if (!weak && !noNum) return null;
      if (!weak && !VERBS.some(v => l.toLowerCase().startsWith(v)) && l.split(" ").length < 8) return null;
      return { text: l, why: weak ? "Starts passively. Lead with a strong verb like Built, Modeled or Reduced." : "No numbers. Add a $, % or time figure to show scale." };
    })
    .filter(Boolean).slice(0, 4);

  const first = (arr, n, fallback) => arr.length ? arr.slice(0, n).join(", ") : fallback;
  const plan = [
    { title: "Close the keyword gaps", action: `Learn and add evidence for: ${first(missingKw, 3, "your core keywords are covered, so deepen them with examples")}. Practice the $10 depreciation walk until it's effortless.` },
    { title: "Show your tools", action: `Build a small project using ${first(missingTools, 2, "the tools you already list")} and put a number on every resume bullet.` },
    { title: "Model it yourself", action: `Build a DCF from a blank sheet, then ${first(missingModel, 2, "a sensitivity table")}. Use the Labs to check your intuition.` },
    { title: "Rehearse out loud", action: "Answer five interview questions a day with the Say it script and the 60-second timer. Record yourself once and cut the filler words." },
  ];

  return { role, score: Math.max(10, Math.min(98, score)), kwScore, foundKw, missingKw, foundTools, missingTools, foundModel, missingModel, metrics, verbs, weakBullets, plan };
}

/* ---------- notes ---------- */
export function parseFlashcards(text) {
  const cards = [];
  const re = /\*\*Q:?\*\*:?\s*([\s\S]*?)\n\s*[-*]?\s*\*\*A:?\*\*:?\s*([\s\S]*?)(?=\n\s*[-*]?\s*\*\*Q|$)/g;
  let m;
  while ((m = re.exec(text))) cards.push({ q: m[1].replace(/^[-*]\s*/, "").trim(), a: m[2].trim() });
  return cards;
}

const TOPICS = {
  "Valuation": ["dcf", "wacc", "discount rate", "terminal value", "enterprise value", "equity value", "multiple", "ebitda"],
  "Financial statements": ["income statement", "balance sheet", "cash flow", "depreciation", "working capital", "net income"],
  "Profitability": ["gross margin", "operating margin", "roe", "roic", "ebit", "revenue", "cogs"],
  "Strategy & capital": ["synerg", "merger", "acquisition", "capital structure", "leverage", "debt"],
};
const GLOSSARY = [
  ["ebitda", "What does EBITDA measure?", "Operating profit before interest, taxes, depreciation and amortisation. A rough proxy for operating cash generation."],
  ["wacc", "What is WACC?", "The blended cost of debt (after tax) and equity, weighted by the capital structure. It's the discount rate for unlevered free cash flow."],
  ["working capital", "How does rising working capital affect cash?", "Higher receivables or inventory ties up cash, so it shows as a cash outflow on the cash flow statement."],
  ["depreciation", "Why add back depreciation in cash from operations?", "It's a non-cash expense. It lowers net income but no cash leaves the business in that period."],
  ["enterprise value", "Enterprise value vs. equity value?", "EV is the value of the operating business to all capital providers. Equity value is what's left for shareholders after net debt."],
  ["free cash flow", "How is free cash flow calculated?", "Cash from operations minus capital expenditure. It's the cash available to investors."],
  ["dcf", "What drives a DCF valuation?", "Projected free cash flows, the discount rate (WACC), and the terminal value, which is often 60–75% of the total."],
  ["margin", "What does operating margin tell you?", "How much of each dollar of revenue becomes operating profit after operating costs."],
];

export function offlineNotes(text) {
  const lower = text.toLowerCase();
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 25 && s.length < 400);
  const topics = Object.entries(TOPICS).filter(([, t]) => t.some(x => lower.includes(x))).map(([k]) => k);

  // Score sentences by finance-term density so the summary picks the most substantive lines.
  const terms = Object.values(TOPICS).flat();
  const scored = sentences.map((s, i) => ({ s, i, score: terms.filter(t => s.toLowerCase().includes(t)).length + (/\d/.test(s) ? 0.5 : 0) }));
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, 8).sort((a, b) => a.i - b.i);
  const formulas = sentences.filter(s => /=|calculated as|divided by|ratio/i.test(s)).slice(0, 4);
  const numbers = sentences.filter(s => /\$\s?\d|\d+(\.\d+)?\s?%/.test(s)).slice(0, 4);

  const md = [
    `### Summary${topics.length ? ` · ${topics.join(", ")}` : ""}`,
    top.slice(0, 3).map(x => x.s).join(" ") || "Not enough text to summarise. Try pasting more content.",
    ...(top.length > 3 ? ["### Key points", ...top.slice(3, 8).map(x => `- ${x.s}`)] : []),
    ...(formulas.length ? ["### Formulas", ...formulas.map(f => `- ${f}`)] : []),
    ...(numbers.length ? ["### Key figures", ...numbers.map(f => `- ${f}`)] : []),
  ].join("\n\n");

  const cards = GLOSSARY.filter(([k]) => lower.includes(k)).slice(0, 6).map(([, q, a]) => ({ q, a }));
  return { source: "offline", markdown: md, cards: cards.length ? cards : GLOSSARY.slice(0, 4).map(([, q, a]) => ({ q, a })) };
}
