# FinPrep Pro

Learn corporate finance, practise real interview questions, and sharpen your resume. A fast, minimalist static web app hosted on Cloudflare Pages.

## Sections

- **Learn**: six modules, from the three statements to M&A and LBOs, with progress saved in your browser.
- **Labs**: five live models (the $10 depreciation walk, a 5-year DCF, cash conversion cycle, budget vs. actual, and LBO returns).
- **Interview**: 15 questions from the Big 4, banks and big tech. Each has a model answer, a script to say out loud with a 60-second timer, and the common trap.
- **Ask AI**: a finance tutor built on Google Gemini. You can ask about any lesson.
- **Notes**: turn a PDF or pasted text into study notes and flashcards. Works offline, and Gemini writes them if you add a key.
- **Resume**: keyword, tool and quantification gaps for a target role, the weak bullets in your own resume, and a four-week plan.
- **Careers**: six finance paths, with pay, skills, the interview format and what each firm calls the role.

## Privacy

Everything runs in the browser. PDFs are parsed locally with pdf.js. The optional Gemini key is stored in `localStorage` and sent only to Google's API.

## Run locally

```bash
python3 -m http.server 8788 -d public
```

Then open http://localhost:8788.

## Deploy

```bash
npx wrangler pages deploy public --project-name finprep-pro
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
legacy-streamlit/  the original Streamlit app, kept for reference
```
