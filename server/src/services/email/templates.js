import env from '../../config/env.js';
import { escapeHtml as e } from '../../utils/crypto.js';
import { formatMoney } from '../../utils/money.js';

const BRAND = 'SpendWise';
const ACCENT = '#0f766e';
const INK = '#18181b';
const MUTED = '#71717a';

const appUrl = (path = '') => `${env.CLIENT_URL.replace(/\/$/, '')}${path}`;

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:${ACCENT};border-radius:8px">
  <a href="${e(href)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-weight:600;text-decoration:none;font-size:15px">${e(label)}</a>
  </td></tr></table>`;
}

function layout({ preheader, heading, body, footerNote }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${e(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${e(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e4e4e7">
<tr><td style="padding:22px 28px;border-bottom:1px solid #f0f0f1">
  <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${ACCENT};margin-right:8px"></span>
  <span style="font-weight:700;font-size:16px;letter-spacing:-0.2px">${BRAND}</span>
</td></tr>
<tr><td style="padding:28px">
  <h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;letter-spacing:-0.3px">${e(heading)}</h1>
  ${body}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #f0f0f1;color:${MUTED};font-size:12px;line-height:1.6">
  ${footerNote || ''}
  You can change which emails you get in <a href="${e(appUrl('/settings'))}" style="color:${MUTED}">Settings</a>.
</td></tr>
</table></td></tr></table></body></html>`;
}

const p = (html) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#3f3f46">${html}</p>`;

function progressBar(pct, color) {
  const w = Math.max(2, Math.min(100, Math.round(pct)));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:6px"><tr>
  <td width="${w}%" style="background:${color};height:10px;border-radius:6px;font-size:0;line-height:0">&nbsp;</td>${w < 100 ? '<td style="font-size:0;line-height:0">&nbsp;</td>' : ''}
  </tr></table>`;
}

export function verifyEmailTemplate({ name, token }) {
  const url = appUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  return {
    subject: `Verify your email for ${BRAND}`,
    html: layout({
      preheader: 'Confirm your email to start tracking expenses',
      heading: `Welcome, ${name}!`,
      body: `${p('Confirm your email address to activate your account. The link expires in 24 hours.')}${button(url, 'Verify email')}
      ${p(`<span style="font-size:13px;color:${MUTED}">Or paste this link into your browser:<br>${e(url)}</span>`)}`,
      footerNote: "If you didn't create an account, ignore this email. ",
    }),
    text: `Welcome to ${BRAND}, ${name}!\n\nVerify your email (expires in 24 hours):\n${url}\n\nIf you didn't create an account, ignore this email.`,
  };
}

export function resetPasswordTemplate({ name, token }) {
  const url = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  return {
    subject: `Reset your ${BRAND} password`,
    html: layout({
      preheader: 'Password reset requested',
      heading: 'Reset your password',
      body: `${p(`Hi ${e(name)}, we received a request to reset your password. This link expires in 30 minutes and can be used once.`)}${button(url, 'Choose a new password')}
      ${p(`<span style="font-size:13px;color:${MUTED}">If you didn't ask for this, you can safely ignore this email - your password won't change.</span>`)}`,
    }),
    text: `Hi ${name},\n\nReset your password (expires in 30 minutes):\n${url}\n\nIf you didn't ask for this, ignore this email.`,
  };
}

export function passwordChangedTemplate({ name }) {
  return {
    subject: `Your ${BRAND} password was changed`,
    html: layout({
      preheader: 'Security notice',
      heading: 'Your password was changed',
      body: `${p(`Hi ${e(name)}, the password for your account was just changed and all other devices were signed out.`)}
      ${p("If this wasn't you, reset your password immediately using “Forgot password” on the sign-in page.")}`,
    }),
    text: `Hi ${name},\n\nYour password was just changed and all other devices were signed out. If this wasn't you, reset your password immediately.`,
  };
}

export function budgetAlertTemplate({ name, category, level, spentMinor, limitMinor, currency, periodLabel }) {
  const over = level >= 100;
  const pct = Math.round((spentMinor / limitMinor) * 100);
  const label = category === 'Overall' ? 'overall monthly budget' : `${category} budget`;
  const subject = over
    ? `Budget exceeded: ${category} (${pct}%)`
    : `Heads up: ${pct}% of your ${category} budget used`;
  const color = over ? '#dc2626' : '#d97706';
  return {
    subject,
    html: layout({
      preheader: `${formatMoney(spentMinor, currency)} of ${formatMoney(limitMinor, currency)} spent`,
      heading: over ? `You've gone over your ${label}` : `You've used ${pct}% of your ${label}`, // layout() escapes
      body: `${p(`Hi ${e(name)}, here's where ${e(periodLabel)} stands:`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr>
        <td style="font-size:26px;font-weight:700;letter-spacing:-0.5px">${formatMoney(spentMinor, currency)}</td>
        <td align="right" style="color:${MUTED};font-size:14px">of ${formatMoney(limitMinor, currency)}</td></tr></table>
      ${progressBar(pct, color)}
      <p style="margin:8px 0 0;font-size:13px;color:${color};font-weight:600">${pct}% used${over ? ` · ${formatMoney(spentMinor - limitMinor, currency)} over` : ` · ${formatMoney(limitMinor - spentMinor, currency)} left`}</p>
      ${button(appUrl('/budgets'), 'Review budgets')}`,
    }),
    text: `Hi ${name},\n\n${subject}\nSpent ${formatMoney(spentMinor, currency)} of ${formatMoney(limitMinor, currency)} in ${periodLabel}.\n\nReview budgets: ${appUrl('/budgets')}`,
  };
}

export function largeExpenseTemplate({ name, expense, thresholdMinor, currency }) {
  const amount = formatMoney(expense.amountMinor, currency);
  const when = new Date(expense.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return {
    subject: `Large expense recorded: ${amount} at ${expense.merchant}`,
    html: layout({
      preheader: `${amount} · ${expense.category}`,
      heading: 'A large expense was added',
      body: `${p(`Hi ${e(name)}, an expense above your alert limit of ${formatMoney(thresholdMinor, currency)} was just recorded.`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:10px;margin:8px 0 4px">
        <tr><td style="padding:16px 18px">
          <div style="font-size:24px;font-weight:700;letter-spacing:-0.5px">${amount}</div>
          <div style="font-size:14px;color:#3f3f46;margin-top:4px">${e(expense.merchant)}</div>
          <div style="font-size:13px;color:${MUTED};margin-top:2px">${e(expense.category)} · ${e(expense.paymentMethod)} · ${e(when)}</div>
        </td></tr></table>
      ${p(`<span style="font-size:13px;color:${MUTED}">Didn't make this purchase? Check your bank account and change your password.</span>`)}
      ${button(appUrl('/expenses'), 'View expenses')}`,
    }),
    text: `Hi ${name},\n\nA large expense was recorded: ${amount} at ${expense.merchant} (${expense.category}, ${when}).\n\nView: ${appUrl('/expenses')}`,
  };
}

export function monthlySummaryTemplate({ name, report }) {
  const { currency, periodLabel, totals, byCategory, topExpenses, budgets, highlights } = report;
  const money = (m) => formatMoney(m, currency);
  const change = totals.changePct;
  const changeText =
    change === null
      ? 'No spending recorded the month before.'
      : `${Math.abs(change)}% ${change > 0 ? 'more' : 'less'} than the previous month (${money(totals.prevSpentMinor)}).`;
  const maxCat = Math.max(1, ...byCategory.map((c) => c.totalMinor));

  const catRows = byCategory
    .slice(0, 6)
    .map(
      (c) => `<tr><td style="padding:6px 0;font-size:14px;width:38%">${e(c.category)}</td>
      <td style="padding:6px 10px">${progressBar((c.totalMinor / maxCat) * 100, ACCENT)}</td>
      <td align="right" style="padding:6px 0;font-size:14px;font-weight:600;white-space:nowrap">${money(c.totalMinor)}</td></tr>`,
    )
    .join('');

  const topRows = topExpenses
    .map(
      (x) => `<tr><td style="padding:6px 0;font-size:14px;border-bottom:1px solid #f4f4f5">${e(x.merchant)}<br><span style="color:${MUTED};font-size:12px">${e(x.category)} · ${new Date(x.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></td>
      <td align="right" style="padding:6px 0;font-size:14px;font-weight:600;border-bottom:1px solid #f4f4f5">${money(x.amountMinor)}</td></tr>`,
    )
    .join('');

  const budgetRows = budgets
    .map((b) => {
      const pct = Math.round((b.spentMinor / b.limitMinor) * 100);
      const color = pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : ACCENT;
      return `<tr><td style="padding:6px 0;font-size:14px;width:38%">${e(b.category)}</td><td style="padding:6px 10px">${progressBar(pct, color)}</td>
      <td align="right" style="padding:6px 0;font-size:13px;color:${color};font-weight:600">${pct}%</td></tr>`;
    })
    .join('');

  const section = (title, inner) =>
    `<h2 style="margin:26px 0 8px;font-size:15px;font-weight:600;color:${INK}">${title}</h2>${inner}`;

  const html = layout({
    preheader: `You spent ${money(totals.spentMinor)} in ${periodLabel}`,
    heading: `Your ${periodLabel} summary`,
    body: `${p(`Hi ${e(name)}, here's how ${e(periodLabel)} went.`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafa;border-radius:12px;margin:6px 0"><tr><td style="padding:18px 20px">
      <div style="font-size:13px;color:${MUTED}">Total spent</div>
      <div style="font-size:30px;font-weight:700;letter-spacing:-0.6px;margin:2px 0">${money(totals.spentMinor)}</div>
      <div style="font-size:13px;color:#3f3f46">${totals.txCount} transactions · ${e(changeText)}</div>
    </td></tr></table>
    ${highlights.length ? section('Highlights', `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.7;color:#3f3f46">${highlights.map((h) => `<li>${e(h)}</li>`).join('')}</ul>`) : ''}
    ${byCategory.length ? section('Where it went', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${catRows}</table>`) : ''}
    ${budgets.length ? section('Budgets', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${budgetRows}</table>`) : ''}
    ${topExpenses.length ? section('Biggest expenses', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${topRows}</table>`) : ''}
    ${button(appUrl('/'), 'Open dashboard')}`,
  });

  const text = [
    `Hi ${name}, your ${periodLabel} summary`,
    `Total spent: ${money(totals.spentMinor)} (${totals.txCount} transactions). ${changeText}`,
    ...highlights.map((h) => `- ${h}`),
    '',
    'By category:',
    ...byCategory.slice(0, 6).map((c) => `  ${c.category}: ${money(c.totalMinor)}`),
    '',
    `Dashboard: ${appUrl('/')}`,
  ].join('\n');

  return { subject: `Your ${periodLabel} spending: ${money(totals.spentMinor)}`, html, text };
}
