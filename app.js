/* ═══════════════════════════════════════════════════════════
   PH Freelancer Tax Calculator — App Logic
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ─── CONSTANTS ──────────────────────────────────────────── */

// 2024 graduated income tax brackets (TRAIN Law, RA 10963)
const GRADUATED_BRACKETS = [
  { min: 0,         max: 250_000,    base: 0,         rate: 0.00 },
  { min: 250_001,   max: 400_000,    base: 0,         rate: 0.15 },
  { min: 400_001,   max: 800_000,    base: 22_500,    rate: 0.20 },
  { min: 800_001,   max: 2_000_000,  base: 102_500,   rate: 0.25 },
  { min: 2_000_001, max: 8_000_000,  base: 402_500,   rate: 0.30 },
  { min: 8_000_001, max: Infinity,   base: 2_202_500, rate: 0.35 },
];

// OSD rate for graduated computation
const OSD_RATE       = 0.40;   // 40% Optional Standard Deduction
const FLAT_RATE      = 0.08;   // 8% flat income tax
const FLAT_EXEMPTION = 250_000; // first ₱250k exempt under 8% rate

// BIR quarterly deadlines (month is 0-indexed)
// Format: { label, periodLabel, year, month, day }
const QUARTERLY_DEADLINES = [
  { quarter: 'Q1', period: 'January – March', deadlineMonth: 4, deadlineDay: 15 },
  { quarter: 'Q2', period: 'January – June',  deadlineMonth: 7, deadlineDay: 15 },
  { quarter: 'Q3', period: 'January – September', deadlineMonth: 10, deadlineDay: 15 },
  { quarter: 'Annual ITR', period: 'Full Year', deadlineMonth: 3, deadlineDay: 15, isAnnual: true },
];

// BIR Compromise penalty schedule (based on basic tax due)
const COMPROMISE_SCHEDULE = [
  { maxTax: 1_000,    penalty: 200 },
  { maxTax: 5_000,    penalty: 500 },
  { maxTax: 20_000,   penalty: 1_000 },
  { maxTax: 50_000,   penalty: 2_000 },
  { maxTax: 100_000,  penalty: 5_000 },
  { maxTax: 500_000,  penalty: 10_000 },
  { maxTax: 1_000_000,penalty: 20_000 },
  { maxTax: Infinity, penalty: 50_000 },
];

/* ─── TAX CALCULATIONS ───────────────────────────────────── */

/**
 * Compute graduated income tax for a given net taxable income.
 */
function computeGraduatedTax(netTaxableIncome) {
  if (netTaxableIncome <= 0) return 0;
  for (const bracket of GRADUATED_BRACKETS) {
    if (netTaxableIncome <= bracket.max) {
      const excess = Math.max(0, netTaxableIncome - bracket.min + 1);
      return bracket.base + excess * bracket.rate;
    }
  }
  return 0;
}

/**
 * Compute 8% flat rate tax for an annual income.
 * First ₱250,000 is exempt.
 */
function compute8pctTax(annualIncome) {
  const taxableAmount = Math.max(0, annualIncome - FLAT_EXEMPTION);
  return taxableAmount * FLAT_RATE;
}

/**
 * Build full quarterly breakdown for 8% rate.
 * Uses the cumulative method: each quarter pays the difference
 * from prior cumulative payments.
 */
function build8pctQuarterly(monthlyIncome) {
  const quarterMonths = [3, 6, 9, 12];
  let previousCumTax = 0;
  const quarters = [];

  quarterMonths.forEach((months, i) => {
    const cumIncome = monthlyIncome * months;
    const cumTax = compute8pctTax(cumIncome);
    const payment = Math.max(0, cumTax - previousCumTax);
    previousCumTax = cumTax;
    quarters.push({
      months,
      cumIncome,
      cumTax,
      payment,
      isAnnual: i === 3,
    });
  });

  return quarters;
}

/**
 * Build full quarterly breakdown for graduated rate with 40% OSD.
 * Net taxable = cumulative gross × 60%.
 */
function buildGradQuarterly(monthlyIncome) {
  const quarterMonths = [3, 6, 9, 12];
  let previousCumTax = 0;
  const quarters = [];

  quarterMonths.forEach((months, i) => {
    const cumGross = monthlyIncome * months;
    const netTaxable = cumGross * (1 - OSD_RATE);
    const cumTax = computeGraduatedTax(netTaxable);
    const payment = Math.max(0, cumTax - previousCumTax);
    previousCumTax = cumTax;
    quarters.push({
      months,
      cumGross,
      netTaxable,
      cumTax,
      payment,
      isAnnual: i === 3,
    });
  });

  return quarters;
}

/**
 * Get effective tax rate as a percentage.
 */
function effectiveRate(tax, income) {
  if (income <= 0) return 0;
  return (tax / income) * 100;
}

/**
 * Compute BIR late fee components.
 */
function computeLateFees(basicTax, daysLate) {
  if (daysLate <= 0 || basicTax <= 0) return { surcharge: 0, interest: 0, compromise: 0, total: basicTax };

  const surcharge = basicTax * 0.25;
  const interest  = basicTax * 0.12 * (daysLate / 365);
  const compromise = getCompromisePenalty(basicTax);

  return {
    surcharge:  Math.round(surcharge  * 100) / 100,
    interest:   Math.round(interest   * 100) / 100,
    compromise,
    total: Math.round((basicTax + surcharge + interest + compromise) * 100) / 100,
  };
}

function getCompromisePenalty(taxDue) {
  for (const tier of COMPROMISE_SCHEDULE) {
    if (taxDue <= tier.maxTax) return tier.penalty;
  }
  return 50_000;
}

/* ─── FORMATTING ─────────────────────────────────────────── */

function formatCurrency(amount, compact = false) {
  if (amount === null || amount === undefined) return '₱0';
  const rounded = Math.round(amount);
  if (compact && rounded >= 1_000_000) {
    return '₱' + (rounded / 1_000_000).toFixed(2) + 'M';
  }
  if (compact && rounded >= 1_000) {
    return '₱' + (rounded / 1_000).toFixed(1) + 'k';
  }
  return '₱' + rounded.toLocaleString('en-PH');
}

function formatNumberInput(raw) {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('en-PH');
}

function parseInputValue(formatted) {
  return parseFloat(formatted.replace(/,/g, '')) || 0;
}

function formatDate(date) {
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

/* ─── ANIMATED COUNTER ───────────────────────────────────── */

function animateCounter(el, targetValue, duration = 800) {
  const start = performance.now();
  const startValue = 0;

  function step(timestamp) {
    const progress = Math.min((timestamp - start) / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startValue + (targetValue - startValue) * eased);
    el.textContent = '₱' + current.toLocaleString('en-PH');
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/* ─── QUARTERLY SCHEDULE HELPERS ─────────────────────────── */

function getDeadlineDate(year, quarter) {
  // quarter: 1=Q1, 2=Q2, 3=Q3, 4=Annual
  const dates = {
    1: new Date(year, 4, 15),   // May 15  (month index 4)
    2: new Date(year, 7, 15),   // Aug 15
    3: new Date(year, 10, 15),  // Nov 15
    4: new Date(year + 1, 3, 15), // Apr 15 next year (annual)
  };
  return dates[quarter];
}

function getStatus(deadline) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deadline);
  d.setHours(0, 0, 0, 0);
  const diffMs = d - today;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, cls: 'status-overdue' };
  if (diffDays <= 30) return { label: `Due in ${diffDays}d`, cls: 'status-upcoming' };
  return { label: 'Upcoming', cls: 'status-future' };
}

/* ─── LATE PERIOD GENERATOR ──────────────────────────────── */

function generateLatePeriods() {
  const today = new Date();
  const periods = [];

  // Go back 3 years
  for (let y = today.getFullYear() - 2; y <= today.getFullYear(); y++) {
    for (let q = 1; q <= 4; q++) {
      const deadline = getDeadlineDate(y, q);
      if (deadline < today) {
        const quarterLabels = { 1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Annual' };
        const periodLabels = {
          1: `Jan–Mar ${y}`,
          2: `Apr–Jun ${y}`,
          3: `Jul–Sep ${y}`,
          4: `Full Year ${y}`,
        };
        const formLabel = q === 4 ? '1701' : '1701Q';
        periods.push({
          value: `${y}-Q${q}`,
          label: `${quarterLabels[q]} ${y} (${periodLabels[q]}) — BIR ${formLabel}`,
          deadline,
          year: y,
          quarter: q,
          periodLabel: periodLabels[q],
        });
      }
    }
  }
  return periods.reverse(); // most recent first
}

/* ─── DOM REFS ───────────────────────────────────────────── */

const incomeInput        = document.getElementById('incomeInput');
const currencySign       = document.getElementById('currencySign');
const incomeHint         = document.getElementById('incomeHint');
const calculateBtn       = document.getElementById('calculateBtn');
const resultsSection     = document.getElementById('results-section');
const lateFeesSection    = document.getElementById('late-fees-section');
const footerEl           = document.getElementById('footer');
const scrollIndicator    = document.getElementById('scrollIndicator');
const navEl              = document.getElementById('nav');
const navResults         = document.getElementById('navResults');
const navLateFees        = document.getElementById('navLateFees');

// Summary bar
const summaryAnnual  = document.getElementById('summaryAnnual');
const summaryTax8    = document.getElementById('summaryTax8');
const summaryTaxGrad = document.getElementById('summaryTaxGrad');
const summarySave    = document.getElementById('summarySave');

// Rate cards
const tax8Annual     = document.getElementById('tax8Annual');
const tax8Monthly    = document.getElementById('tax8Monthly');
const taxGradAnnual  = document.getElementById('taxGradAnnual');
const taxGradMonthly = document.getElementById('taxGradMonthly');
const formula8       = document.getElementById('formula8');
const formulaGrad    = document.getElementById('formulaGrad');
const timeline8      = document.getElementById('timeline8');
const timelineGrad   = document.getElementById('timelineGrad');
const tag8           = document.getElementById('tag8');
const tagGrad        = document.getElementById('tagGrad');
const card8          = document.getElementById('card8');
const cardGrad       = document.getElementById('cardGrad');

// Recommendation
const recTitle  = document.getElementById('recTitle');
const recDetail = document.getElementById('recDetail');
const recBanner = document.getElementById('recommendationBanner');

// Quarterly table
const quarterlyTableBody = document.getElementById('quarterlyTableBody');
const taxYearLabel       = document.getElementById('taxYearLabel');

// Late fees
const latePeriodSelect = document.getElementById('latePeriodSelect');
const customTaxGroup   = document.getElementById('customTaxGroup');
const customTaxInput   = document.getElementById('customTaxInput');
const latePeriodInfo   = document.getElementById('latePeriodInfo');
const lateFeesResult   = document.getElementById('lateFeesResult');
const infoPeriod       = document.getElementById('infoPeriod');
const infoDeadline     = document.getElementById('infoDeadline');
const infoDaysLate     = document.getElementById('infoDaysLate');
const feeBasicTax      = document.getElementById('feeBasicTax');
const feeSurcharge     = document.getElementById('feeSurcharge');
const feeInterest      = document.getElementById('feeInterest');
const feeInterestDays  = document.getElementById('feeInterestDays');
const feeCompromise    = document.getElementById('feeCompromise');
const feeTotal         = document.getElementById('feeTotal');

// Modal
const modalOverlay = document.getElementById('modalOverlay');
const modalClose   = document.getElementById('modalClose');
const modalContent = document.getElementById('modalContent');

/* ─── STATE ──────────────────────────────────────────────── */

let currentMonthly = 0;
let current8pctAnnual  = 0;
let currentGradAnnual  = 0;
let selectedQuarterTax = { '8pct': {}, 'grad': {} };
let hasCalculated = false;

/* ─── INCOME INPUT HANDLING ──────────────────────────────── */

incomeInput.addEventListener('input', (e) => {
  const raw = e.target.value;
  const formatted = formatNumberInput(raw);
  e.target.value = formatted;

  const value = parseInputValue(formatted);
  currentMonthly = value;

  if (value > 0) {
    currencySign.classList.add('active');
    calculateBtn.disabled = false;
    incomeHint.textContent = `Annual income: ${formatCurrency(value * 12)}`;
  } else {
    currencySign.classList.remove('active');
    calculateBtn.disabled = true;
    incomeHint.textContent = 'Enter your average gross monthly earnings';
  }
});

incomeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !calculateBtn.disabled) {
    handleCalculate();
  }
});

/* ─── QUICK PICKS ────────────────────────────────────────── */

document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const amount = parseInt(btn.dataset.amount, 10);
    incomeInput.value = amount.toLocaleString('en-PH');
    currentMonthly = amount;
    currencySign.classList.add('active');
    calculateBtn.disabled = false;
    incomeHint.textContent = `Annual income: ${formatCurrency(amount * 12)}`;

    document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    // Auto-calculate with a tiny delay for visual feedback
    setTimeout(handleCalculate, 180);
  });
});

/* ─── CALCULATE ──────────────────────────────────────────── */

calculateBtn.addEventListener('click', handleCalculate);

function handleCalculate() {
  if (currentMonthly <= 0) return;

  const monthly  = currentMonthly;
  const annual   = monthly * 12;

  // ── Compute taxes ──
  const tax8     = compute8pctTax(annual);
  const netGrad  = annual * (1 - OSD_RATE);
  const taxGrad  = computeGraduatedTax(netGrad);

  current8pctAnnual = tax8;
  currentGradAnnual = taxGrad;

  const better = tax8 <= taxGrad ? '8pct' : 'grad';
  const savings = Math.abs(tax8 - taxGrad);

  // Build quarterly breakdowns
  const q8   = build8pctQuarterly(monthly);
  const qGrad = buildGradQuarterly(monthly);

  // ── Update Summary Bar ──
  summaryAnnual.textContent  = formatCurrency(annual);
  animateCounter(summaryTax8,    tax8);
  animateCounter(summaryTaxGrad, taxGrad);
  summarySave.textContent    = better === '8pct' ? '8% Rate' : 'Graduated';

  // ── Update rate cards ──
  renderCard8(monthly, annual, tax8, q8);
  renderCardGrad(monthly, annual, netGrad, taxGrad, qGrad);
  renderRecommendation(better, savings, annual, tax8, taxGrad);

  // ── Mark recommended ──
  card8.classList.toggle('recommended',    better === '8pct');
  cardGrad.classList.toggle('recommended', better === 'grad');
  tag8.textContent    = better === '8pct'  ? '✓ Lower tax' : '';
  tagGrad.textContent = better === 'grad'  ? '✓ Lower tax' : '';

  // ── Tax year label ──
  const taxYear = new Date().getFullYear();
  taxYearLabel.textContent = `Tax Year ${taxYear} · Monthly Income ${formatCurrency(monthly)}`;

  // ── Quarterly table ──
  renderQuarterlyTable(monthly, q8, qGrad);

  // ── Populate late fee periods ──
  populateLateFeePeriods(q8, qGrad);

  // ── Reveal sections ──
  if (!hasCalculated) {
    hasCalculated = true;
    revealResults();
  }

  scrollIndicator.classList.add('hidden');
}

/* ─── RENDER RATE CARD — 8% ──────────────────────────────── */

function renderCard8(monthly, annual, tax, quarters) {
  const taxableAmount = Math.max(0, annual - FLAT_EXEMPTION);

  animateCounter(tax8Annual, tax);
  tax8Monthly.textContent = formatCurrency(tax / 12) + '/mo';

  // Formula lines
  formula8.innerHTML = `
    <div class="formula-line"><span>Gross Annual Income</span><strong>${formatCurrency(annual)}</strong></div>
    <div class="formula-line"><span>Less: Exemption</span><strong>−${formatCurrency(FLAT_EXEMPTION)}</strong></div>
    <div class="formula-line"><span>Taxable Amount</span><strong>${formatCurrency(taxableAmount)}</strong></div>
    <div class="formula-line"><span>Rate</span><strong>× 8%</strong></div>
    <div class="formula-line total"><span>Annual Tax Due</span><strong>${formatCurrency(tax)}</strong></div>
  `;

  // Timeline
  const labels = ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Annual ITR'];
  const deadlines = ['May 15', 'Aug 15', 'Nov 15', 'Apr 15 (next yr)'];
  timeline8.innerHTML = `<p class="qt-title">Quarterly Payment Schedule</p>` +
    quarters.map((q, i) => `
      <div class="qt-row">
        <div class="qt-dot blue"></div>
        <span class="qt-period">${labels[i]}</span>
        <span class="qt-deadline">${deadlines[i]}</span>
        <span class="qt-amount ${q.payment === 0 ? 'qt-zero' : ''}">${q.payment === 0 ? 'No payment' : formatCurrency(q.payment)}</span>
      </div>
    `).join('');
}

/* ─── RENDER RATE CARD — GRADUATED ──────────────────────────*/

function renderCardGrad(monthly, annual, netTaxable, tax, quarters) {
  animateCounter(taxGradAnnual, tax);
  taxGradMonthly.textContent = formatCurrency(tax / 12) + '/mo';

  const osdAmount = annual * OSD_RATE;
  const effRate = effectiveRate(tax, annual).toFixed(2);
  const bracketDesc = getGraduatedBracketDescription(netTaxable);

  formulaGrad.innerHTML = `
    <div class="formula-line"><span>Gross Annual Income</span><strong>${formatCurrency(annual)}</strong></div>
    <div class="formula-line"><span>Less: 40% OSD</span><strong>−${formatCurrency(osdAmount)}</strong></div>
    <div class="formula-line"><span>Net Taxable Income</span><strong>${formatCurrency(netTaxable)}</strong></div>
    <div class="formula-line"><span>Tax Bracket</span><strong>${bracketDesc}</strong></div>
    <div class="formula-line total"><span>Annual Tax Due</span><strong>${formatCurrency(tax)}</strong></div>
  `;

  const labels = ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Annual ITR'];
  const deadlines = ['May 15', 'Aug 15', 'Nov 15', 'Apr 15 (next yr)'];
  timelineGrad.innerHTML = `<p class="qt-title">Quarterly Payment Schedule</p>` +
    quarters.map((q, i) => `
      <div class="qt-row">
        <div class="qt-dot purple"></div>
        <span class="qt-period">${labels[i]}</span>
        <span class="qt-deadline">${deadlines[i]}</span>
        <span class="qt-amount ${q.payment === 0 ? 'qt-zero' : ''}">${q.payment === 0 ? 'No payment' : formatCurrency(q.payment)}</span>
      </div>
    `).join('');
}

function getGraduatedBracketDescription(netTaxable) {
  for (const b of GRADUATED_BRACKETS) {
    if (netTaxable <= b.max) {
      if (b.rate === 0) return '0% (exempt)';
      const pct = (b.rate * 100).toFixed(0);
      return `${pct}% bracket`;
    }
  }
  return '35% bracket';
}

/* ─── RECOMMENDATION ─────────────────────────────────────── */

function renderRecommendation(better, savings, annual, tax8, taxGrad) {
  if (savings === 0) {
    recTitle.textContent = 'Both rates result in the same tax for you.';
    recDetail.textContent = 'You can choose either option. The 8% rate is simpler — no expense tracking required.';
    return;
  }

  const savingsFormatted = formatCurrency(savings);
  const effRate8  = effectiveRate(tax8,   annual).toFixed(1);
  const effGrad   = effectiveRate(taxGrad, annual).toFixed(1);

  if (better === '8pct') {
    recTitle.textContent  = `The 8% Flat Rate saves you ${savingsFormatted} this year.`;
    recDetail.textContent = `Your effective rate under 8% is ${effRate8}% vs ${effGrad}% under the graduated system. Since your net taxable income is pushed into a higher bracket even after the 40% OSD, the flat 8% wins — and it's simpler.`;
  } else {
    recTitle.textContent  = `The Graduated Rate saves you ${savingsFormatted} this year.`;
    recDetail.textContent = `Your effective rate under the graduated system is ${effGrad}% vs ${effRate8}% flat. With the 40% OSD reducing your taxable income to the lower brackets, graduated beats the flat 8% at your income level.`;
  }
}

/* ─── QUARTERLY TABLE ────────────────────────────────────── */

function renderQuarterlyTable(monthly, q8, qGrad) {
  const today    = new Date();
  const taxYear  = today.getFullYear();

  const rows = [
    { label: 'Q1 (Jan–Mar)',   quarter: 1, deadline: getDeadlineDate(taxYear, 1), idx: 0 },
    { label: 'Q2 (Apr–Jun)',   quarter: 2, deadline: getDeadlineDate(taxYear, 2), idx: 1 },
    { label: 'Q3 (Jul–Sep)',   quarter: 3, deadline: getDeadlineDate(taxYear, 3), idx: 2 },
    { label: `Annual ${taxYear}`, quarter: 4, deadline: getDeadlineDate(taxYear, 4), idx: 3 },
  ];

  quarterlyTableBody.innerHTML = rows.map(row => {
    const status = getStatus(row.deadline);
    const p8     = q8[row.idx].payment;
    const pGrad  = qGrad[row.idx].payment;
    return `
      <tr>
        <td><strong>${row.label}</strong></td>
        <td>${formatDate(row.deadline)}</td>
        <td><span class="status-badge ${status.cls}">${status.label}</span></td>
        <td class="col-blue">${p8 === 0 ? '—' : formatCurrency(p8)}</td>
        <td class="col-purple">${pGrad === 0 ? '—' : formatCurrency(pGrad)}</td>
      </tr>
    `;
  }).join('');
}

/* ─── LATE FEES SECTION ──────────────────────────────────── */

function populateLateFeePeriods(q8, qGrad) {
  const periods = generateLatePeriods();
  latePeriodSelect.innerHTML = '<option value="">— Select period —</option>';

  periods.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.value;
    opt.textContent = p.label;
    latePeriodSelect.appendChild(opt);
  });

  // Store periods on the select element for later access
  latePeriodSelect._periods = periods;
  latePeriodSelect._q8   = q8;
  latePeriodSelect._qGrad = qGrad;
}

latePeriodSelect.addEventListener('change', () => {
  const val = latePeriodSelect.value;
  if (!val) {
    customTaxGroup.style.display = 'none';
    latePeriodInfo.style.display = 'none';
    lateFeesResult.style.display = 'none';
    return;
  }

  const periods = latePeriodSelect._periods;
  const period  = periods.find(p => p.value === val);
  if (!period) return;

  const today    = new Date();
  today.setHours(0, 0, 0, 0);
  const dl = new Date(period.deadline);
  dl.setHours(0, 0, 0, 0);
  const daysLate = Math.max(0, Math.floor((today - dl) / (1000 * 60 * 60 * 24)));

  // Pre-fill tax from stored quarterly data
  const q8    = latePeriodSelect._q8;
  const qGrad = latePeriodSelect._qGrad;

  // Figure out which quarter index
  const qIndex  = period.quarter - 1; // 0-3
  const q = period.quarter;

  let prefillTax = 0;
  if (q8 && q8[qIndex]) {
    // Use whichever is lower (from the better rate), or 8% as default
    const better8    = current8pctAnnual <= currentGradAnnual;
    prefillTax = better8 ? (q8[qIndex]?.payment || 0) : (qGrad[qIndex]?.payment || 0);
  }

  customTaxInput.value = prefillTax > 0 ? Math.round(prefillTax).toLocaleString('en-PH') : '';
  customTaxGroup.style.display = 'block';

  // Period info
  infoPeriod.textContent   = period.periodLabel;
  infoDeadline.textContent = formatDate(period.deadline);
  infoDaysLate.textContent = daysLate + ' days';
  latePeriodInfo.style.display = 'block';

  // Compute and show fees if we have a tax value
  if (prefillTax > 0) {
    renderLateFees(prefillTax, daysLate);
    lateFeesResult.style.display = 'block';
  }
});

customTaxInput.addEventListener('input', (e) => {
  const formatted = formatNumberInput(e.target.value);
  e.target.value  = formatted;

  const val = latePeriodSelect.value;
  if (!val) return;

  const periods  = latePeriodSelect._periods;
  const period   = periods.find(p => p.value === val);
  if (!period) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dl = new Date(period.deadline);
  dl.setHours(0, 0, 0, 0);
  const daysLate = Math.max(0, Math.floor((today - dl) / (1000 * 60 * 60 * 24)));

  const taxValue = parseInputValue(formatted);
  if (taxValue > 0) {
    renderLateFees(taxValue, daysLate);
    lateFeesResult.style.display = 'block';
  } else {
    lateFeesResult.style.display = 'none';
  }
});

function renderLateFees(basicTax, daysLate) {
  const fees = computeLateFees(basicTax, daysLate);

  feeBasicTax.textContent     = formatCurrency(basicTax);
  feeSurcharge.textContent    = formatCurrency(fees.surcharge);
  feeInterest.textContent     = formatCurrency(fees.interest);
  feeInterestDays.textContent = `${daysLate} days × 12% ÷ 365`;
  feeCompromise.textContent   = formatCurrency(fees.compromise);

  // Animate the total
  const prevTotal = parseInputValue(feeTotal.textContent.replace('₱', ''));
  animateCounter(feeTotal, fees.total);
}

/* ─── REVEAL SECTIONS ────────────────────────────────────── */

function revealResults() {
  resultsSection.classList.remove('hidden');
  lateFeesSection.classList.remove('hidden');
  footerEl.classList.remove('hidden');

  navResults.classList.remove('hidden');
  navLateFees.classList.remove('hidden');

  // Smooth scroll to results
  setTimeout(() => {
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

/* ─── SCROLL EFFECTS ─────────────────────────────────────── */

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;

  // Sticky nav background
  navEl.classList.toggle('scrolled', scrollY > 60);

  // Hide scroll indicator
  if (scrollY > 100) {
    scrollIndicator.classList.add('hidden');
  }
}, { passive: true });

/* ─── SMOOTH SCROLL FOR NAV LINKS ────────────────────────── */

document.querySelectorAll('.js-scroll').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(link.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

/* ─── RESET ──────────────────────────────────────────────── */

document.querySelector('.js-reset').addEventListener('click', (e) => {
  e.preventDefault();
  incomeInput.value = '';
  currentMonthly    = 0;
  hasCalculated     = false;
  calculateBtn.disabled = true;
  currencySign.classList.remove('active');
  incomeHint.textContent = 'Enter your average gross monthly earnings';
  document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('selected'));

  resultsSection.classList.add('hidden');
  lateFeesSection.classList.add('hidden');
  footerEl.classList.add('hidden');
  navResults.classList.add('hidden');
  navLateFees.classList.add('hidden');
  scrollIndicator.classList.remove('hidden');

  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => incomeInput.focus(), 600);
});

/* ─── MODALS ─────────────────────────────────────────────── */

document.querySelectorAll('[data-modal]').forEach(btn => {
  btn.addEventListener('click', () => {
    const templateId = btn.dataset.modal;
    const tmpl = document.getElementById(templateId);
    if (!tmpl) return;
    modalContent.innerHTML = '';
    modalContent.appendChild(tmpl.content.cloneNode(true));
    modalOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  });
});

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

function closeModal() {
  modalOverlay.classList.add('hidden');
  document.body.style.overflow = '';
}

/* ─── FOOTER YEAR ────────────────────────────────────────── */

document.getElementById('footerYear').textContent = new Date().getFullYear();

/* ─── INIT ───────────────────────────────────────────────── */

// Focus income input on load
window.addEventListener('load', () => {
  incomeInput.focus();
});
