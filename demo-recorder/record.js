// Records a full hackathon demo of CrisisPilot: opens the dashboard, triggers
// incidents through the UI, and walks through the live multi-agent investigation
// — Gemini reasoning, the 5 ADK (Agent Builder) agents, and the Dynatrace MCP
// tool calls — ending on root-cause synthesis, remediation, and business impact.
const { chromium } = require('playwright');

const BACKEND = 'http://localhost:8000';
const FRONTEND = 'http://localhost:3000';
const VIDEO_DIR = '/Users/supriyarai/Desktop/crisispilot/demo-recorder/videos';
const W = 1600, H = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiTrigger(label) {
  try {
    const r = await fetch(`${BACKEND}/api/incidents/trigger`, { method: 'POST' });
    const j = await r.json();
    console.log(`[${label}] ${j.id} — ${j.title} (${j.severity})`);
    return j;
  } catch (e) {
    console.log(`[${label}] api trigger error: ${e.message}`);
  }
}

// Smooth multi-step scroll so the video pans rather than jumps.
async function pan(page, totalY, steps = 10, pause = 280) {
  const dy = Math.round(totalY / steps);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy);
    await sleep(pause);
  }
}

async function clickByText(page, text) {
  try {
    await page.getByText(text, { exact: false }).first().click({ timeout: 2500 });
    return true;
  } catch {
    return false;
  }
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    recordVideo: { dir: VIDEO_DIR, size: { width: W, height: H } },
  });
  const page = await context.newPage();

  console.log('opening dashboard...');
  await page.goto(FRONTEND, { waitUntil: 'load', timeout: 60000 });
  await sleep(5000); // WS connect + branding visible

  // --- Incident 1: trigger via the actual UI button (fallback to API) ---
  console.log('triggering incident 1 (UI button)...');
  if (!(await clickByText(page, 'Trigger incident'))) await apiTrigger('incident 1 (api)');
  await sleep(24000); // agents investigate: Metrics/Deploy/Impact -> RootCause -> Comms

  // --- Walk the center war-room: agent reasoning + Dynatrace MCP tool calls ---
  console.log('panning agent war-room...');
  await pan(page, 700, 12);
  await sleep(3500);
  await pan(page, -700, 10);
  await sleep(2500);

  // --- Incident 2 for breadth ---
  console.log('triggering incident 2...');
  await apiTrigger('incident 2');
  await sleep(20000);

  // --- Navigate between incidents in the operations feed ---
  console.log('navigating incidents...');
  await clickByText(page, 'failures');
  await sleep(6000);
  await clickByText(page, 'latency');
  await sleep(6000);

  // --- Final hold on the full dashboard ---
  await pan(page, 400, 6);
  await sleep(3000);
  await pan(page, -400, 6);
  await sleep(4000);

  console.log('saving video...');
  await context.close();
  await browser.close();
  console.log('done');
})().catch((e) => {
  console.error('RECORD_ERROR', e);
  process.exit(1);
});
