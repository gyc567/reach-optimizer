#!/usr/bin/env node
/**
 * E1 daily-triage — ReachOS
 *
 * Report-only L1 loop. Discovers work from the GitHub API (open PRs, issues,
 * CI status), rewrites STATE.md, appends one line to loop-run-log.md.
 * It never edits product code and never contacts an LLM (tokens_estimate: 0).
 *
 * Token resolution: GITHUB_TOKEN env (Actions) → `gh auth token` (local).
 * Repo resolution: GITHUB_REPOSITORY env → `git remote get-url origin`.
 *
 * Usage: node scripts/triage.mjs
 * Exit 0 = state written (even when clean); exit 1 = could not collect data.
 */
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const STALE_PR_DAYS = 3;
const STALE_ISSUE_DAYS = 7;
const MAX_HIGH_PRIORITY = 5;
const STATE_PATH = 'STATE.md';
const RUNLOG_PATH = 'loop-run-log.md';
const IN_ACTIONS = !!process.env.GITHUB_ACTIONS;

const run = async (cmd, args) => (await exec(cmd, args, { maxBuffer: 8 << 20 })).stdout.trim();

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

async function resolveRepo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = await run('git', ['remote', 'get-url', 'origin']);
  const m = url.match(/github\.com[:/]([^/]+\/[^/.]+?)(\.git)?$/);
  if (!m) throw new Error(`Cannot parse owner/repo from remote: ${url}`);
  return m[1];
}

async function resolveToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try { return await run('gh', ['auth', 'token']); } catch { return null; }
}

async function dirtyFileCount() {
  if (IN_ACTIONS) return 0; // checkout is clean by construction in CI
  try { return (await run('git', ['status', '--porcelain'])).split('\n').filter(Boolean).length; }
  catch { return 0; }
}

async function api(repo, token, path) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'reachos-loop-triage',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 404) return []; // e.g. checks on a fresh branch — treat as absent
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
  return res.json();
}

const ageDays = (iso) => (Date.now() - new Date(iso).getTime()) / 86_400_000;
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

// ---------------------------------------------------------------------------
// Collect
// ---------------------------------------------------------------------------

async function collect(repo, token) {
  const [prs, issues, mainRuns, dirty] = await Promise.all([
    api(repo, token, '/pulls?state=open&per_page=50'),
    api(repo, token, '/issues?state=open&per_page=50'),
    api(repo, token, '/actions/runs?branch=main&per_page=10'),
    dirtyFileCount(),
  ]);

  // Worst check-run conclusion per open PR head (ci workflow is what matters).
  const prsWithChecks = await Promise.all(
    prs.slice(0, 10).map(async (pr) => {
      const checks = await api(repo, token, `/commits/${pr.head.sha}/check-runs?per_page=20`);
      const relevant = (Array.isArray(checks) ? checks.check_runs ?? [] : []).filter(
        (c) => c.name === 'ci' || c.name?.startsWith('ci'),
      );
      const worst = relevant.some((c) => c.conclusion === 'failure')
        ? 'failure'
        : relevant.length > 0 && relevant.every((c) => c.conclusion === 'success') ? 'success' : 'pending';
      return { ...pr, checkStatus: worst };
    }),
  );

  const lastMainPush = (Array.isArray(mainRuns) ? mainRuns.workflow_runs ?? [] : []).find(
    (r) => r.event === 'push' && r.head_branch === 'main',
  );

  return {
    prs: prsWithChecks,
    issues: (issues ?? []).filter((i) => !i.pull_request), // /issues includes PRs
    lastMainPush: lastMainPush ?? null,
    dirty,
  };
}

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

function triage(data) {
  const high = [];
  const watch = [];
  const noise = [];

  if (data.lastMainPush?.conclusion === 'failure') {
    high.push(`**CI red on main** — run [${data.lastMainPush.id}](${data.lastMainPush.html_url}) (${data.lastMainPush.conclusion}). Investigate before merging anything.`);
  }

  for (const pr of data.prs) {
    const idle = ageDays(pr.updated_at);
    if (pr.checkStatus === 'failure') {
      high.push(`[PR #${pr.number}](${pr.html_url}) **failing CI** — "${pr.title}" (@${pr.user.login}). Loop must not merge; diagnose or ask author.`);
    } else if (!pr.draft && idle > STALE_PR_DAYS) {
      high.push(`[PR #${pr.number}](${pr.html_url}) **stale ${Math.floor(idle)}d** — "${pr.title}" (@${pr.user.login}). Needs review or close.`);
    } else {
      watch.push(`[PR #${pr.number}](${pr.html_url}) ${pr.draft ? '📝 draft · ' : ''}checks: ${pr.checkStatus} — "${pr.title}"`);
    }
  }

  for (const issue of data.issues) {
    const age = ageDays(issue.created_at);
    const labels = (issue.labels ?? []).map((l) => l.name).join(', ');
    const isBug = (issue.labels ?? []).some((l) => /bug|security/i.test(l.name));
    if (isBug && age > STALE_ISSUE_DAYS) {
      high.push(`[Issue #${issue.number}](${issue.html_url}) **unattended ${Math.floor(age)}d** (${labels}) — "${issue.title}"`);
    } else if (age > STALE_ISSUE_DAYS * 2) {
      noise.push(`[Issue #${issue.number}](${issue.html_url}) idle ${Math.floor(age)}d — left untouched (not labeled bug/security)`);
    } else {
      watch.push(`[Issue #${issue.number}](${issue.html_url}) ${age < 1 ? 'new' : `${Math.floor(age)}d old`} — "${issue.title}"${labels ? ` [${labels}]` : ''}`);
    }
  }

  if (data.dirty > 20) {
    high.push(`**Working tree dirty: ${data.dirty} files** — converge into PRs before new work (D1 owns convergence).`);
  }

  return {
    high: high.slice(0, MAX_HIGH_PRIORITY),
    watch: watch.slice(0, 15),
    noise: noise.slice(0, 10),
    escalations: high.length,
  };
}

// ---------------------------------------------------------------------------
// State preservation
// ---------------------------------------------------------------------------

function extractSection(existing, heading) {
  const m = existing.match(new RegExp(`(## ${heading}[\\s\\S]*?)(?=\\n## |---\\s*$)`, 'm'));
  return m ? m[1].trimEnd() : null;
}

function extractLock(existing) {
  const m = existing.match(/lock:\n((?:  .*\n)+)/);
  return m ? m[0].trimEnd() : 'lock:\n  holder: null\n  since: null\n  note: "One code-change loop at a time. D3/D4 (Vercel cron governance) never take this lock."';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const started = Date.now();
let outcome = 'success';
let notes = 'report-only; no LLM calls';
let result = null;

try {
  const repo = await resolveRepo();
  const token = await resolveToken();
  if (!token) throw new Error('No GITHUB_TOKEN and `gh auth token` unavailable — cannot read private repo data.');

  const data = await collect(repo, token);
  result = triage(data);

  const iso = new Date().toISOString();
  const existing = existsSync(STATE_PATH) ? readFileSync(STATE_PATH, 'utf8') : '';
  const human = extractSection(existing, 'Human Overrides');
  const lock = extractLock(existing);

  const lines = [
    '# Loop State — reach-optimizer',
    '',
    `Last run: ${iso} (E1 daily-triage — ${IN_ACTIONS ? 'github-actions' : 'local'})`,
    'paused: false',
    '',
    lock,
    '',
    '## High Priority (loop is acting or waiting on human)',
    '',
    ...(result.high.length ? result.high.map((s) => `- ${s}`) : ['- ✅ clean — no human action required today.']),
    '',
    '## Watch List',
    '',
    ...(result.watch.length ? result.watch.map((s) => `- ${s}`) : ['- (nothing alive right now)']),
    '',
    '## Uncommitted Changes (health signal)',
    '',
    `- ${IN_ACTIONS ? 'CI context — checkout is clean by construction; signal is local-only.' : `local: ${data.dirty} dirty files (triage flags when > 20)`}`,
    '',
    '## Recent Noise (ignored this run)',
    '',
    ...(result.noise.length ? result.noise.map((s) => `- ${s}`) : ['- (none)']),
  ];
  if (human) lines.push('', human);
  lines.push('', '---', 'Run log: `loop-run-log.md`. Registry & cadence: `LOOP.md`. Constraints: `loop-constraints.md`.');
  writeFileSync(STATE_PATH, lines.join('\n') + '\n');

  appendFileSync(
    RUNLOG_PATH,
    JSON.stringify({
      run_id: iso,
      pattern: 'daily-triage',
      actor: IN_ACTIONS ? 'e1-action' : 'local',
      duration_s: Math.round((Date.now() - started) / 1000),
      items_found: result.watch.length + result.high.length,
      actions_taken: 'STATE.md rewritten (report-only)',
      escalations: result.escalations,
      tokens_estimate: 0,
      outcome,
      notes,
    }) + '\n',
  );

  console.log(`triage: ${result.high.length} high-priority, ${result.watch.length} watch, ${result.noise.length} noise`);
  if (result.high.length) console.log('HIGH:\n' + result.high.map((s) => `  - ${s}`).join('\n'));
} catch (err) {
  outcome = 'error';
  notes = String(err.message ?? err);
  console.error('triage failed:', notes);
  process.exitCode = 1;
}
