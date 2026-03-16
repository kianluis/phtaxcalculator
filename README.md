# PH Tax Calculator

A free, browser-based tax calculator for Filipino freelancers and virtual assistants. Compare the **8% Flat Rate** vs the **Graduated Rate** side by side, view your quarterly payment schedule, and estimate late filing penalties — all without sending any data to a server.

## Features

- **Rate comparison** — calculates both BIR-approved options (8% flat and graduated with 40% OSD) so you can see which saves you more
- **Quarterly payment schedule** — breaks down what you owe each quarter (Q1–Q3 via 1701Q, Annual via 1701) with filing deadlines and status indicators
- **Late filing penalty estimator** — computes the 25% surcharge, 12% annual interest, and compromise penalty for any past-due period
- **Tax guide** — explains the two rate options, who qualifies, how OSD works, and what forms to file
- **Privacy-first** — all calculations run locally in the browser; nothing is stored or transmitted

## Project Structure

```
index.html   — markup and content
style.css    — all styling and animations
app.js       — tax logic, DOM interactions, and UI animations
favicon.svg  — site icon
vercel.json  — deployment config (clean URLs, security headers, cache rules)
```

## Tax Logic

### 8% Flat Rate
```
Annual tax = (Gross annual income − ₱250,000) × 8%
```
Applies only if annual gross receipts do not exceed ₱3,000,000. No expense tracking required.

### Graduated Rate (with 40% OSD)
```
Net taxable income = Gross annual income × 60%
Annual tax = graduated bracket applied to net taxable income
```
The 40% Optional Standard Deduction (OSD) reduces taxable income without requiring receipts.

### Quarterly payments
Both methods use cumulative quarterly filing — each payment is the tax on cumulative income to date minus what was already paid in prior quarters.

### Late penalties (BIR)
| Component | Rate |
|---|---|
| Surcharge | 25% of basic tax |
| Interest | 12% per annum (prorated by days late) |
| Compromise penalty | ₱200 – ₱50,000 (based on tax due bracket) |

## Development

No build step — plain HTML, CSS, and JavaScript.

```bash
# Serve locally (any static server works)
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:8080` in your browser.

## Deployment

Deployed via [Vercel](https://vercel.com). Push to the main branch to trigger a deploy. The `vercel.json` config enables clean URLs, sets security headers, and applies a 1-hour cache on static assets.

## Disclaimer

This calculator is for **estimation purposes only** and is not a substitute for professional tax advice. Tax rules change — always verify with a BIR-accredited tax professional or the [official BIR website](https://www.bir.gov.ph) before filing.
