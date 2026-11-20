# FinPrep Pro

Learn corporate finance, practice real interview questions, and sharpen your resume. A fast, minimalist static web app hosted on Cloudflare Pages.

## Sections

- **Learn**: six modules, from the three statements to M&A and LBOs, with progress saved in your browser.
- **Labs**: five live models (the $10 depreciation walk, a 5-year DCF, cash conversion cycle, budget vs. actual, and LBO returns).
- **Interview**: 15 questions from the Big 4, banks and big tech. Each has a model answer, a script to say out loud with a 60-second timer, and the common mistake.
- **Ask AI**: a finance tutor built on Google Gemini. You can ask about any lesson.
- **Notes**: turn a PDF or pasted text into study notes and flashcards. Works offline, and Gemini writes them if you add a key.
- **Resume**: keyword, tool and quantification gaps for a target role, the weak bullets in your own resume, and a four-week plan.
- **Careers**: six finance paths, with pay, skills, the interview format and what each firm calls the role.

## AI setup

AI works for every visitor through `functions/api/ai.js`, which keeps the Gemini key on the server and limits use to 30 requests per visitor and 1,000 in total per day (counted in Workers KV). Set the key once:

```bash
npx wrangler pages secret put GEMINI_API_KEY --project-name finprep-pro
```

Visitors can still add their own key in Settings for unlimited use.

## Privacy

Everything runs in the browser. PDFs are parsed locally with pdf.js. A visitor's own Gemini key, if they add one, is stored in `localStorage` and sent only to Google's API.

## Run locally

```bash
npx wrangler pages dev   # serves public/ and the /api/ai function
```

Then open the URL it prints.

## Deploy

```bash
npx wrangler pages deploy --branch main
```

## Structure

```
public/
  index.html    shell, nav, settings dialog
  styles.css    design system (light and dark)
  app.js        hash router and views
  finance.js    pure finance and text logic (DCF, LBO, BvA, CCC, resume, notes)
  ai.js         Gemini client
  data.json     curriculum, questions, careers and role requirements
  _headers      security headers and CSP for Cloudflare Pages
functions/api/ai.js  rate-limited Gemini proxy
wrangler.toml        Pages config and KV binding
legacy-streamlit/  the original Streamlit app, kept for reference
```
