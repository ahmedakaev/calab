// Command lines of the two claude modes. Pure functions, so tests can pin exactly what each mode may do.

/** /check: the lead on Opus with full rights in the lead checkout (the owner's own trust level). */
export function leadArgv(prompt: string): string[] {
  return ['-p', '--model', 'opus', '--permission-mode', 'bypassPermissions', '--output-format', 'stream-json', '--verbose', prompt];
}

/** Read-only paths of the assistant's checkout (relative to its cwd). */
export const ASSIST_READ_PATHS = ['./docs/**', './apps/**'] as const;

/** Board commands the assistant may run (create and label a bug, comment, read); never `status`. */
export const BUGBOARD_VERBS = ['list', 'show', 'comment', 'create', 'label'] as const;

/** The handoff writer's subcommands each mode may call (`handoff` = "<node> <…/handoff.mjs>"). */
export const ASSIST_HANDOFF_VERBS = ['add'] as const;
export const WAKE_HANDOFF_VERBS = ['add', 'reply', 'chat'] as const;

export function assistAllowedTools(bugboard: string, handoff?: string): string[] {
  return [
    ...ASSIST_READ_PATHS.flatMap((p) => [`Read(${p})`, `Grep(${p})`, `Glob(${p})`]),
    ...BUGBOARD_VERBS.map((v) => `Bash(python3 ${bugboard} ${v}:*)`),
    ...(handoff ? ASSIST_HANDOFF_VERBS.map((v) => `Bash(${handoff} ${v}:*)`) : []),
  ];
}

/** Paths no sandboxed run may read: secrets, the owner's checkout and session data, the inbox. */
function secretReads(home: string, ownerRepo: string, inboxDir?: string): string[] {
  const homeRel = (p: string): string => `~/${p}`;
  const abs = (p: string): string => `/${p.replace(/^\/+/, '/')}`; // permission rules: //abs/path
  return [
    './.env*',
    './**/.env*',
    homeRel('.calab-tools/**'),
    homeRel('.claude/**'),
    homeRel('.ssh/**'),
    homeRel('.aws/**'),
    homeRel('.config/**'),
    homeRel('Library/**'),
    abs(`${ownerRepo}/**`),
    abs(`${home}/.calab-claude-bot/*.env`),
    ...(inboxDir ? [abs(`${inboxDir}/**`)] : []),
  ];
}

export function assistDisallowedTools(home: string, ownerRepo: string, inboxDir?: string): string[] {
  return [
    'Write',
    'Edit',
    'MultiEdit',
    'NotebookEdit',
    'WebFetch',
    'WebSearch',
    'Agent',
    'Task',
    'Bash(python3 * status:*)',
    ...secretReads(home, ownerRepo, inboxDir).flatMap((p) => [`Read(${p})`, `Grep(${p})`, `Glob(${p})`]),
  ];
}

/**
 * The Sonnet assistant: only Read/Grep/Glob/Bash exist (`--tools`), Bash only for the board helper,
 * reads only in docs/ and apps/ of its own checkout; user/project settings, MCP servers, skills and
 * CLAUDE.md are not loaded (`--safe-mode`, `--strict-mcp-config`, `--setting-sources ''`); whatever is not
 * allowed is refused without a prompt (`dontAsk`). The chat goes on stdin.
 */
export function assistArgv(opts: {
  systemPrompt: string;
  bugboard: string;
  home: string;
  ownerRepo: string;
  handoff?: string;
  inboxDir?: string;
  maxBudgetUsd?: number;
}): string[] {
  return [
    '-p',
    '--model',
    'sonnet',
    '--output-format',
    'json',
    '--safe-mode',
    '--strict-mcp-config',
    '--setting-sources=',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--permission-mode',
    'dontAsk',
    '--permission-prompts',
    'none',
    '--max-budget-usd',
    String(opts.maxBudgetUsd ?? 0.5),
    '--system-prompt',
    opts.systemPrompt,
    '--tools',
    'Read,Grep,Glob,Bash',
    '--allowedTools',
    ...assistAllowedTools(opts.bugboard, opts.handoff),
    '--disallowedTools',
    ...assistDisallowedTools(opts.home, opts.ownerRepo, opts.inboxDir),
  ];
}

// ---- wake runs: the lead woken by the poller, on untrusted input, so never bypassPermissions ----

/** Board commands of a wake run: triage (label, priority, status, owner approval), comments, new tasks. */
export const WAKE_BUGBOARD_VERBS = ['list', 'show', 'author', 'comment', 'create', 'label', 'priority', 'status', 'ask-owner'] as const;

/** Read-only `gh` subcommands, plus comments on PRs and issues. */
export const WAKE_GH = ['pr view', 'pr list', 'pr diff', 'pr checks', 'issue view', 'issue list', 'run list', 'run view', 'pr comment', 'issue comment'] as const;

export function wakeAllowedTools(opts: { bugboard: string; handoff: string; ghRepo: string }): string[] {
  return [
    'Read(./**)',
    'Grep(./**)',
    'Glob(./**)',
    ...WAKE_GH.map((c) => `Bash(gh ${c}:*)`),
    `Bash(gh api repos/${opts.ghRepo}/:*)`, // GET only: the write flags are denied below
    ...WAKE_BUGBOARD_VERBS.map((v) => `Bash(python3 ${opts.bugboard} ${v}:*)`),
    ...WAKE_HANDOFF_VERBS.map((v) => `Bash(${opts.handoff} ${v}:*)`),
  ];
}

/** `gh api` write flags, and flags that would post a local file (`--body-file`/`-F`) or delete comments. */
export const WAKE_GH_DENIED = [
  'Bash(gh api * -X*)',
  'Bash(gh api * --method*)',
  'Bash(gh api * -f*)',
  'Bash(gh api * -F*)',
  'Bash(gh api * --field*)',
  'Bash(gh api * --raw-field*)',
  'Bash(gh api * --input*)',
  'Bash(gh * --body-file*)',
  'Bash(gh * -F *)',
  'Bash(gh * --delete-last*)',
  'Bash(gh * --edit-last*)',
] as const;

export function wakeDisallowedTools(home: string, ownerRepo: string, inboxDir: string): string[] {
  return [
    'Write',
    'Edit',
    'MultiEdit',
    'NotebookEdit',
    'WebFetch',
    'WebSearch',
    'Agent',
    'Task',
    'Bash(git push:*)',
    ...WAKE_GH_DENIED,
    ...secretReads(home, ownerRepo, inboxDir).flatMap((p) => [`Read(${p})`, `Grep(${p})`, `Glob(${p})`]),
  ];
}

/**
 * A wake run: the lead on `model` in the lead checkout, `dontAsk` with an explicit allowlist (no general
 * Bash, no Write/Edit, no git push, no secret paths), no user/project settings or MCP. The prompt goes
 * on stdin (the tool lists are variadic).
 */
export function wakeArgv(opts: {
  model: string;
  bugboard: string;
  handoff: string;
  ghRepo: string;
  home: string;
  ownerRepo: string;
  inboxDir: string;
  maxBudgetUsd: number;
}): string[] {
  return [
    '-p',
    '--model',
    opts.model,
    '--output-format',
    'stream-json',
    '--verbose',
    '--safe-mode',
    '--strict-mcp-config',
    '--setting-sources=',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--permission-mode',
    'dontAsk',
    '--permission-prompts',
    'none',
    '--max-budget-usd',
    String(opts.maxBudgetUsd),
    '--tools',
    'Read,Grep,Glob,Bash',
    '--allowedTools',
    ...wakeAllowedTools(opts),
    '--disallowedTools',
    ...wakeDisallowedTools(opts.home, opts.ownerRepo, opts.inboxDir),
  ];
}
