import { depreciation, dcf, ccc, lbo, bva, analyzeResume, offlineNotes, parseFlashcards } from "./finance.js";
import { askGemini, getKey, setKey, aiAvailable } from "./ai.js";

const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
let DATA;

/* ---------- helpers ---------- */
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const md = (s = "") => (window.marked && window.DOMPurify) ? DOMPurify.sanitize(marked.parse(String(s))) : `<p>${esc(s)}</p>`;
const money = (n, d = 1) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const signed = (n, d = 1) => `<span class="${n > 0 ? "pos" : n < 0 ? "neg" : ""}">${n > 0 ? "+" : ""}${money(n, d)}</span>`;
const stripModule = t => t.replace(/^Module \d+:\s*/, "");
const toast = msg => { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2400); };
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

function segmented(options, current, onPick) {
  const el = document.createElement("div");
  el.className = "segmented"; el.setAttribute("role", "tablist");
  el.innerHTML = options.map(([v, l]) => `<button role="tab" data-v="${v}" class="${v === current ? "on" : ""}" aria-selected="${v === current}">${l}</button>`).join("");
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    el.querySelectorAll("button").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", x === b); });
    onPick(b.dataset.v);
  });
  return el;
}

function slider({ id, label, min, max, step, value, fmt }) {
  return `<div class="slider"><div class="slider-top"><span>${label}</span><output id="o-${id}">${fmt(value)}</output></div>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${esc(label)}"></div>`;
}
function bindSliders(root, defs, render) {
  const read = () => Object.fromEntries(defs.map(d => [d.id, parseFloat($(`#${d.id}`, root).value)]));
  root.addEventListener("input", e => {
    const d = defs.find(x => x.id === e.target.id); if (!d) return;
    $(`#o-${d.id}`, root).textContent = d.fmt(parseFloat(e.target.value));
    render(read());
  });
  render(read());
}
const pct = v => `${(v * 100).toFixed(1).replace(/\.0$/, "")}%`;
const usd = v => `$${v}M`;
const days = v => `${v} days`;

async function readPdf(file) {
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = res; s.onerror = () => rej(new Error("Could not load the PDF reader."));
      document.head.append(s);
    });
    // Browsers block cross-origin workers, so load the worker through a same-origin blob URL.
    const w = await fetch("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js").then(r => r.blob());
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(w);
  }
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const c = await page.getTextContent();
    text += c.items.map(it => it.str + (it.hasEOL ? "\n" : " ")).join("") + "\n\n";
  }
  return { text: text.replace(/[ \t]+/g, " ").trim(), pages: pdf.numPages };
}

function sourceInput(prefix, placeholder) {
  return `
    <div class="drop" id="${prefix}-drop" tabindex="0" role="button" aria-label="Upload a PDF">
      <input type="file" accept="application/pdf" id="${prefix}-file" hidden>
      <div style="font-size:15px">Drop a PDF here, or <span style="color:var(--accent)">browse</span></div>
      <div class="small" id="${prefix}-status" style="margin-top:6px;color:var(--text-3)">The file is read in your browser and never uploaded.</div>
    </div>
    <p class="small muted" style="text-align:center;margin:14px 0">or paste text</p>
    <textarea class="input" id="${prefix}-text" placeholder="${esc(placeholder)}"></textarea>`;
}
function bindSourceInput(root, prefix) {
  const drop = $(`#${prefix}-drop`, root), file = $(`#${prefix}-file`, root), status = $(`#${prefix}-status`, root), ta = $(`#${prefix}-text`, root);
  const load = async f => {
    if (!f) return;
    status.textContent = `Reading ${f.name}…`;
    try { const { text, pages } = await readPdf(f); ta.value = text; status.textContent = `${f.name} · ${pages} page${pages > 1 ? "s" : ""} · ${text.split(/\s+/).length.toLocaleString()} words`; ta.dispatchEvent(new Event("input")); }
    catch (e) { status.textContent = "Couldn't read that PDF. Try pasting the text instead."; }
  };
  drop.onclick = () => file.click();
  drop.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } };
  file.onchange = () => load(file.files[0]);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); load(e.dataTransfer.files[0]); };
}

/* ---------- views ---------- */
const views = {};

views.home = () => {
  const tiles = [
    ["learn", "📘", "Learn", `${DATA.MODULES.length} modules from the three statements to LBOs.`],
    ["labs", "🧮", "Labs", "Five live models: depreciation, DCF, working capital, variance and LBO."],
    ["questions", "🎙️", "Interview", `${DATA.INTERVIEW_QUESTIONS.length} real questions with model answers and a script to say out loud.`],
    ["ask", "✦", "Ask AI", "A patient finance tutor for any question."],
    ["notes", "📝", "Notes", "Turn a 10-K or lecture PDF into study notes and flashcards."],
    ["resume", "📄", "Resume", "See how your resume reads for the role you want."],
    ["careers", "🧭", "Careers", "Six finance paths, with pay, skills and what the interviews test."],
  ];
  return `
    <section class="hero">
      <h1>Finance.<br>Mastered.</h1>
      <p>Learn the concepts, practise the questions, and walk into your interview ready.</p>
      <div class="row" style="justify-content:center;margin-top:30px">
        <a class="btn" href="#/learn">Start learning</a>
        <a class="link-btn" href="#/questions" style="font-size:17px">Practise questions ›</a>
      </div>
    </section>
    <div class="grid">${tiles.map(([r, i, t, d]) => `
      <a class="card" href="#/${r}"><span class="tile-icon" aria-hidden="true">${i}</span><h3>${t}</h3><p>${d}</p></a>`).join("")}
    </div>`;
};

views.learn = (id) => {
  const done = store.get("done", []);
  if (id) {
    const i = DATA.MODULES.findIndex(m => m.id === id);
    const m = DATA.MODULES[i];
    if (!m) return views.learn();
    const next = DATA.MODULES[i + 1];
    setTimeout(() => {
      $("#mark").onclick = () => {
        const d = new Set(store.get("done", [])); d.has(m.id) ? d.delete(m.id) : d.add(m.id); store.set("done", [...d]);
        $("#mark").textContent = d.has(m.id) ? "Completed ✓" : "Mark as complete";
      };
      app.querySelectorAll("[data-ask]").forEach(b => b.onclick = () => {
        const l = m.lessons[+b.dataset.ask];
        sessionStorage.setItem("askContext", JSON.stringify({ title: l.subtitle, text: `${l.summary}\n${l.key_takeaways.join("\n")}\n${l.formula}` }));
        location.hash = "#/ask";
      });
    });
    return `
      <div class="page-head">
        <p class="eyebrow">Module ${i + 1} · ${esc(m.est_time)} · ${esc(m.level)}</p>
        <h1>${esc(stripModule(m.title))}</h1>
        <p>${esc(m.description)}</p>
      </div>
      ${m.lessons.map((l, j) => `
        <article class="lesson">
          <h2>${esc(l.subtitle)}</h2>
          <p class="lead">${esc(l.summary)}</p>
          <ul>${l.key_takeaways.map(k => `<li>${esc(k)}</li>`).join("")}</ul>
          ${l.formula ? `<div class="formula">${esc(l.formula)}</div>` : ""}
          ${l.pro_tip ? `<div class="tip"><b>Interview tip</b> · ${esc(l.pro_tip)}</div>` : ""}
          <button class="link-btn" data-ask="${j}" style="margin-top:18px">Ask AI about this lesson ›</button>
        </article>`).join("")}
      <div class="row" style="margin-top:24px;justify-content:space-between">
        <button class="btn ghost" id="mark">${done.includes(m.id) ? "Completed ✓" : "Mark as complete"}</button>
        ${next ? `<a class="btn" href="#/learn/${next.id}">Next: ${esc(stripModule(next.title))}</a>` : `<a class="btn" href="#/labs">Try the labs</a>`}
      </div>`;
  }
  return `
    <div class="page-head">
      <h1>Learn</h1>
      <p>Six modules, in order, from first principles to deal modeling. ${done.length ? `You've completed ${done.length} of ${DATA.MODULES.length}.` : ""}</p>
    </div>
    <div class="grid">${DATA.MODULES.map((m, i) => `
      <a class="card" href="#/learn/${m.id}">
        <div class="meta">Module ${i + 1} · ${esc(m.est_time)} ${done.includes(m.id) ? "· ✓ Done" : ""}</div>
        <h3>${esc(stripModule(m.title))}</h3>
        <p>${esc(m.description)}</p>
        <div class="more">${m.lessons.length} lessons ›</div>
      </a>`).join("")}
    </div>`;
};

/* Labs */
const LABS = {
  dep: {
    name: "Depreciation", title: "The $10 depreciation walk",
    blurb: "Change depreciation or the tax rate and watch all three statements stay in balance.",
    sliders: [
      { id: "d", label: "Depreciation increase", min: 1, max: 100, step: 1, value: 10, fmt: v => `$${v}` },
      { id: "t", label: "Tax rate", min: 0, max: 0.5, step: 0.01, value: 0.2, fmt: pct },
    ],
    render: ({ d, t }) => {
      const r = depreciation(d, t);
      return `
        <div class="stats">
          <div class="stat"><div class="k">Net income</div><div class="v">${signed(r.netIncome)}</div></div>
          <div class="stat"><div class="k">Cash</div><div class="v">${signed(r.cash)}</div></div>
          <div class="stat hl"><div class="k">Balanced</div><div class="v">${r.balanced ? "Yes" : "No"}</div></div>
        </div>
        <div class="table-wrap"><table>
          <tr><th>Income statement</th><th>Change</th></tr>
          <tr><td>Depreciation expense</td><td>${signed(-d)}</td></tr>
          <tr><td>Taxes (tax shield)</td><td>${signed(r.taxShield)}</td></tr>
          <tr class="total"><td>Net income</td><td>${signed(r.netIncome)}</td></tr>
          <tr><th>Cash flow statement</th><th></th></tr>
          <tr><td>Net income</td><td>${signed(r.netIncome)}</td></tr>
          <tr><td>Add back depreciation</td><td>${signed(d)}</td></tr>
          <tr class="total"><td>Cash from operations</td><td>${signed(r.cash)}</td></tr>
          <tr><th>Balance sheet</th><th></th></tr>
          <tr><td>Cash</td><td>${signed(r.cash)}</td></tr>
          <tr><td>PP&amp;E</td><td>${signed(-d)}</td></tr>
          <tr class="total"><td>Total assets</td><td>${signed(r.assets)}</td></tr>
          <tr class="total"><td>Retained earnings (equity)</td><td>${signed(r.equity)}</td></tr>
        </table></div>
        <p class="note-line">Cash goes up by the tax shield (${money(r.taxShield)}) because depreciation is a non-cash expense that still lowers taxes.</p>`;
    },
  },
  dcf: {
    name: "DCF", title: "Five-year DCF",
    blurb: "An unlevered DCF with a Gordon growth terminal value. Open Advanced to model a specific company.",
    sliders: [
      { id: "g", label: "Revenue growth", min: 0, max: 0.3, step: 0.005, value: 0.08, fmt: pct },
      { id: "m", label: "EBIT margin", min: 0.05, max: 0.5, step: 0.01, value: 0.2, fmt: pct },
      { id: "w", label: "WACC", min: 0.05, max: 0.15, step: 0.0025, value: 0.09, fmt: pct },
      { id: "tg", label: "Terminal growth", min: 0, max: 0.05, step: 0.0025, value: 0.025, fmt: pct },
      { id: "base", label: "Base revenue", min: 10, max: 1000, step: 10, value: 100, fmt: usd, adv: true },
      { id: "tax", label: "Tax rate", min: 0, max: 0.4, step: 0.01, value: 0.21, fmt: pct, adv: true },
      { id: "cx", label: "Capex (% of revenue)", min: 0, max: 0.2, step: 0.005, value: 0.05, fmt: pct, adv: true },
      { id: "nwc", label: "Change in NWC (% of revenue)", min: 0, max: 0.1, step: 0.005, value: 0.02, fmt: pct, adv: true },
      { id: "da", label: "D&A (% of revenue)", min: 0, max: 0.15, step: 0.005, value: 0.04, fmt: pct, adv: true },
      { id: "cash", label: "Cash", min: 0, max: 200, step: 5, value: 20, fmt: usd, adv: true },
      { id: "debt", label: "Debt", min: 0, max: 300, step: 5, value: 40, fmt: usd, adv: true },
      { id: "sh", label: "Shares outstanding", min: 1, max: 100, step: 1, value: 10, fmt: v => `${v}M`, adv: true },
    ],
    render: ({ g, m, w, tg, base, tax, cx, nwc, da, cash, debt, sh }) => {
      const r = dcf({ growth: g, margin: m, wacc: w, tg, base, tax, capex: cx, nwc, da, cash, debt, shares: sh });
      if (!r.valid) return `<div class="panel"><h3>Terminal growth must be below WACC</h3><p class="muted" style="margin-top:6px">Otherwise the Gordon growth formula divides by zero or a negative number, and the business is worth infinity.</p></div>`;
      return `
        <div class="stats">
          <div class="stat"><div class="k">Enterprise value</div><div class="v">${money(r.ev)}M</div></div>
          <div class="stat"><div class="k">Equity value</div><div class="v">${money(r.equity)}M</div></div>
          <div class="stat hl"><div class="k">Price per share</div><div class="v">${money(r.price, 2)}</div></div>
        </div>
        <div class="table-wrap"><table>
          <tr><th>$M</th>${r.rows.map(x => `<th>Yr ${x.year}</th>`).join("")}</tr>
          <tr><td>Revenue</td>${r.rows.map(x => `<td>${x.rev.toFixed(1)}</td>`).join("")}</tr>
          <tr><td>EBIT</td>${r.rows.map(x => `<td>${x.ebit.toFixed(1)}</td>`).join("")}</tr>
          <tr><td>NOPAT</td>${r.rows.map(x => `<td>${x.nopat.toFixed(1)}</td>`).join("")}</tr>
          <tr><td>Unlevered FCF</td>${r.rows.map(x => `<td>${x.fcf.toFixed(1)}</td>`).join("")}</tr>
          <tr class="total"><td>Present value</td>${r.rows.map(x => `<td>${x.pv.toFixed(1)}</td>`).join("")}</tr>
        </table></div>
        <p class="note-line">Terminal value is ${r.tvPct.toFixed(0)}% of enterprise value. ${r.tvPct > 75 ? "That's high, so the valuation leans heavily on assumptions about the far future." : "That's within the normal 60–75% range."} Net debt is ${money(debt - cash, 0)}M over ${sh}M shares.</p>`;
    },
  },
  ccc: {
    name: "Working capital", title: "Cash conversion cycle",
    blurb: "How many days your cash is tied up between paying suppliers and collecting from customers.",
    sliders: [
      { id: "dio", label: "Days inventory (DIO)", min: 0, max: 120, step: 1, value: 45, fmt: days },
      { id: "dso", label: "Days receivable (DSO)", min: 0, max: 120, step: 1, value: 35, fmt: days },
      { id: "dpo", label: "Days payable (DPO)", min: 0, max: 150, step: 1, value: 50, fmt: days },
    ],
    render: ({ dio, dso, dpo }) => {
      const c = ccc(dio, dso, dpo);
      return `
        <div class="stats"><div class="stat hl"><div class="k">Cash conversion cycle</div><div class="v">${c} days</div></div></div>
        <div class="formula">CCC = DIO + DSO − DPO = ${dio} + ${dso} − ${dpo} = ${c}</div>
        <p class="note-line">${c < 0
          ? "Negative cycle: suppliers fund the business. Customers pay before suppliers are paid, the way Amazon and Apple run."
          : c < 30 ? "A tight cycle. Little cash is tied up in operations."
          : "Cash is tied up for a while. Cutting inventory days or collecting faster would free up cash."}</p>`;
    },
  },
  bva: {
    name: "Variance", title: "Budget vs. actual",
    blurb: "An FP&A variance bridge from budget to actual EBITDA. Revenue above budget is favourable; costs above budget are not.",
    sliders: [
      { id: "br", label: "Budget revenue", min: 100, max: 1000, step: 5, value: 500, fmt: usd },
      { id: "ar", label: "Actual revenue", min: 100, max: 1000, step: 5, value: 475, fmt: usd },
      { id: "bc", label: "Budget COGS", min: 0, max: 600, step: 5, value: 250, fmt: usd },
      { id: "ac", label: "Actual COGS", min: 0, max: 600, step: 5, value: 235, fmt: usd },
      { id: "bo", label: "Budget opex", min: 0, max: 400, step: 5, value: 120, fmt: usd },
      { id: "ao", label: "Actual opex", min: 0, max: 400, step: 5, value: 135, fmt: usd },
    ],
    render: v => {
      const r = bva(v);
      const row = (n, x) => `<tr><td>${n}</td><td>${x.budget}</td><td>${x.actual}</td><td>${x.variance > 0 ? "+" : ""}${x.variance}</td><td><span class="tag ${x.favourable ? "good" : "bad"}">${x.favourable ? "Fav" : "Unfav"}</span></td></tr>`;
      return `
        <div class="stats">
          <div class="stat"><div class="k">Budget EBITDA</div><div class="v">${money(r.ebitda.budget, 0)}M</div></div>
          <div class="stat"><div class="k">Actual EBITDA</div><div class="v">${money(r.ebitda.actual, 0)}M</div></div>
          <div class="stat hl"><div class="k">Variance</div><div class="v">${r.ebitda.variance > 0 ? "+" : ""}${r.ebitda.pct.toFixed(1)}%</div></div>
        </div>
        <div class="table-wrap"><table>
          <tr><th>$M</th><th>Budget</th><th>Actual</th><th>Var</th><th></th></tr>
          ${row("Revenue", r.rev)}${row("COGS", r.cogs)}${row("Opex", r.opex)}
          <tr class="total"><td>EBITDA</td><td>${r.ebitda.budget}</td><td>${r.ebitda.actual}</td><td>${r.ebitda.variance > 0 ? "+" : ""}${r.ebitda.variance}</td><td><span class="tag ${r.ebitda.favourable ? "good" : "bad"}">${r.ebitda.favourable ? "Fav" : "Unfav"}</span></td></tr>
        </table></div>`;
    },
  },
  lbo: {
    name: "LBO", title: "LBO returns",
    blurb: "A simple private equity buyout: buy with debt, pay it down, sell at a multiple.",
    sliders: [
      { id: "pp", label: "Purchase price", min: 50, max: 300, step: 5, value: 100, fmt: usd },
      { id: "dp", label: "Debt funding", min: 0, max: 0.9, step: 0.05, value: 0.7, fmt: pct },
      { id: "ee", label: "Exit EBITDA", min: 10, max: 60, step: 1, value: 28, fmt: usd },
      { id: "em", label: "Exit multiple", min: 4, max: 15, step: 0.5, value: 8, fmt: v => `${v}x` },
      { id: "pd", label: "Debt paydown per year", min: 0, max: 20, step: 1, value: 6, fmt: usd },
      { id: "hp", label: "Holding period", min: 1, max: 10, step: 1, value: 5, fmt: v => `${v} yrs` },
    ],
    render: v => {
      const r = lbo(v);
      return `
        <div class="stats">
          <div class="stat"><div class="k">Equity in</div><div class="v">${money(r.equityIn, 0)}M</div></div>
          <div class="stat"><div class="k">Equity out</div><div class="v">${money(r.equityOut, 0)}M</div></div>
          <div class="stat"><div class="k">MOIC</div><div class="v">${r.moic.toFixed(2)}x</div></div>
          <div class="stat hl"><div class="k">IRR</div><div class="v">${r.irr.toFixed(1)}%</div></div>
        </div>
        <div class="table-wrap"><table>
          <tr><td>Entry debt</td><td>${money(r.debtIn, 0)}M</td></tr>
          <tr><td>Debt repaid</td><td>${money(r.repaid, 0)}M</td></tr>
          <tr><td>Exit enterprise value</td><td>${money(r.exitEv, 0)}M</td></tr>
          <tr class="total"><td>Exit debt</td><td>${money(r.debtOut, 0)}M</td></tr>
        </table></div>
        <p class="note-line">${r.irr >= 20 ? "That clears the typical 20%+ PE hurdle." : "Below the typical 20% PE hurdle. Try more leverage, a higher exit multiple or more EBITDA growth."}</p>`;
    },
  },
};

views.labs = (id) => {
  const key = LABS[id] ? id : "dep";
  setTimeout(() => {
    $("#lab-tabs").append(segmented(Object.entries(LABS).map(([k, l]) => [k, l.name]), key, k => { history.replaceState(null, "", `#/labs/${k}`); mountLab(k); }));
    mountLab(key);
  });
  return `
    <div class="page-head"><h1>Labs</h1><p>Move a slider and the model updates instantly.</p></div>
    <div id="lab-tabs"></div>
    <div id="lab"></div>`;
};
function mountLab(k) {
  const l = LABS[k], el = $("#lab");
  el.innerHTML = `
    <div class="lab view">
      <div class="panel"><h3>${l.title}</h3><p class="muted small" style="margin:6px 0 24px">${l.blurb}</p>${l.sliders.filter(d => !d.adv).map(slider).join("")}
        ${l.sliders.some(d => d.adv) ? `<details class="adv"><summary>Advanced</summary><div style="margin-top:18px">${l.sliders.filter(d => d.adv).map(slider).join("")}</div></details>` : ""}
        <button class="link-btn small" id="lab-reset" style="margin-top:6px">Reset</button></div>
      <div id="lab-out"></div>
    </div>`;
  bindSliders(el, l.sliders, v => { $("#lab-out", el).innerHTML = l.render(v); });
  $("#lab-reset", el).onclick = () => mountLab(k);
}

/* Questions */
views.questions = (id) => {
  const Q = DATA.INTERVIEW_QUESTIONS;
  if (id) return questionDetail(Q.find(q => q.id === id));
  const roles = [...new Set(Q.map(q => q.role))].sort();
  const companies = [...new Set(Q.map(q => q.company))].sort();
  const st = store.get("qfilter", { s: "", role: "", co: "" });
  setTimeout(() => {
    const list = $("#q-list"), s = $("#q-search");
    const draw = () => {
      const term = st.s.toLowerCase();
      const hits = Q.filter(q => (!st.role || q.role === st.role) && (!st.co || q.company === st.co) &&
        (!term || [q.question, q.topic, q.company, q.company_title, q.role].join(" ").toLowerCase().includes(term)));
      store.set("qfilter", st);
      list.innerHTML = hits.length ? hits.map(q => `
        <a class="q-item" href="#/questions/${q.id}">
          <div class="sub">${esc(q.company)} · ${esc(q.topic)} · ${esc(q.difficulty.split(" /")[0])}</div>
          <div class="q">${esc(q.question)}</div>
        </a>`).join("") : `<p class="muted" style="padding:40px 0;text-align:center">No questions match. Try a different word or clear the filters.</p>`;
      $("#q-count").textContent = `${hits.length} of ${Q.length}`;
      app.querySelectorAll(".chip").forEach(c => c.classList.toggle("on", st[c.dataset.k] === c.dataset.v));
    };
    s.value = st.s; s.oninput = () => { st.s = s.value; draw(); };
    app.querySelectorAll(".chip").forEach(c => c.onclick = () => { st[c.dataset.k] = st[c.dataset.k] === c.dataset.v ? "" : c.dataset.v; draw(); });
    draw();
  });
  return `
    <div class="page-head"><h1>Interview</h1><p>Real questions from the Big 4, banks and big tech, each with a model answer, a script to say out loud, and the trap to avoid.</p></div>
    <input class="input search" id="q-search" placeholder="Search by company, topic or keyword" aria-label="Search questions">
    <div class="chips" style="margin-top:16px">${roles.map(r => `<button class="chip" data-k="role" data-v="${esc(r)}">${esc(r)}</button>`).join("")}</div>
    <div class="chips" style="margin-top:8px">${companies.map(c => `<button class="chip" data-k="co" data-v="${esc(c)}">${esc(c)}</button>`).join("")}</div>
    <p class="small muted" id="q-count" style="margin:22px 0 10px"></p>
    <div class="q-list" id="q-list"></div>`;
};

function questionDetail(q) {
  if (!q) return views.questions();
  const Q = DATA.INTERVIEW_QUESTIONS, i = Q.indexOf(q), next = Q[(i + 1) % Q.length];
  const script = esc(q.spoken_script).replace(/\[([^\]]+)\]/g, '<span class="cue">[$1]</span>');
  const panes = {
    answer: `<div class="prose">${esc(q.written_answer)}</div>`,
    say: `<div class="script">${script}</div>
      <div class="section"><h3 style="margin-bottom:12px">Delivery cues</h3><ul class="lesson" style="padding:0;border:0"><ul style="margin:0">${q.vocal_cues.map(c => `<li>${esc(c)}</li>`).join("")}</ul></ul></div>
      <div class="panel section" style="text-align:center">
        <p class="muted small">Answer out loud. Aim for about 60 seconds.</p>
        <div class="timer" id="timer">0:00</div>
        <button class="btn" id="timer-btn" style="margin-top:12px">Start</button>
      </div>`,
    trap: `<div class="tip" style="background:color-mix(in srgb,var(--bad) 9%,transparent)"><b style="color:var(--bad)">Common mistake</b> · ${esc(q.rookie_trap)}</div>
      <div class="section"><p class="eyebrow">Likely follow-up</p><p style="font-size:21px;line-height:1.4;max-width:720px">${esc(q.follow_up)}</p></div>`,
  };
  let timer;
  const bindTimer = () => {
    const b = $("#timer-btn"); if (!b) return;
    b.onclick = () => {
      if (timer) { clearInterval(timer); timer = null; b.textContent = "Start"; return; }
      const t0 = Date.now(); b.textContent = "Stop";
      timer = setInterval(() => {
        const el = $("#timer"); if (!el) return clearInterval(timer);
        const s = Math.floor((Date.now() - t0) / 1000);
        el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
        el.style.color = s > 90 ? "var(--bad)" : s >= 45 ? "var(--good)" : "";
      }, 250);
    };
  };
  setTimeout(() => {
    $("#q-tabs").append(segmented([["answer", "Answer"], ["say", "Say it"], ["trap", "Traps"]], "answer", k => {
      clearInterval(timer); timer = null; $("#q-pane").innerHTML = panes[k]; bindTimer();
    }));
  });
  return `
    <div class="page-head">
      <p class="eyebrow">${esc(q.company)} · ${esc(q.company_title)}</p>
      <h1 style="font-size:clamp(28px,4.5vw,40px)">${esc(q.question)}</h1>
      <div class="row" style="margin-top:16px"><span class="tag">${esc(q.topic)}</span><span class="tag">${esc(q.difficulty)}</span><span class="tag">${esc(q.type)}</span></div>
    </div>
    <div id="q-tabs" style="margin-bottom:28px"></div>
    <div id="q-pane">${panes.answer}</div>
    <div class="row" style="justify-content:space-between;margin-top:48px">
      <a href="#/questions">‹ All questions</a>
      <a class="btn" href="#/questions/${next.id}">Next question</a>
    </div>`;
}

/* Ask AI */
let chat = [];
views.ask = () => {
  let ctx = null;
  try { ctx = JSON.parse(sessionStorage.getItem("askContext")); sessionStorage.removeItem("askContext"); } catch {}
  const suggestions = ["Why is WACC the discount rate for unlevered FCF?", "Explain EBITDA like I'm new to finance", "How does an LBO make money?", "What's the difference between EV and equity value?"];
  setTimeout(() => {
    const box = $("#chat"), ta = $("#ask-in"), send = $("#ask-send");
    const draw = () => {
      box.innerHTML = chat.map(m => `<div class="msg ${m.role === "user" ? "user" : "ai"}">${m.role === "user" ? esc(m.text) : md(m.text)}</div>`).join("") || "";
      $("#ask-empty").hidden = chat.length > 0;
    };
    const go = async text => {
      text = text.trim(); if (!text) return;
      if (!(await aiAvailable())) { openSettings(); toast("Add a Gemini key to use Ask AI"); return; }
      chat.push({ role: "user", text }); ta.value = ""; ta.style.height = ""; draw();
      box.insertAdjacentHTML("beforeend", `<div class="msg ai typing" id="typing"><span></span><span></span><span></span></div>`);
      send.disabled = true; window.scrollTo(0, document.body.scrollHeight);
      try {
        const sys = "You are FinPrep AI, a patient, expert corporate finance tutor. Answer clearly with intuition first, then the formula or mechanics. Use short paragraphs and **bold** key terms. If the question isn't about finance, answer it plainly without forcing finance jargon." + (ctx ? `\n\nThe learner is reading this lesson — "${ctx.title}":\n${ctx.text}` : "");
        const reply = await askGemini(chat.slice(-8), sys);
        chat.push({ role: "model", text: reply });
      } catch (e) { chat.push({ role: "model", text: `**Something went wrong.** ${e.message}` }); }
      send.disabled = false; draw(); window.scrollTo(0, document.body.scrollHeight);
    };
    ta.oninput = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; send.disabled = !ta.value.trim(); };
    ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(ta.value); } };
    send.onclick = () => go(ta.value);
    app.querySelectorAll("[data-sug]").forEach(b => b.onclick = () => go(b.textContent));
    aiAvailable().then(ok => { if (!ok && $("#key-tip")) $("#key-tip").hidden = false; });
    const ak = $("#add-key"); if (ak) ak.onclick = openSettings;
    $("#clear-chat").onclick = () => { chat = []; draw(); };
    draw();
    if (ctx) { ta.value = `Explain "${ctx.title}" in simple terms, with an example.`; ta.oninput(); ta.focus(); }
  });
  return `
    <div class="page-head row" style="justify-content:space-between;align-items:flex-end">
      <div><h1>Ask AI</h1><p>${ctx ? `About: ${esc(ctx.title)}` : "Ask anything about finance, from basic accounting to LBO math."}</p></div>
      <button class="link-btn" id="clear-chat">Clear</button>
    </div>
    <div id="ask-empty">
      <div class="tip" id="key-tip" hidden style="margin-bottom:20px">Ask AI uses Google Gemini. <button class="link-btn" id="add-key">Add your free API key</button> to start.</div>
      <div class="suggest">${suggestions.map(s => `<button class="chip" data-sug>${esc(s)}</button>`).join("")}</div>
    </div>
    <div class="chat" id="chat" aria-live="polite"></div>
    <div class="composer">
      <textarea id="ask-in" rows="1" placeholder="Ask a question" aria-label="Your question"></textarea>
      <button class="send" id="ask-send" disabled aria-label="Send"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
    </div>`;
};

/* Notes */
views.notes = () => {
  setTimeout(() => {
    bindSourceInput(app, "n");
    const ta = $("#n-text"), btn = $("#n-go");
    ta.addEventListener("input", () => btn.disabled = ta.value.trim().length < 50);
    btn.onclick = async () => {
      const text = ta.value.trim(); const out = $("#n-out");
      btn.disabled = true; btn.textContent = "Generating…";
      let result;
      if (await aiAvailable()) {
        try {
          const raw = await askGemini([{ role: "user", text: `Turn this material into study notes.\n\n"""${text.slice(0, 30000)}"""` }],
            "You are a finance professor writing concise study notes in Markdown. Use these sections as ### headings: Summary, Key concepts, Formulas, Real-world example, Revision checklist, Flashcards. In Flashcards, write 5 pairs exactly as:\n**Q:** question\n**A:** answer");
          const [body, cardsPart = ""] = raw.split(/###\s*Flashcards/i);
          result = { source: "Gemini", markdown: body, cards: parseFlashcards(cardsPart) };
        } catch (e) { toast(e.message); }
      }
      if (!result) result = offlineNotes(text);
      out.innerHTML = `
        <div class="section"><p class="eyebrow">${result.source === "Gemini" ? "Written by Gemini" : "Extracted offline · AI notes are unavailable right now"}</p>
        <div class="prose md">${md(result.markdown)}</div></div>
        ${result.cards.length ? `<div class="section"><h2>Flashcards</h2><p class="muted small" style="margin:6px 0 18px">Tap a card to flip it.</p>
        <div class="grid">${result.cards.map(c => `<div class="flash" tabindex="0" role="button"><div class="flash-inner">
          <div class="flash-face"><small>Question</small>${esc(c.q)}</div>
          <div class="flash-face back"><small>Answer</small>${esc(c.a)}</div></div></div>`).join("")}</div></div>` : ""}`;
      out.querySelectorAll(".flash").forEach(f => { const flip = () => f.classList.toggle("flipped"); f.onclick = flip; f.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } }; });
      btn.disabled = false; btn.textContent = "Generate notes";
      out.scrollIntoView({ behavior: "smooth" });
    };
  });
  return `
    <div class="page-head"><h1>Notes</h1><p>Turn a 10-K, research report or lecture into study notes and flashcards.</p></div>
    ${sourceInput("n", "Paste lecture notes, a report or any finance text…")}
    <div class="row" style="margin-top:18px"><button class="btn" id="n-go" disabled>Generate notes</button></div>
    <div id="n-out"></div>`;
};

/* Resume */
views.resume = () => {
  const roles = Object.keys(DATA.ROLE_SKILL_REQUIREMENTS);
  setTimeout(() => {
    bindSourceInput(app, "r");
    const ta = $("#r-text"), btn = $("#r-go");
    ta.addEventListener("input", () => btn.disabled = ta.value.trim().length < 50);
    btn.onclick = () => {
      const r = analyzeResume(ta.value, $("#r-role").value, DATA.ROLE_SKILL_REQUIREMENTS);
      const C = 2 * Math.PI * 70, col = r.score >= 70 ? "var(--good)" : r.score >= 45 ? "var(--accent)" : "var(--bad)";
      const kw = (found, missing) => `<div class="chips">${found.map(k => `<span class="tag good">✓ ${esc(k)}</span>`).join("")}${missing.map(k => `<span class="tag bad">${esc(k)}</span>`).join("")}</div>`;
      $("#r-out").innerHTML = `
        <div class="section panel split">
          <div class="ring"><svg width="160" height="160"><circle cx="80" cy="80" r="70" stroke="var(--bg-2)" stroke-width="12" fill="none"/>
            <circle cx="80" cy="80" r="70" stroke="${col}" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - r.score / 100)}" style="transition:stroke-dashoffset 1s"/></svg>
            <div class="val">${r.score}</div></div>
          <div><h2>Match for ${esc(r.role)}</h2>
            <p class="muted" style="margin-top:8px">${r.score >= 70 ? "Strong fit. Polish the gaps below and you're ready." : r.score >= 45 ? "A good base. Closing the gaps below will lift this quickly." : "There's work to do. Start with the missing keywords and add numbers to your bullets."}</p>
            <div class="stats" style="margin:18px 0 0"><div class="stat"><div class="k">Keywords</div><div class="v">${r.kwScore}%</div></div>
            <div class="stat"><div class="k">Quantified results</div><div class="v">${r.metrics}</div></div>
            <div class="stat"><div class="k">Strong verbs</div><div class="v">${r.verbs.length}</div></div></div>
          </div>
        </div>
        <div class="section"><h3>Role keywords</h3><p class="muted small" style="margin:4px 0 12px">Green ones are on your resume; red ones are missing.</p>${kw(r.foundKw, r.missingKw)}</div>
        <div class="section"><h3>Tools</h3><div style="margin-top:12px">${kw(r.foundTools, r.missingTools)}</div></div>
        <div class="section"><h3>Modeling skills</h3><div style="margin-top:12px">${kw(r.foundModel, r.missingModel)}</div></div>
        ${r.weakBullets.length ? `<div class="section"><h2>Bullets to rewrite</h2><p class="muted" style="margin:6px 0 18px">These lines start weakly or have no numbers. Use: <b>Accomplished X, measured by Y, by doing Z.</b></p>
          <div class="q-list">${r.weakBullets.map(b => `<div class="q-item"><div class="q" style="font-weight:400">${esc(b.text)}</div><div class="sub" style="margin-top:8px">${esc(b.why)}</div></div>`).join("")}</div></div>` : ""}
        <div class="section"><h2>Your four-week plan</h2><div class="grid" style="margin-top:18px">${r.plan.map((p, i) => `<div class="card"><div class="meta">Week ${i + 1}</div><h3>${esc(p.title)}</h3><p>${esc(p.action)}</p></div>`).join("")}</div></div>`;
      $("#r-out").scrollIntoView({ behavior: "smooth" });
    };
  });
  return `
    <div class="page-head"><h1>Resume</h1><p>See how your resume reads for the role you want, and what to fix first.</p></div>
    <label class="field"><span>Target role</span><select class="input" id="r-role">${roles.map(r => `<option>${esc(r)}</option>`).join("")}</select></label>
    ${sourceInput("r", "Paste your resume text…")}
    <div class="row" style="margin-top:18px"><button class="btn" id="r-go" disabled>Analyse resume</button></div>
    <div id="r-out"></div>`;
};

/* Careers */
views.careers = (id) => {
  const C = DATA.CAREER_ROLES;
  const c = C.find(x => x.id === id);
  if (c) {
    const roleKey = { financial_analyst: "Financial Analyst", fpa_analyst: "FP&A Analyst", valuation_analyst: "Valuation", ib_analyst: "Investment Banking", equity_research: "Equity Research", corp_dev: "Corporate Finance" }[c.id];
    setTimeout(() => { const b = $("#practise"); if (b) b.onclick = () => { store.set("qfilter", { s: "", role: roleKey, co: "" }); location.hash = "#/questions"; }; });
    return `
      <div class="page-head"><p class="eyebrow">${esc(c.category)}</p><h1>${esc(c.title)}</h1><p>${esc(c.overview)}</p></div>
      <div class="stats"><div class="stat hl"><div class="k">Typical pay</div><div class="v" style="font-size:20px">${esc(c.comp_band)}</div></div></div>
      <div class="section"><h2>A day in the role</h2><p class="prose" style="margin-top:10px">${esc(c.day_in_life)}</p></div>
      <div class="section"><h2>The interview</h2><p class="prose" style="margin-top:10px">${esc(c.interview_format)}</p></div>
      <div class="section grid">
        <div class="card"><h3>Technical skills</h3><ul class="lesson" style="padding:0;border:0"><ul style="margin-top:12px">${c.technical_skills.map(s => `<li style="font-size:15px">${esc(s)}</li>`).join("")}</ul></ul></div>
        <div class="card"><h3>Soft skills</h3><ul class="lesson" style="padding:0;border:0"><ul style="margin-top:12px">${c.soft_skills.map(s => `<li style="font-size:15px">${esc(s)}</li>`).join("")}</ul></ul></div>
      </div>
      <div class="section"><h2>What firms call it</h2><div class="table-wrap" style="margin-top:12px"><table>${Object.entries(c.company_titles).map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:left">${esc(v)}</td></tr>`).join("")}</table></div></div>
      <div class="row" style="justify-content:space-between;margin-top:48px"><a href="#/careers">‹ All careers</a>${roleKey ? `<button class="btn" id="practise">Practise these questions</button>` : ""}</div>`;
  }
  return `
    <div class="page-head"><h1>Careers</h1><p>Six finance paths, with what they pay, what the work is like, and how they interview.</p></div>
    <div class="grid">${C.map(c => `
      <a class="card" href="#/careers/${c.id}"><div class="meta">${esc(c.category)}</div><h3>${esc(c.title)}</h3><p>${esc(c.overview)}</p><div class="more">${esc(c.comp_band.split(" Base")[0])} ›</div></a>`).join("")}
    </div>`;
};

/* ---------- router ---------- */
function route() {
  const [, name = "", arg] = location.hash.replace(/^#/, "").split("/");
  const view = views[name] || views.home;
  app.innerHTML = `<div class="view">${view(arg)}</div>`;
  document.querySelectorAll(".nav-links a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === `#/${name}`));
  const titles = { learn: "Learn", labs: "Labs", questions: "Interview", ask: "Ask AI", notes: "Notes", resume: "Resume", careers: "Careers" };
  document.title = titles[name] ? `${titles[name]} · FinPrep Pro` : "FinPrep Pro";
  window.scrollTo(0, 0);
}

function openSettings() {
  const d = $("#settings"); $("#key-input").value = getKey(); d.showModal();
}
$("#settings-btn").onclick = openSettings;

/* theme: follows the system until the visitor picks one */
const themeBtn = $("#theme-btn");
const isDark = () => (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
const syncThemeBtn = () => { const d = isDark(); themeBtn.setAttribute("aria-label", d ? "Switch to light mode" : "Switch to dark mode"); themeBtn.title = themeBtn.getAttribute("aria-label"); themeBtn.querySelector(".sun").style.display = d ? "" : "none"; themeBtn.querySelector(".moon").style.display = d ? "none" : ""; };
themeBtn.onclick = () => { const t = isDark() ? "light" : "dark"; document.documentElement.dataset.theme = t; store.set("theme", t); syncThemeBtn(); };
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncThemeBtn);
syncThemeBtn();
$("#settings").addEventListener("close", e => {
  const v = e.target.returnValue;
  if (v === "save") { setKey($("#key-input").value.trim()); toast(getKey() ? "Key saved in this browser" : "No key saved"); }
  if (v === "clear") { setKey(""); toast("Key removed"); }
  if (location.hash.startsWith("#/ask")) route();
});

DATA = await (await fetch("/data.json")).json();
window.addEventListener("hashchange", route);
route();
