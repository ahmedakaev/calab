// TODO(i18n C): copy of /developers/ and of the new /features/ sections that the home contract (i18n/home.ts)
// does not cover. ru is the source, en a working translation; es and zh fall back to en until C translates them.
import type { Locale } from '@/i18n/locales';

export type PageCopy = {
  developers: {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    title: string;
    lead: string;
    nav: { bots: string; mcp: string; sdk: string; webhooks: string; oauth: string };
    sdkTitle: string;
    sdkLead: string;
    webhooksTitle: string;
    webhooksLead: string;
    webhooksPoints: string[];
    oauthTitle: string;
    oauthLead: string;
    oauthPoints: string[];
    docs: string;
  };
  features: {
    canvas: { eyebrow: string; title: string; text: string; points: string[] };
    ai: { eyebrow: string; title: string; text: string; points: string[] };
    recording: { eyebrow: string; title: string; text: string; points: string[] };
  };
};

const ru: PageCopy = {
    developers: {
    metaTitle: 'Calab для разработчиков — боты, MCP, SDK, вебхуки и OAuth',
    metaDescription: 'Боты с тем же API, что у приложения; MCP для Claude и агентов в IDE; SDK на TypeScript; вебхуки с подписью HMAC; вход через Calab по OAuth 2.0.',
    eyebrow: 'Разработчикам',
    title: 'Calab как платформа',
    lead: 'Боты, LLM-агенты и ваши приложения работают через тот же API, что и Calab: чат, задачи, календарь, голос.',
    nav: { bots: 'Боты', mcp: 'MCP', sdk: 'SDK', webhooks: 'Вебхуки', oauth: 'OAuth' },
    sdkTitle: 'SDK на TypeScript',
    sdkLead: 'Команды, кнопки, события и голос — несколько строк кода.',
    webhooksTitle: 'Вебхуки',
    webhooksLead: 'События без постоянного соединения: POST-запрос с подписью HMAC и повторами при сбоях.',
    webhooksPoints: ['Вебхук бота: сообщения, реакции, задачи, встречи, кнопки', 'Подпись HMAC-SHA256 в заголовке X-Calab-Signature', 'Повторы при сбоях и очередь событий', 'Вебхук доски: каждое изменение задач (Business и выше)'],
    oauthTitle: 'Войти через Calab',
    oauthLead: 'OAuth 2.0 и OpenID Connect: ваши внутренние сервисы пускают сотрудников по аккаунту Calab.',
    oauthPoints: ['Authorization Code + PKCE (S256)', 'Экран согласия с правами', 'userinfo, refresh и отзыв токенов', 'Клиенты создаются в настройках пространства'],
    docs: 'Документация',
  },
    features: {
    canvas: { eyebrow: 'Холст', title: 'Онлайн-доска прямо в голосе', text: 'Бесконечный холст для ретро, схем и мозговых штурмов. Открывается в голосовой комнате и правится всеми сразу.', points: ['Стикеры, фигуры, стрелки и текст', 'Голосование точками и таймер', 'Курсоры коллег в реальном времени', 'Карточка холста в чате и на странице вики'] },
    ai: { eyebrow: 'AI', title: 'AI там, где он экономит время', text: 'Умная задача из текста и файлов, сводки и расшифровки встреч, любые модели через MCP.', points: ['Умная задача: доска, приоритет и проверка дублей', 'Сводка и расшифровка каждой записи', 'Claude и агенты в IDE — как боты через MCP', 'С тарифа Business; обработка — GPTunneL'] },
    recording: { eyebrow: 'Записи встреч', title: 'Запись, сводка и расшифровка', text: 'Запись ведёт сервер. После встречи в чат комнаты приходит карточка со сводкой, аудио и полным текстом.', points: ['Включает любой участник, кроме гостей', 'Поиск по словам в расшифровке', 'Аудио хранится 30 дней', 'Запись можно запретить в настройках комнаты'] },
  },
};

const en: PageCopy = {
    developers: {
    metaTitle: 'Calab for developers — bots, MCP, SDK, webhooks and OAuth',
    metaDescription: 'Bots with the same API as the app; MCP for Claude and IDE agents; a TypeScript SDK; HMAC-signed webhooks; Sign in with Calab over OAuth 2.0.',
    eyebrow: 'Developers',
    title: 'Calab as a platform',
    lead: 'Bots, LLM agents and your own apps use the same API as Calab itself: chat, tasks, calendar, voice.',
    nav: { bots: 'Bots', mcp: 'MCP', sdk: 'SDK', webhooks: 'Webhooks', oauth: 'OAuth' },
    sdkTitle: 'TypeScript SDK',
    sdkLead: 'Commands, buttons, events and voice in a few lines of code.',
    webhooksTitle: 'Webhooks',
    webhooksLead: 'Events without a persistent connection: an HMAC-signed POST with retries on failure.',
    webhooksPoints: ['Bot webhook: messages, reactions, tasks, meetings, buttons', 'HMAC-SHA256 signature in X-Calab-Signature', 'Retries on failure and an event queue', 'Board webhook: every task change (Business and up)'],
    oauthTitle: 'Sign in with Calab',
    oauthLead: 'OAuth 2.0 and OpenID Connect: your internal services let employees in with their Calab account.',
    oauthPoints: ['Authorization Code + PKCE (S256)', 'A consent screen with scopes', 'userinfo, refresh and token revocation', 'Clients are created in workspace settings'],
    docs: 'Documentation',
  },
    features: {
    canvas: { eyebrow: 'Canvas', title: 'A whiteboard right in voice', text: 'An infinite canvas for retros, diagrams and brainstorms. Opens in a voice room and everyone edits at once.', points: ['Sticky notes, shapes, arrows and text', 'Dot voting and a timer', 'Colleagues’ cursors in real time', 'Canvas card in the chat and on a wiki page'] },
    ai: { eyebrow: 'AI', title: 'AI where it saves time', text: 'Smart tasks from text and files, meeting summaries and transcripts, any model via MCP.', points: ['Smart task: board, priority and duplicate check', 'Summary and transcript of every recording', 'Claude and IDE agents as bots via MCP', 'From the Business plan; processing by GPTunneL'] },
    recording: { eyebrow: 'Meeting recordings', title: 'Recording, summary and transcript', text: 'The server records. After the meeting a card with the summary, audio and full text arrives in the room chat.', points: ['Any member except guests can start it', 'Word search in the transcript', 'Audio is kept for 30 days', 'Recording can be disabled per room'] },
  },
};

const copies: Record<Locale, PageCopy> = { ru, en, es: en, zh: en };
export const getPageCopy = (l: Locale): PageCopy => copies[l];
