#!/usr/bin/env node
/**
 * E2 ci-sweeper — ReachOS
 *
 * Report-only L2 loop. When the `ci` workflow fails, this pulls the failed
 * jobs' logs via the GitHub API, classifies the failure, and posts/updates
 * exactly ONE diagnosis comment on the associated PR (or on the head commit
 * for branch pushes). It never checks out PR code, never edits product code,
 * and never contacts an LLM (tokens_estimate: 0).
 *
 * Token resolution: GITHUB_TOKEN env (Actions) → `gh auth token` (local).
 * Repo resolution: GITHUB_REPOSITORY env → `git remote get-url origin`.
 *
 * Modes:
 *   (Actions) workflow_run of `ci`   — payload from GITHUB_EVENT_PATH
 *   (Actions) workflow_dispatch      — SWEEP_RUN_ID input, else latest failed ci run
 *   (local)   node scripts/ci-sweeper.mjs [--run-id N]   — same fallbacks
 *   --selftest                       — run fixtures through the parser, assert
 *
 * Usage: node scripts/ci-sweeper.mjs [--run-id N | --local | --selftest]
 * Exit 0 = sweep done or nothing to do (even when a read-only token blocks
 * the comment); exit 1 = could not collect data or selftest failed.
 */
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const COMMENT_MARKER = '<!-- loop:ci-sweeper -->';
const MAX_ERROR_LINES = 12;
const MAX_LOG_BYTES = 20 * 1024 * 1024;
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const ERROR_LINE_RE =
  /(error TS\d+[^\n]*|##\[error\][^\n]*|FAIL\s+[^\n]*|AssertionError[^\n]*|Module not found[^\n]*|Cannot find module[^\n]*|Failed to compile[^\n]*)/g;
const PRISMA_RE = /TS2305[^\n]*@prisma\/client|@prisma\/client[^\n]*has no exported member|prisma generate/i;

// ---------------------------------------------------------------------------
// classification (pure — exercised by --selftest)
// ---------------------------------------------------------------------------

function stripAnsi(s) {
  return s.replace(ANSI_RE, '');
}

function classifyFailure(stepName, log) {
  const step = stepName.toLowerCase();
  let kind = 'unknown';
  if (/typecheck|tsc/.test(step)) kind = 'typecheck';
  else if (/test|vitest/.test(step)) kind = 'test';
  else if (/build/.test(step)) kind = 'build';
  else if (/FAIL\s+/.test(log) || /AssertionError/.test(log)) kind = 'test';
  else if (/Failed to compile|Module not found|Cannot find module/.test(log)) kind = 'build';
  else if (/error TS\d+/.test(log)) kind = 'typecheck';
  return { kind, prisma: PRISMA_RE.test(log) };
}

function extractErrorLines(log) {
  const seen = new Set();
  const out = [];
  for (const m of stripAnsi(log).matchAll(ERROR_LINE_RE)) {
    const line = m[0].replace(/^##\[error\]/, '').trim();
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= MAX_ERROR_LINES) break;
  }
  return out;
}

function hintFor({ kind, prisma }) {
  if (prisma)
    return '`@prisma/client` has no generated types here — `tsc --noEmit` needs `prisma generate` to have run first (the api `build` script does it, but typecheck runs before build). Fix: generate the client as a CI step before typecheck.';
  if (kind === 'typecheck')
    return 'TypeScript errors below. If the failing files import Prisma types, check the prisma hint instead of chasing each TS7006.';
  if (kind === 'test')
    return 'Vitest failures below — reproduce locally with the `pnpm --filter @reach/<pkg> test` shown in the log.';
  if (kind === 'build')
    return '`next build` failed — check the compile section of the log (env gaps and import resolution are the usual causes).';
  return 'No known failure pattern matched — a human should read the full log.';
}

// ---------------------------------------------------------------------------
// GitHub API (via gh CLI — same pattern as scripts/triage.mjs)
// ---------------------------------------------------------------------------

function loadEnv() {
  let token = process.env.GITHUB_TOKEN;
  let repo = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token) {
    try {
      token = execFileSync('gh', ['auth', 'token']).toString().trim();
    } catch {
      token = null;
    }
  }
  if (!repo) {
    try {
      const url = execFileSync('git', ['remote', 'get-url', 'origin']).toString().trim();
      repo = url.replace(/^git@github\.com:/, '').replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
    } catch {
      repo = null;
    }
  }
  return { token, repo, eventPath, runId: process.env.SWEEP_RUN_ID || null };
}

async function gh(apiPath, { method = 'GET', fields } = {}) {
  const args = ['api', apiPath, '--method', method];
  for (const [k, v] of Object.entries(fields || {})) args.push('-f', `${k}=${v}`);
  try {
    const { stdout } = await exec('gh', args, { maxBuffer: MAX_LOG_BYTES });
    return stdout;
  } catch (e) {
    const err = new Error(`gh api ${apiPath} failed: ${e.message.slice(0, 300)}`);
    err.status = e.code;
    throw err;
  }
}

async function ghJson(apiPath) {
  const out = await gh(apiPath);
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// sweep
// ---------------------------------------------------------------------------

async function resolveRunId(env, payload) {
  if (env.runId) return env.runId;
  if (payload?.workflow_run?.id) return String(payload.workflow_run.id);
  const data = await ghJson(`repos/${env.repo}/actions/runs?per_page=30`);
  const hit = (data?.workflow_runs || []).find(
    (r) => r.conclusion === 'failure' && /ci\.yml/.test(r.path)
  );
  return hit ? String(hit.id) : null;
}

function composeComment(run, diagnoses) {
  const sha = (run.head_sha || '').slice(0, 7);
  const branch = run.head_branch || 'main';
  const sections = diagnoses
    .map((d) => {
      const errs = d.errors.length
        ? `\n\n<details><summary>Top errors (${d.errors.length})</summary>\n\n\`\`\`\n${d.errors.join('\n')}\n\`\`\`\n\n</details>`
        : '';
      return `### \`${d.job}\` — step \`${d.step}\` → **${d.kind}**${d.prisma ? ' (prisma pattern)' : ''}\n\n${d.hint}${errs}`;
    })
    .join('\n\n');
  return [
    COMMENT_MARKER,
    `## CI failure diagnosis — run [${run.id}](${run.html_url})`,
    '',
    `Branch \`${branch}\` · commit \`${sha}\``,
    '',
    sections,
    '',
    '— posted by **E2 ci-sweeper** (report-only: it diagnoses, never edits code; see LOOP.md). It updates this comment if the same run is re-diagnosed.',
  ].join('\n');
}

async function findComment(env, target) {
  const listPath =
    target.type === 'pr'
      ? `repos/${env.repo}/issues/${target.number}/comments?per_page=100`
      : `repos/${env.repo}/commits/${target.sha}/comments?per_page=100`;
  const comments = await ghJson(listPath);
  const hit = (comments || []).find((c) => (c.body || '').includes(COMMENT_MARKER));
  return hit ? hit.id : null;
}

async function upsertComment(env, target, body) {
  const existingId = await findComment(env, target);
  if (existingId) {
    // commit comments and issue comments live under different PATCH paths
    const patchPath =
      target.type === 'pr'
        ? `repos/${env.repo}/issues/comments/${existingId}`
        : `repos/${env.repo}/comments/${existingId}`;
    await gh(patchPath, { method: 'PATCH', fields: { body } });
    return 'updated';
  }
  const createPath =
    target.type === 'pr'
      ? `repos/${env.repo}/issues/${target.number}/comments`
      : `repos/${env.repo}/commits/${target.sha}/comments`;
  await gh(createPath, { method: 'POST', fields: { body } });
  return 'created';
}

function appendLog(entry) {
  if (!existsSync('loop-run-log.md')) return;
  appendFileSync('loop-run-log.md', JSON.stringify(entry) + '\n');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) return selftest();
  const runIdArg = argv.includes('--run-id') ? argv[argv.indexOf('--run-id') + 1] : null;
  if (argv.includes('--run-id') && !runIdArg) {
    console.error('ci-sweeper: --run-id requires a value');
    process.exit(1);
  }

  const t0 = Date.now();
  const env = loadEnv();
  if (runIdArg) env.runId = runIdArg;
  const payload = env.eventPath && existsSync(env.eventPath)
    ? JSON.parse(readFileSync(env.eventPath, 'utf8'))
    : {};
  if (!env.token || !env.repo) {
    console.error('ci-sweeper: no GitHub token or repo resolved');
    process.exit(1);
  }
  process.env.GITHUB_TOKEN = env.token; // for the gh CLI

  const payloadConclusion = payload?.workflow_run?.conclusion;
  if (payloadConclusion && payloadConclusion !== 'failure') {
    console.log(`ci-sweeper: ci run concluded '${payloadConclusion}' — nothing to do`);
    return;
  }

  const runId = await resolveRunId(env, payload);
  if (!runId) {
    console.log('ci-sweeper: no failed ci run found — nothing to do');
    return;
  }
  const run = await ghJson(`repos/${env.repo}/actions/runs/${runId}`);
  if (!run || run.conclusion !== 'failure') {
    console.log(`ci-sweeper: run ${runId} not failed ('${run?.conclusion}') — nothing to do`);
    return;
  }

  const jobsData = await ghJson(`repos/${env.repo}/actions/runs/${runId}/jobs?per_page=100`);
  const jobs = (jobsData?.jobs || []).filter((j) => j.conclusion === 'failure');
  if (!jobs.length) {
    console.log(`ci-sweeper: run ${runId} failed but no failed jobs visible (permissions?)`);
    return;
  }

  const diagnoses = [];
  for (const job of jobs) {
    const failedStep = (job.steps || []).find((s) => s.conclusion === 'failure');
    const log = await gh(`repos/${env.repo}/actions/jobs/${job.id}/logs`).catch(() => '');
    const { kind, prisma } = classifyFailure(failedStep?.name || job.name, log);
    diagnoses.push({
      job: job.name,
      step: failedStep?.name || '(job-level)',
      kind,
      prisma,
      hint: hintFor({ kind, prisma }),
      errors: extractErrorLines(log),
    });
  }

  const body = composeComment(run, diagnoses);
  const prNumber =
    payload?.workflow_run?.pull_requests?.[0]?.number || run.pull_requests?.[0]?.number || null;
  const target = prNumber
    ? { type: 'pr', number: prNumber }
    : { type: 'commit', sha: run.head_sha };

  let action;
  try {
    const result = await upsertComment(env, target, body);
    action = `comment ${result} on ${target.type === 'pr' ? `PR #${prNumber}` : `commit ${(run.head_sha || '').slice(0, 7)}`}`;
  } catch (e) {
    action = `comment SKIPPED (${/403|read.only|Resource not accessible/i.test(e.message) ? 'read-only token' : e.message})`;
  }

  appendLog({
    run_id: new Date().toISOString(),
    pattern: 'ci-sweeper',
    actor: process.env.GITHUB_ACTIONS ? 'github-actions' : 'local',
    duration_s: Math.round((Date.now() - t0) / 1000),
    items_found: jobs.length,
    actions_taken: action,
    escalations: 0,
    tokens_estimate: 0,
    outcome: 'success',
    notes: `diagnosed ci run ${runId}: ${diagnoses.map((d) => `${d.job}/${d.step}=${d.kind}${d.prisma ? '+prisma' : ''}`).join(', ')}`,
  });
  console.log(`ci-sweeper: run ${runId} → ${action}`);
}

// ---------------------------------------------------------------------------
// selftest
// ---------------------------------------------------------------------------

function selftest() {
  const fixtures = [
    {
      name: 'prisma typecheck cascade (first main run 36953175802)',
      step: 'Typecheck',
      log:
        '##[group]Run pnpm typecheck\n' +
        "##[error]app/api/lib/db.ts(1,10): error TS2305: Module '\"@prisma/client\"' has no exported member 'PrismaClient'.\n" +
        "##[error]app/api/app/dashboard/page.tsx(182,35): error TS7006: Parameter 's' implicitly has an 'any' type.\n" +
        "##[error]app/api/app/dashboard/page.tsx(182,38): error TS7006: Parameter 't' implicitly has an 'any' type.\n",
      expect: { kind: 'typecheck', prisma: true },
      expectLines: ['error TS2305', 'error TS7006'],
    },
    {
      name: 'vitest failure',
      step: 'Test',
      log:
        '> @reach/rules-engine@0.0.0 test\n' +
        'FAIL  src/__tests__/engine.test.ts > engine > scores spam low\n' +
        'AssertionError: expected 55 to be 5 +- 3\n',
      expect: { kind: 'test', prisma: false },
      expectLines: ['FAIL', 'AssertionError'],
    },
    {
      name: 'next build failure',
      step: 'Build',
      log: "Failed to compile.\n\nModule not found: Can't resolve './ScoreGauge'\n",
      expect: { kind: 'build', prisma: false },
      expectLines: ['Failed to compile', 'Module not found'],
    },
    {
      name: 'unknown noise',
      step: 'verify',
      log: ' everything fine\n some warning: deprecated\n',
      expect: { kind: 'unknown', prisma: false },
      expectLines: [],
    },
  ];

  let failures = 0;
  for (const f of fixtures) {
    const got = classifyFailure(f.step, f.log);
    const lines = extractErrorLines(f.log);
    const okKind = got.kind === f.expect.kind;
    const okPrisma = got.prisma === f.expect.prisma;
    const okLines = f.expectLines.every((e) => lines.some((l) => l.includes(e)));
    const dupes = new Set(lines).size !== lines.length;
    const ok = okKind && okPrisma && okLines && !dupes;
    if (!ok) failures++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${f.name} — kind=${got.kind} prisma=${got.prisma} lines=${lines.length}` +
        (ok ? '' : ` (want kind=${f.expect.kind} prisma=${f.expect.prisma} lines>=${f.expectLines.join('|')})`)
    );
  }
  if (failures) {
    console.error(`ci-sweeper selftest: ${failures} fixture(s) failed`);
    process.exit(1);
  }
  console.log('ci-sweeper selftest: all fixtures passed');
}

main().catch((e) => {
  console.error('ci-sweeper: fatal:', e.message);
  process.exit(1);
});
