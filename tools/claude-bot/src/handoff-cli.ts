// The narrow tool a sandboxed run may call (allowlisted by prefix in argv.ts):
//   handoff.mjs add [--kind request|bug|question] [--task #85] [--from chat-N]   text on stdin → prints the id
//   handoff.mjs reply chat-N                                                      text on stdin → the daemon posts it
//   handoff.mjs chat chat-N                                                       prints that chat (untrusted)
// The inbox directory and the ticket come from env vars the daemon sets; nothing from the model shapes a
// path or the requester.
import { readSync } from 'node:fs';
import { addReply, addRequest, HandoffError, MAX_STDIN, parseAddArgs, readChat } from './inbox.js';

function readStdin(): string {
  if (process.stdin.isTTY) throw new HandoffError('текст — на stdin (heredoc)');
  const buf = Buffer.alloc(MAX_STDIN + 1);
  let len = 0;
  for (;;) {
    let n: number;
    try {
      n = readSync(0, buf, len, buf.length - len, null);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EAGAIN') continue;
      if ((err as NodeJS.ErrnoException).code === 'EOF') break;
      throw err;
    }
    if (n === 0) break;
    len += n;
    if (len > MAX_STDIN) throw new HandoffError('текст слишком длинный — сократите');
  }
  return buf.subarray(0, len).toString('utf8');
}

function main(argv: string[]): void {
  const inboxDir = process.env.CALAB_HANDOFF_DIR ?? '';
  const ticketId = process.env.CALAB_HANDOFF_TICKET;
  if (!inboxDir.startsWith('/')) throw new HandoffError('запись запросов доступна только из запуска бота');
  const [cmd, ...rest] = argv;
  if (cmd === 'add') {
    const args = parseAddArgs(rest);
    const r = addRequest({ inboxDir, ticketId, input: { ...args, text: readStdin() }, now: new Date() });
    process.stdout.write(`${r.id}\n`);
  } else if (cmd === 'reply' && rest.length === 1) {
    addReply({ inboxDir, ticketId, ref: rest[0] ?? '', text: readStdin(), now: Date.now() });
    process.stdout.write('ok: ответ будет отправлен\n');
  } else if (cmd === 'chat' && rest.length === 1) {
    process.stdout.write(readChat({ inboxDir, ticketId, ref: rest[0] ?? '', now: Date.now() }));
  } else {
    throw new HandoffError('usage: add [--kind K] [--task N] [--from chat-N] <<EOF | reply chat-N <<EOF | chat chat-N');
  }
}

try {
  main(process.argv.slice(2));
} catch (err) {
  process.stderr.write(`${err instanceof HandoffError ? err.message : 'ошибка записи'}\n`);
  process.exit(2);
}
