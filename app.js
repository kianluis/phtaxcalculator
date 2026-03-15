/* ═══════════════════════════════════════════════════════════
   PH Freelancer Tax Calculator — App Logic
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ─── CONSTANTS ──────────────────────────────────────────── */

const GRADUATED_BRACKETS = [
  { min: 0,         max: 250_000,    base: 0,         rate: 0.00 },
  { min: 250_001,   max: 400_000,    base: 0,         rate: 0.15 },
  { min: 400_001,   max: 800_000,    base: 22_500,    rate: 0.20 },
  { min: 800_001,   max: 2_000_000,  base: 102_500,   rate: 0.25 },
  { min: 2_000_001, max: 8_000_000,  base: 402_500,   rate: 0.30 },
  { min: 8_000_001, max: Infinity,   base: 2_202_500, rate: 0.35 },
];

const OSD_RATE       = 0.40;
const FLAT_RATE      = 0.08;
const FLAT_EXEMPTION = 250_000;

const COMPROMISE_SCHEDULE = [
  { maxTax: 1_000,     penalty: 200 },
  { maxTax: 5_000,     penalty: 500 },
  { maxTax: 20_000,    penalty: 1_000 },
  { maxTax: 50_000,    penalty: 2_000 },
  { maxTax: 100_000,   penalty: 5_000 },
  { maxTax: 500_000,   penalty: 10_000 },
  { maxTax: 1_000_000, penalty: 20_000 },
  { maxTax: Infinity,  penalty: 50_000 },
];

/* ─── TAX CALCULATIONS ───────────────────────────────────── */

function computeGraduatedTax(netTaxable) {
  if (netTaxable <= 0) return 0;
  for (const b of GRADUATED_BRACKETS) {
    if (netTaxable <= b.max) {
      return b.base + Math.max(0, netTaxable - b.min + 1) * b.rate;
    }
  }
  return 0;
}

function compute8pctTax(annualIncome) {
  return Math.max(0, annualIncome - FLAT_EXEMPTION) * FLAT_RATE;
}

function build8pctQuarterly(monthly) {
  let prevTax = 0;
  return [3, 6, 9, 12].map((months, i) => {
    const cumIncome = monthly * months;
    const cumTax = compute8pctTax(cumIncome);
    const payment = Math.max(0, cumTax - prevTax);
    prevTax = cumTax;
    return { months, cumIncome, cumTax, payment };
  });
}

function buildGradQuarterly(monthly) {
  let prevTax = 0;
  return [3, 6, 9, 12].map((months) => {
    const cumGross = monthly * months;
    const netTaxable = cumGross * (1 - OSD_RATE);
    const cumTax = computeGraduatedTax(netTaxable);
    const payment = Math.max(0, cumTax - prevTax);
    prevTax = cumTax;
    return { months, cumGross, netTaxable, cumTax, payment };
  });
}

function effectiveRate(tax, income) {
  return income > 0 ? (tax / income) * 100 : 0;
}

function computeLateFees(basicTax, daysLate) {
  if (daysLate <= 0 || basicTax <= 0) return { surcharge: 0, interest: 0, compromise: 0, total: basicTax };
  const surcharge  = basicTax * 0.25;
  const interest   = basicTax * 0.12 * (daysLate / 365);
  const compromise = getCompromisePenalty(basicTax);
  return {
    surcharge:  Math.round(surcharge  * 100) / 100,
    interest:   Math.round(interest   * 100) / 100,
    compromise,
    total: Math.round((basicTax + surcharge + interest + compromise) * 100) / 100,
  };
}

function getCompromisePenalty(taxDue) {
  for (const t of COMPROMISE_SCHEDULE) {
    if (taxDue <= t.maxTax) return t.penalty;
  }
  return 50_000;
}

/* ─── FORMATTING ─────────────────────────────────────────── */

function fmt(amount) {
  if (!amount && amount !== 0) return '₱0';
  return '₱' + Math.round(amount).toLocaleString('en-PH');
}

function formatNumberInput(raw) {
  const digits = raw.replace(/[^0-9]/g, '');
  return digits ? Number(digits).toLocaleString('en-PH') : '';
}

function parseInput(str) {
  return parseFloat(str.replace(/,/g, '')) || 0;
}

function formatDate(date) {
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

/* ─── ANIMATED COUNTER ───────────────────────────────────── */

function animateCounter(el, target, duration = 600) {
  const start = performance.now();
  const step  = (ts) => {
    const p = Math.min((ts - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = '₱' + Math.round(target * eased).toLocaleString('en-PH');
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ─── SCHEDULE HELPERS ───────────────────────────────────── */

function deadlineDate(year, quarter) {
  return {
    1: new Date(year, 4, 15),
    2: new Date(year, 7, 15),
    3: new Date(year, 10, 15),
    4: new Date(year + 1, 3, 15),
  }[quarter];
}

function statusOf(deadline) {
  const now  = new Date(); now.setHours(0,0,0,0);
  const d    = new Date(deadline); d.setHours(0,0,0,0);
  const days = Math.ceil((d - now) / 86400000);
  if (days < 0)    return { label: `${Math.abs(days)}d overdue`, cls: 'status-overdue' };
  if (days <= 30)  return { label: `Due in ${days}d`,            cls: 'status-upcoming' };
  return               { label: 'Upcoming',                      cls: 'status-future' };
}

function generateLatePeriods() {
  const today = new Date();
  const out   = [];
  for (let y = today.getFullYear() - 2; y <= today.getFullYear(); y++) {
    for (let q = 1; q <= 4; q++) {
      const dl = deadlineDate(y, q);
      if (dl < today) {
        const qLabel = { 1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Annual' }[q];
        const pLabel = { 1: `Jan–Mar ${y}`, 2: `Apr–Jun ${y}`, 3: `Jul–Sep ${y}`, 4: `Full Year ${y}` }[q];
        out.push({
          value: `${y}-Q${q}`,
          label: `${qLabel} ${y} — ${pLabel} (BIR ${q === 4 ? '1701' : '1701Q'})`,
          deadline: dl, year: y, quarter: q, periodLabel: pLabel,
        });
      }
    }
  }
  return out.reverse();
}

/* ─── DOM REFS ───────────────────────────────────────────── */

const $ = id => document.getElementById(id);

const incomeInput     = $('incomeInput');
const currencySign    = $('currencySign');
const incomeHint      = $('incomeHint');
const calculateBtn    = $('calculateBtn');
const resultsSection  = $('results-section');
const lateFeesSection = $('late-fees-section');

const summaryAnnual   = $('summaryAnnual');
const summaryTax8     = $('summaryTax8');
const summaryTaxGrad  = $('summaryTaxGrad');
const summarySave     = $('summarySave');

const tax8Annual      = $('tax8Annual');
const tax8Monthly     = $('tax8Monthly');
const taxGradAnnual   = $('taxGradAnnual');
const taxGradMonthly  = $('taxGradMonthly');
const formula8        = $('formula8');
const formulaGrad     = $('formulaGrad');
const timeline8       = $('timeline8');
const timelineGrad    = $('timelineGrad');
const tag8            = $('tag8');
const tagGrad         = $('tagGrad');
const card8           = $('card8');
const cardGrad        = $('cardGrad');

const recTitle        = $('recTitle');
const recDetail       = $('recDetail');

const taxYearLabel    = $('taxYearLabel');
const quarterlyBody   = $('quarterlyTableBody');

const latePeriodSel   = $('latePeriodSelect');
const customTaxGroup  = $('customTaxGroup');
const customTaxInput  = $('customTaxInput');
const latePeriodInfo  = $('latePeriodInfo');
const lateResult      = $('lateFeesResult');
const infoPeriod      = $('infoPeriod');
const infoDeadline    = $('infoDeadline');
const infoDaysLate    = $('infoDaysLate');
const feeBasicTax     = $('feeBasicTax');
const feeSurcharge    = $('feeSurcharge');
const feeInterest     = $('feeInterest');
const feeInterestDays = $('feeInterestDays');
const feeCompromise   = $('feeCompromise');
const feeTotal        = $('feeTotal');

/* ─── STATE ──────────────────────────────────────────────── */

let currentMonthly    = 0;
let current8pctAnnual = 0;
let currentGradAnnual = 0;
let hasCalculated     = false;

/* ─── TAB SWITCHING ──────────────────────────────────────── */

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
      b.setAttribute('aria-selected', b.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-panel').forEach(p => {
      const isActive = p.id === `panel-${tab}`;
      p.classList.toggle('hidden', !isActive);
      if (isActive) {
        p.style.animation = 'none';
        p.offsetHeight; // force reflow
        p.style.animation = 'fadeIn 0.25s ease both';
      }
    });
    if (tab === 'guide') initTocHighlight();
  });
});

// Inline "Calculator tab" link inside the guide
document.querySelectorAll('.inline-tab-link').forEach(btn => {
  btn.addEventListener('click', () => {
    const calcBtn = document.querySelector('.tab-btn[data-tab="calculator"]');
    if (calcBtn) calcBtn.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

/* ─── INCOME INPUT ───────────────────────────────────────── */

incomeInput.addEventListener('input', e => {
  const formatted = formatNumberInput(e.target.value);
  e.target.value  = formatted;
  currentMonthly  = parseInput(formatted);

  if (currentMonthly > 0) {
    currencySign.classList.add('active');
    calculateBtn.disabled = false;
    incomeHint.textContent = `Annual income: ${fmt(currentMonthly * 12)}`;
  } else {
    currencySign.classList.remove('active');
    calculateBtn.disabled = true;
    incomeHint.textContent = 'Enter your average gross monthly earnings';
  }
});

incomeInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !calculateBtn.disabled) handleCalculate();
});

/* ─── QUICK PICKS ────────────────────────────────────────── */

document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const amount = parseInt(btn.dataset.amount, 10);
    incomeInput.value = amount.toLocaleString('en-PH');
    currentMonthly    = amount;
    currencySign.classList.add('active');
    calculateBtn.disabled = false;
    incomeHint.textContent = `Annual income: ${fmt(amount * 12)}`;
    document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    setTimeout(handleCalculate, 120);
  });
});

/* ─── CALCULATE ──────────────────────────────────────────── */

calculateBtn.addEventListener('click', handleCalculate);

calculateBtn.addEventListener('click', e => {
  if (calculateBtn.disabled) return;
  const ripple = document.createElement('span');
  ripple.className = 'btn-ripple';
  const rect = calculateBtn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
  calculateBtn.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
});

function handleCalculate() {
  if (currentMonthly <= 0) return;

  const monthly = currentMonthly;
  const annual  = monthly * 12;

  const tax8    = compute8pctTax(annual);
  const netGrad = annual * (1 - OSD_RATE);
  const taxGrad = computeGraduatedTax(netGrad);

  current8pctAnnual = tax8;
  currentGradAnnual = taxGrad;

  const better  = tax8 <= taxGrad ? '8pct' : 'grad';
  const savings = Math.abs(tax8 - taxGrad);

  const q8    = build8pctQuarterly(monthly);
  const qGrad = buildGradQuarterly(monthly);

  // Summary stats
  summaryAnnual.textContent = fmt(annual);
  animateCounter(summaryTax8,    tax8);
  animateCounter(summaryTaxGrad, taxGrad);
  summarySave.textContent = better === '8pct' ? '8% Flat Rate' : 'Graduated Rate';

  renderCard8(monthly, annual, tax8, q8);
  renderCardGrad(monthly, annual, netGrad, taxGrad, qGrad);
  renderRecommendation(better, savings, annual, tax8, taxGrad);

  card8.classList.toggle('recommended',    better === '8pct');
  cardGrad.classList.toggle('recommended', better === 'grad');
  tag8.classList.toggle('hidden',    better !== '8pct');
  tagGrad.classList.toggle('hidden', better !== 'grad');

  const year = new Date().getFullYear();
  taxYearLabel.textContent = `${year} — ₱${monthly.toLocaleString('en-PH')}/mo`;

  renderQuarterlyTable(q8, qGrad);
  populateLateFeePeriods(q8, qGrad);

  if (!hasCalculated) {
    hasCalculated = true;
    resultsSection.classList.remove('hidden');
    lateFeesSection.classList.remove('hidden');
    document.querySelectorAll('#statsRow .stat').forEach((el, i) => {
      el.style.animation = `statIn 0.35s ease ${0.05 + i * 0.07}s both`;
    });
    document.querySelectorAll('.rate-card').forEach((el, i) => {
      el.style.animation = `cardIn 0.38s ease ${0.18 + i * 0.09}s both`;
    });
    setTimeout(() => resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }
}

/* ─── CARD — 8% ──────────────────────────────────────────── */

function renderCard8(monthly, annual, tax, quarters) {
  animateCounter(tax8Annual, tax);
  tax8Monthly.textContent = fmt(tax / 12) + ' / month';

  const taxable = Math.max(0, annual - FLAT_EXEMPTION);
  formula8.innerHTML = fRow('Gross annual income', fmt(annual))
    + fRow('Less: exemption', '−' + fmt(FLAT_EXEMPTION))
    + fRow('Taxable amount', fmt(taxable))
    + fRow('Rate', '× 8%')
    + fRow('Annual tax due', fmt(tax), true);

  const labels    = ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Annual ITR'];
  const deadlines = ['May 15', 'Aug 15', 'Nov 15', 'Apr 15 (next yr)'];
  timeline8.innerHTML = quarters.map((q, i) => schedRow(labels[i], deadlines[i], q.payment)).join('');
}

/* ─── CARD — GRADUATED ───────────────────────────────────── */

function renderCardGrad(monthly, annual, netTaxable, tax, quarters) {
  animateCounter(taxGradAnnual, tax);
  taxGradMonthly.textContent = fmt(tax / 12) + ' / month';

  const osd = annual * OSD_RATE;
  formulaGrad.innerHTML = fRow('Gross annual income', fmt(annual))
    + fRow('Less: 40% OSD', '−' + fmt(osd))
    + fRow('Net taxable income', fmt(netTaxable))
    + fRow('Tax bracket', bracketLabel(netTaxable))
    + fRow('Annual tax due', fmt(tax), true);

  const labels    = ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Annual ITR'];
  const deadlines = ['May 15', 'Aug 15', 'Nov 15', 'Apr 15 (next yr)'];
  timelineGrad.innerHTML = quarters.map((q, i) => schedRow(labels[i], deadlines[i], q.payment)).join('');
}

function fRow(label, value, isTotal = false) {
  return `<div class="formula-line${isTotal ? ' f-total' : ''}"><span>${label}</span><strong>${value}</strong></div>`;
}

function schedRow(period, deadline, payment) {
  const isZero = payment === 0;
  return `<div class="sched-row">
    <span class="sched-period">${period}</span>
    <span class="sched-deadline">${deadline}</span>
    <span class="sched-amount ${isZero ? 'sched-zero' : ''}">${isZero ? '—' : fmt(payment)}</span>
  </div>`;
}

function bracketLabel(netTaxable) {
  for (const b of GRADUATED_BRACKETS) {
    if (netTaxable <= b.max) {
      return b.rate === 0 ? '0% (exempt)' : `${(b.rate * 100).toFixed(0)}% bracket`;
    }
  }
  return '35% bracket';
}

/* ─── RECOMMENDATION ─────────────────────────────────────── */

function renderRecommendation(better, savings, annual, tax8, taxGrad) {
  if (savings === 0) {
    recTitle.textContent  = 'Both rates produce the same tax for your income.';
    recDetail.textContent = 'Either option works. The 8% rate is simpler — no OSD tracking required.';
    return;
  }
  const eff8  = effectiveRate(tax8,   annual).toFixed(1);
  const effG  = effectiveRate(taxGrad, annual).toFixed(1);
  if (better === '8pct') {
    recTitle.textContent  = `The 8% Flat Rate saves you ${fmt(savings)} this year.`;
    recDetail.textContent = `Your effective rate under 8% is ${eff8}% vs ${effG}% under graduated. Even with the 40% OSD, your net taxable income falls into a bracket that makes the flat rate cheaper — and it's one less form to file.`;
  } else {
    recTitle.textContent  = `The Graduated Rate saves you ${fmt(savings)} this year.`;
    recDetail.textContent = `Your effective rate under graduated is ${effG}% vs ${eff8}% flat. The 40% OSD reduces your taxable income enough that the graduated brackets come out cheaper at your income level.`;
  }
}

/* ─── QUARTERLY TABLE ────────────────────────────────────── */

function renderQuarterlyTable(q8, qGrad) {
  const year = new Date().getFullYear();
  const rows = [
    { label: 'Q1 (Jan–Mar)',      q: 1, i: 0 },
    { label: 'Q2 (Apr–Jun)',      q: 2, i: 1 },
    { label: 'Q3 (Jul–Sep)',      q: 3, i: 2 },
    { label: `Annual ${year}`,    q: 4, i: 3 },
  ];
  quarterlyBody.innerHTML = rows.map(r => {
    const dl  = deadlineDate(year, r.q);
    const st  = statusOf(dl);
    const p8  = q8[r.i].payment;
    const pG  = qGrad[r.i].payment;
    return `<tr>
      <td><strong>${r.label}</strong></td>
      <td>${formatDate(dl)}</td>
      <td><span class="status-badge ${st.cls}">${st.label}</span></td>
      <td>${p8 === 0 ? '—' : fmt(p8)}</td>
      <td>${pG === 0 ? '—' : fmt(pG)}</td>
    </tr>`;
  }).join('');
}

/* ─── LATE FEES ──────────────────────────────────────────── */

function populateLateFeePeriods(q8, qGrad) {
  const periods = generateLatePeriods();
  latePeriodSel.innerHTML = '<option value="">— Select a period —</option>';
  periods.forEach(p => {
    const o = document.createElement('option');
    o.value = p.value;
    o.textContent = p.label;
    latePeriodSel.appendChild(o);
  });
  latePeriodSel._periods = periods;
  latePeriodSel._q8      = q8;
  latePeriodSel._qGrad   = qGrad;
}

latePeriodSel.addEventListener('change', () => {
  const val = latePeriodSel.value;
  if (!val) {
    customTaxGroup.classList.add('hidden');
    latePeriodInfo.classList.add('hidden');
    lateResult.classList.add('hidden');
    return;
  }
  const period = latePeriodSel._periods.find(p => p.value === val);
  if (!period) return;

  const today    = new Date(); today.setHours(0,0,0,0);
  const dl       = new Date(period.deadline); dl.setHours(0,0,0,0);
  const daysLate = Math.max(0, Math.floor((today - dl) / 86400000));

  const qi  = period.quarter - 1;
  const q8  = latePeriodSel._q8;
  const qG  = latePeriodSel._qGrad;
  const use8 = current8pctAnnual <= currentGradAnnual;
  const prefill = (use8 ? q8[qi]?.payment : qG[qi]?.payment) || 0;

  customTaxInput.value = prefill > 0 ? Math.round(prefill).toLocaleString('en-PH') : '';
  customTaxGroup.classList.remove('hidden');

  infoPeriod.textContent   = period.periodLabel;
  infoDeadline.textContent = formatDate(period.deadline);
  infoDaysLate.textContent = daysLate + ' days';
  latePeriodInfo.classList.remove('hidden');

  if (prefill > 0) {
    renderLateFees(prefill, daysLate);
    lateResult.classList.remove('hidden');
  }
});

customTaxInput.addEventListener('input', e => {
  const formatted = formatNumberInput(e.target.value);
  e.target.value  = formatted;
  const val = latePeriodSel.value;
  if (!val) return;
  const period = latePeriodSel._periods.find(p => p.value === val);
  if (!period) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const dl    = new Date(period.deadline); dl.setHours(0,0,0,0);
  const days  = Math.max(0, Math.floor((today - dl) / 86400000));
  const tax   = parseInput(formatted);
  if (tax > 0) { renderLateFees(tax, days); lateResult.classList.remove('hidden'); }
  else           lateResult.classList.add('hidden');
});

function renderLateFees(basicTax, daysLate) {
  const f = computeLateFees(basicTax, daysLate);
  feeBasicTax.textContent     = fmt(basicTax);
  feeSurcharge.textContent    = fmt(f.surcharge);
  feeInterest.textContent     = fmt(f.interest);
  feeInterestDays.textContent = `${daysLate} days × 12% ÷ 365`;
  feeCompromise.textContent   = fmt(f.compromise);
  animateCounter(feeTotal, f.total);
}

/* ─── RESET ──────────────────────────────────────────────── */

document.querySelector('.js-reset').addEventListener('click', e => {
  e.preventDefault();
  incomeInput.value     = '';
  currentMonthly        = 0;
  hasCalculated         = false;
  calculateBtn.disabled = true;
  currencySign.classList.remove('active');
  incomeHint.textContent = 'Enter your average gross monthly earnings';
  document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('selected'));
  resultsSection.classList.add('hidden');
  lateFeesSection.classList.add('hidden');
  document.querySelectorAll('#statsRow .stat').forEach(el => { el.style.animation = ''; });
  document.querySelectorAll('.rate-card').forEach(el => { el.style.animation = ''; });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => incomeInput.focus(), 400);
});

/* ─── TOC HIGHLIGHT (GUIDE) ──────────────────────────────── */

function initTocHighlight() {
  const sections = document.querySelectorAll('.guide-section');
  const links    = document.querySelectorAll('.toc-link');
  if (!sections.length || !links.length) return;

  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        links.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.toc-link[href="#${entry.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });

  sections.forEach(s => obs.observe(s));
}

/* ─── FOOTER YEAR ────────────────────────────────────────── */

document.getElementById('footerYear').textContent = new Date().getFullYear();

/* ─── INIT ───────────────────────────────────────────────── */

window.addEventListener('load', () => incomeInput.focus());
