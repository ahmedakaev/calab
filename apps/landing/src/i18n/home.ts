import { en } from './home-en';
import { es } from './home-es';
import { zh } from './home-zh';
import type { Locale } from './locales';
import type { ScreenName } from '@/lib/screens';

/**
 * Landing v6 home page copy (docs/plans/landing-v6.md §4, §5): the typed contract the home components read.
 * Scene names are the screenshot names of §5 (lib/screens.ts); each has an alt text in `alts`, so a missing
 * alt fails typecheck. Plan facts: apps/server/internal/plans/limits.go and the pricing table in ru.ts
 * (canvases Free 3 / Team 30 / Business 100, AI and telephony Business and Enterprise, mail desktop only).
 * Per-locale texts: ru here (source), the rest in home-<locale>.ts. No foreign trademarks in headings.
 */
export type Tuple<T, N extends number, A extends T[] = []> = A['length'] extends N ? A : Tuple<T, N, [...A, T]>;

export type SceneName =
  // hero: whole windows (a phone crop each, lib/screens.ts `focus`)
  | 'voice' | 'chat-full' | 'kanban-full' | 'calendar-week' | 'wiki-full' | 'canvas' | 'phone-call'
  // the day story
  | 'story-message' | 'story-task' | 'story-meeting' | 'recording-focus' | 'story-wiki' | 'story-canvas'
  // catalogue tiles (≤ 860 px wide, about 16:10: cut out of the scenes, scripts/assets.mjs `from`)
  | 'voice-panel' | 'gallery' | 'chat-focus' | 'phone-call-panel' | 'temp-room'
  | 'kanban-panel' | 'taskhistory-panel' | 'timeline-panel' | 'findtime-panel' | 'wiki-focus' | 'canvas-panel' | 'disk-panel' | 'mail-panel'
  | 'search' | 'notifyrelay-panel' | 'roles' | 'webapps-panel' | 'aitask' | 'bot-card'
  // telephony, AI, phones
  | 'telephony-ivr' | 'telephony-groups' | 'telephony-call' | 'recording-transcript' | 'phone-canvas' | 'phone-rooms' | 'phone-voice';

/** Every scene is a screenshot of lib/screens.ts (fails typecheck otherwise). */
export const SCENES_ARE_SCREENS: Exclude<SceneName, ScreenName> extends never ? true : never = true;

/** Scene order of the hero chips and the screenshot each chip shows (§4.1). */
export const HERO_SCENES = ['voice', 'chat', 'tasks', 'calendar', 'wiki', 'canvas', 'phone'] as const;
export type HeroSceneKey = (typeof HERO_SCENES)[number];
export const HERO_SHOT: Record<HeroSceneKey, SceneName> = {
  voice: 'voice', chat: 'chat-full', tasks: 'kanban-full', calendar: 'calendar-week', wiki: 'wiki-full', canvas: 'canvas', phone: 'phone-call',
};

export type Badge = 'desktop' | 'team' | 'business';
export type CatalogGroupKey = 'talk' | 'work' | 'order' | 'smart';
export type Tile = {
  shot: SceneName;
  title: string;
  text: string;
  /** `/features/#anchor` of the «Подробнее» link; absent → no link. */
  anchor?: string;
  badge?: Badge;
};
export type FooterLinkId =
  | 'features' | 'telephony' | 'pricing' | 'download' | 'changelog'
  | 'docs' | 'botApi' | 'mcp' | 'github'
  | 'contacts' | 'support' | 'form'
  | 'offer' | 'terms' | 'privacy' | 'payments' | 'cookies' | 'license' | 'trademarks';

export type Home = {
  nav: { features: string; telephony: string; developers: string; pricing: string; download: string; openWeb: string };
  hero: {
    title: string;
    /** The tail of the title set in the italic accent (chatdeck-style); must end the title. */
    accent: string;
    lead: string;
    download: string;
    openWeb: string;
    platforms: string;
    /** aria-label of the chip tablist. */
    scenesLabel: string;
    scenes: Tuple<{ key: HeroSceneKey; label: string; caption: string }, 7>;
  };
  replace: {
    title: string;
    lead: string;
    /** Eight «browser tabs» named by category, never by a brand. */
    tabs: Tuple<string, 8>;
    /** The Calab rail on the right: nine sections. */
    rail: Tuple<string, 9>;
    railLabel: string;
  };
  story: {
    title: string;
    lead: string;
    steps: Tuple<{ title: string; text: string; shot: SceneName }, 6>;
    cta: string;
  };
  catalog: {
    title: string;
    lead: string;
    more: string;
    badges: Record<Badge, string>;
    groups: Tuple<{ key: CatalogGroupKey; title: string; tiles: Tile[] }, 4>;
    developers: string;
  };
  telephony: {
    title: string;
    lead: string;
    shots: Tuple<{ shot: SceneName; caption: string }, 3>;
    points: Tuple<string, 6>;
    botTitle: string;
    botText: string;
    plan: string;
    docs: string;
    botApi: string;
  };
  ai: {
    title: string;
    lead: string;
    /** Third tile has no screenshot: a three-line MCP snippet is drawn instead (`shot` is null). */
    tiles: Tuple<{ title: string; text: string; shot: SceneName | null }, 3>;
    plan: string;
  };
  phone: {
    title: string;
    text: string;
    soon: string;
    soonText: string;
    shots: Tuple<SceneName, 3>;
  };
  trust: {
    title: string;
    facts: Tuple<string, 5>;
  };
  pricing: {
    /** `<summary>` of the collapsed comparison table on desktop. */
    compare: string;
    /** The four key rows of a plan card. */
    rows: { members: string; room: string; boards: string; canvases: string };
  };
  faq: {
    items: {
      canvas: { q: string; a: string };
      ai: { q: string; a: string };
    };
  };
  footer: {
    columns: Tuple<{ title: string; links: { id: FooterLinkId; label: string }[] }, 4>;
  };
  /** Alt text of every screenshot, by scene name (§5). */
  alts: Record<SceneName, string>;
};

export const ru: Home = {
  nav: { features: 'Возможности', telephony: 'Телефония', developers: 'Разработчикам', pricing: 'Тарифы', download: 'Скачать', openWeb: 'Открыть в браузере' },
  hero: {
    title: 'Вся работа команды — в одном окне',
    accent: 'в одном окне',
    lead: 'Голосовые комнаты, чат, встречи, задачи, вики, холст, диск, почта и телефония. Всё связано между собой и работает в облаке или на вашем сервере.',
    download: 'Скачать',
    openWeb: 'Открыть в браузере',
    platforms: 'macOS · Windows · Linux · Web · телефон',
    scenesLabel: 'Что внутри Calab',
    scenes: [
      { key: 'voice', label: 'Общение и стримы', caption: 'Зашли в комнату — и уже слышите коллег. Экран, камеры, указка поверх стрима.' },
      { key: 'chat', label: 'Чат', caption: 'Ответы, реакции, голосовые, стикеры. Любое сообщение — в задачу одним действием.' },
      { key: 'tasks', label: 'Задачи', caption: 'Доски с приоритетами, сроками, исполнителями и историей изменений.' },
      { key: 'calendar', label: 'Календарь', caption: 'Встречи со ссылкой на комнату и подбор времени по занятости коллег.' },
      { key: 'wiki', label: 'Вики', caption: 'Страницы, которые команда правит вместе, в реальном времени.' },
      { key: 'canvas', label: 'Холст', caption: 'Онлайн-доска для ретро и схем: стикеры, фигуры, стрелки и голосование — прямо в разговоре.' },
      { key: 'phone', label: 'Телефон', caption: 'Звонок на городской или мобильный номер из голосовой комнаты, перевод коллеге.' },
    ],
  },
  replace: {
    title: 'Вместо семи сервисов — одно окно',
    lead: 'Мессенджер, видеозвонки, трекер задач, вики, онлайн-доска, диск, почта и телефония — у команды обычно это семь вкладок и семь счетов. В Calab это один рейл слева.',
    tabs: ['Мессенджер', 'Видеозвонки', 'Трекер задач', 'Вики', 'Онлайн-доска', 'Диск', 'Почта', 'Телефония'],
    rail: ['Команда', 'Личные', 'Календарь', 'Доски', 'Почта', 'Вики', 'Холст', 'Диск', 'Телефония'],
    railLabel: 'Левый рейл Calab',
  },
  story: {
    title: 'Один день команды — не выходя из окна',
    lead: 'Сообщение становится задачей, у задачи появляется встреча, встреча оставляет запись и расшифровку, итог — на странице вики и на холсте. Всё ссылается друг на друга.',
    steps: [
      { title: 'Из сообщения — в задачу', text: 'Клиент просит выгрузку? Откройте меню сообщения и выберите «Создать задачу» — задача заводится прямо из чата.', shot: 'story-message' },
      { title: 'Задача с чек-листом и согласованием', text: 'Исполнители, срок, чек-лист и согласующий — всё в одной панели задачи.', shot: 'story-task' },
      { title: 'Встреча прямо в комнате', text: 'Событие в календаре открывает голосовую комнату: участникам достаточно нажать «Перейти».', shot: 'story-meeting' },
      { title: 'Запись и расшифровка — в чат', text: 'После встречи в чате комнаты появляется карточка: решения, запись и полный транскрипт.', shot: 'recording-focus' },
      { title: 'Итог — на странице вики', text: 'На странице — план работ и ссылки на задачу и холст. Один клик — и вы на месте.', shot: 'story-wiki' },
      { title: 'Ретро — на холсте', text: 'Ссылка на холст приходит в чат и открывается в один клик. Стикеры и голосование — всей командой.', shot: 'story-canvas' },
    ],
    cta: 'Все возможности',
  },
  catalog: {
    title: 'Что есть в Calab',
    lead: 'Каждый кадр — настоящее приложение в тёмной теме, ничего не дорисовано.',
    more: 'Подробнее',
    badges: { desktop: 'Приложение для компьютера', team: 'С тарифа Team', business: 'С тарифа Business' },
    developers: 'Разработчикам',
    groups: [
      {
        key: 'talk',
        title: 'Общение',
        tiles: [
          { shot: 'voice-panel', title: 'Голосовые комнаты и экран', text: 'Комнаты всегда открыты: зашли — и говорите. Показ экрана, указка и рисование поверх стрима, шумо- и эхоподавление.', anchor: 'voice' },
          { shot: 'gallery', title: 'Видеовстречи', text: 'Все участники одинаковыми плитками, до 25 на экране. Заговоривший сам оказывается на первой странице.', anchor: 'video' },
          { shot: 'chat-focus', title: 'Чат с ответами и реакциями', text: 'Ответы с цитатой, реакции и закреплённые сообщения. Карточка задачи — прямо в ленте.', anchor: 'chat' },
          { shot: 'phone-call-panel', badge: 'business', title: 'Звонки на телефон', text: 'Подключите SIP-провайдера и звоните на любые номера из голосовой комнаты. Перевести звонок коллеге — одна кнопка.', anchor: 'telephony' },
          { shot: 'temp-room', title: 'Временные комнаты и гости', text: 'Ссылка на комнату для встречи с гостями: комната закроется сама в назначенный срок. Гостю не нужен аккаунт.', anchor: 'guests' },
          { shot: 'recording-focus', title: 'Запись и расшифровка', text: 'Запись встречи, короткая сводка и полный текст. Карточка приходит в чат комнаты.', anchor: 'recording' },
        ],
      },
      {
        key: 'work',
        title: 'Работа',
        tiles: [
          { shot: 'kanban-panel', title: 'Доски задач', text: 'Доска, список и таймлайн, приоритеты, метки, сроки и исполнители. Формы, автоматизации и согласования.', anchor: 'boards' },
          { shot: 'taskhistory-panel', title: 'Задача: история и согласование', text: 'Вкладка «История» показывает, кто и что поменял в задаче, по дням.', anchor: 'boards' },
          { shot: 'timeline-panel', title: 'Таймлайн', text: 'Задачи на шкале времени: сроки и пересечения видно сразу.', anchor: 'boards' },
          { shot: 'findtime-panel', title: 'Календарь и подбор времени', text: 'Встречи со ссылкой на комнату, общее окно по занятости коллег, синхронизация CalDAV.', anchor: 'calendar' },
          { shot: 'wiki-focus', title: 'Вики', text: 'Страницы деревом, совместное редактирование, версии и доступ по страницам.', anchor: 'wiki' },
          { shot: 'canvas-panel', title: 'Холст', text: 'Онлайн-доска: стикеры, фигуры, стрелки, голосование и таймер. Курсоры коллег видны сразу.', anchor: 'canvas' },
          { shot: 'disk-panel', title: 'Диск', text: 'Папки и файлы с превью, доступ по папкам, публичные ссылки и корзина.', anchor: 'disk' },
          { shot: 'mail-panel', badge: 'desktop', title: 'Почта', text: 'Gmail, Яндекс, Mail.ru, iCloud или рабочий ящик по IMAP. Письма хранятся на вашем компьютере.', anchor: 'mail' },
        ],
      },
      {
        key: 'order',
        title: 'Порядок и тишина',
        tiles: [
          { shot: 'search', title: 'Поиск ⌘K', text: 'Сообщения, задачи, комментарии, встречи, файлы, заметки и расшифровки — одним запросом.', anchor: 'search' },
          { shot: 'notifyrelay-panel', title: 'Уведомления под контролем', text: 'Уровень для каждой комнаты, «Не беспокоить», триггеры задач и пересылка своему боту.', anchor: 'notifications' },
          { shot: 'roles', title: 'Роли и закрытые комнаты', text: 'Роли с названием и цветом, упоминание всей роли через @. Права роли — для пространства и для каждой комнаты, закрытую комнату видят только приглашённые.', anchor: 'roles' },
          { shot: 'webapps-panel', title: 'Веб-приложения в окне', text: 'CRM, панель продаж или вики открываются внутри Calab, пока звонок продолжается.', anchor: 'webapps' },
        ],
      },
      {
        key: 'smart',
        title: 'Умное',
        tiles: [
          { shot: 'aitask', badge: 'business', title: 'Умная задача', text: 'Опишите задачу текстом и файлами — ИИ выберет доску и оформит задачу. Вы проверите и поправите.', anchor: 'ai' },
          { shot: 'bot-card', title: 'Боты и MCP', text: 'Боты пишут в чат сводки с кнопками. Любой LLM-клиент работает в Calab как бот.', anchor: 'bots' },
        ],
      },
    ],
  },
  telephony: {
    title: 'Телефонная станция в команде',
    lead: 'Подключите SIP-провайдера, и входящие на ваш номер принимают сотрудники прямо в Calab: на компьютере и в веб-версии, в том числе на телефоне. Исходящие набираются из голосовой комнаты.',
    shots: [
      { shot: 'telephony-ivr', caption: 'Голосовое меню: приветствие и маршруты по кнопкам.' },
      { shot: 'telephony-call', caption: 'Активные звонки: кто в голосовом меню, кому звонит группа, кто уже разговаривает.' },
      { shot: 'telephony-groups', caption: 'Группы: звонят все сразу или по очереди, через N секунд — дальше.' },
    ],
    points: [
      'Свой SIP-номер: порты пробрасывать не нужно',
      'Внутренние номера у сотрудников и ботов',
      'Голосовое меню с маршрутами по кнопкам',
      'Группы и переадресация, если никто не ответил',
      'Перевод звонка коллеге',
      'Запись разговоров на Диск команды',
    ],
    botTitle: 'Даже бот может взять трубку',
    botText: 'Бот может сам принять звонок через Bot API — например, ответить голосом и завести задачу. Для этого бот должен обрабатывать звонки в своём коде: готового бота без программирования нет.',
    plan: 'Business и Enterprise. Звонки оплачиваются у вашего SIP-провайдера.',
    docs: 'Как настроить',
    botApi: 'Bot API',
  },
  ai: {
    title: 'AI там, где он экономит время',
    lead: 'Администратор один раз подключает модель в настройках пространства. Без этого AI не работает.',
    tiles: [
      { title: 'Умная задача', text: 'Опишите задачу своими словами и приложите файлы — ИИ выберет доску и оформит задачу, а вы её поправите.', shot: 'aitask' },
      { title: 'Расшифровка встреч', text: 'Сводка и полный текст разговора. Поиск находит слова из расшифровок по всем встречам.', shot: 'recording-transcript' },
      { title: 'Любой LLM через MCP', text: 'Claude или агент в IDE работает в Calab как бот: ищет, читает, ставит задачи и пишет в комнаты.', shot: null },
    ],
    plan: 'AI — с тарифа Business. Расшифровки — через GPTunneL.',
  },
  phone: {
    title: 'Calab на телефоне',
    text: 'Веб-версия на телефоне уже работает: комнаты, чат, голос, доски, календарь и холст — просмотр и правка.',
    soon: 'Скоро',
    soonText: 'Приложения для iPhone и Android: звонки на экране блокировки и push-уведомления.',
    shots: ['phone-rooms', 'phone-voice', 'phone-canvas'],
  },
  trust: {
    title: 'Под вашим контролем',
    facts: [
      'Свой сервер: один docker compose',
      'Данные в вашей стране — вы выбираете хостинг',
      'SSO, Active Directory, роли',
      'Исходный код открыт, BSL 1.1',
      '0,05 % CPU без звонка, ≈ 7 % в голосе',
    ],
  },
  pricing: {
    compare: 'Сравнить все возможности',
    rows: { members: 'Участников', room: 'В комнате', boards: 'Досок', canvases: 'Холстов' },
  },
  faq: {
    items: {
      canvas: {
        q: 'Есть ли онлайн-доска (холст)?',
        a: 'Да. Холст — бесконечная доска со стикерами, фигурами, стрелками, голосованием и таймером; коллеги правят её вместе, курсоры видны. Холсты можно открыть из чата, на телефоне — просмотр и правка. В пространстве: Free — 3 холста, Team — 30, Business — 100, Enterprise — без ограничений.',
      },
      ai: {
        q: 'Что умеет AI и куда уходят данные?',
        a: 'AI доступен с тарифа Business: администратор один раз подключает модель в настройках пространства. «Умная задача» получает текст, имена файлов и названия досок, где вы можете создавать задачи, и оформляет задачу от вашего имени. Расшифровки встреч делает GPTunneL, аудио хранится 30 дней.',
      },
    },
  },
  footer: {
    columns: [
      {
        title: 'Продукт',
        links: [
          { id: 'features', label: 'Возможности' },
          { id: 'telephony', label: 'Телефония' },
          { id: 'pricing', label: 'Тарифы' },
          { id: 'download', label: 'Скачать' },
          { id: 'changelog', label: 'Что нового' },
        ],
      },
      {
        title: 'Разработчикам',
        links: [
          { id: 'docs', label: 'Документация' },
          { id: 'botApi', label: 'Bot API' },
          { id: 'mcp', label: 'MCP' },
          { id: 'github', label: 'GitHub' },
        ],
      },
      {
        title: 'Компания',
        links: [
          { id: 'contacts', label: 'Контакты' },
          { id: 'support', label: 'Поддержка' },
          { id: 'form', label: 'Форма связи' },
        ],
      },
      {
        title: 'Документы',
        links: [
          { id: 'offer', label: 'Оферта' },
          { id: 'terms', label: 'Условия' },
          { id: 'privacy', label: 'Конфиденциальность' },
          { id: 'payments', label: 'Оплата' },
          { id: 'cookies', label: 'Cookies' },
          { id: 'license', label: 'Лицензии' },
          { id: 'trademarks', label: 'Товарные знаки' },
        ],
      },
    ],
  },
  alts: {
    'voice': 'Голосовая комната «Переговорка»: на сцене экран Веры Ким, ниже три камеры, слева участники комнаты и плашка «Голос подключён»',
    'chat-full': 'Чат «#общий»: закреплённое сообщение, ответ с цитатой, голосовое, стикер и карточка задачи APP-7',
    'kanban-full': 'Доска «Продукт» с четырьмя колонками: карточки с приоритетами, метками, сроками и исполнителями',
    'calendar-week': 'Календарь на неделю: события по дням, линия текущего времени и событие с комнатой',
    'wiki-full': 'Вики: дерево страниц и страница «Экспорт в CSV» с обложкой, чек-листом и курсорами двух коллег',
    'canvas': 'Холст «Ретро спринта 12»: стикеры трёх цветов, фигуры, стрелки, голоса, таймер и курсор коллеги',
    'phone-call': 'Звонок на номер +7 916 123-45-67 из голосовой комнаты: плашка звонка с кнопкой «Перевести» и лента чата',
    'story-message': 'Сообщение Веры Ким «Клиент просит экспорт доски в CSV до пятницы» и меню сообщения с пунктом «Создать задачу»',
    'story-task': 'Панель задачи APP-7 «Экспорт доски в CSV»: описание, чек-лист 2 из 4, исполнители, срок 16 января и согласующий',
    'story-meeting': 'Событие «Ревью экспорта CSV» в 15:00 в комнате «Переговорка» с кнопкой «Перейти» и ответами четырёх участников',
    'recording-focus': 'Карточка записанной встречи в чате комнаты: три решения, кнопка воспроизведения и «Полный транскрипт»',
    'story-wiki': 'Страница вики «Экспорт в CSV»: план работ и ссылки на задачу APP-7 и холст «Ретро спринта 12»',
    'story-canvas': 'Карточка холста «Ретро спринта 12» в чате и ответ Дины Лебедевой',
    'voice-panel': 'Сцена голосовой комнаты: Вера Ким показывает экран, внизу панель инструментов',
    'gallery': 'Видеовстреча в режиме «Галерея»: три камеры и плитка с аватаром, говорящий подсвечен',
    'chat-focus': 'Лента чата: закреплённое сообщение, ответ с цитатой и реакцией, карточка задачи APP-7',
    'phone-call-panel': 'Плашка звонка на +7 916 123-45-67 с кнопкой «Перевести» и лента чата',
    'temp-room': 'Комната «Встреча с клиентом» готова: ссылка, кнопка «Скопировать» и дата, когда комната закроется',
    'kanban-panel': 'Доска «Продукт»: колонки «Бэклог», «К работе» и «В работе» с карточками задач',
    'taskhistory-panel': 'Доска и задача на вкладке «История»: кто и когда поменял описание, исполнителей, приоритет и срок, кто согласовал',
    'timeline-panel': 'Таймлайн: задачи на шкале времени, линия сегодняшнего дня и веха «Релиз 1.1»',
    'findtime-panel': 'Подбор времени для четырёх человек: занятость по колонкам и выбранное окно 10:00–10:30',
    'wiki-focus': 'Страница вики «Экспорт в CSV» с обложкой, чек-листом и курсорами двух коллег',
    'canvas-panel': 'Холст «Ретро спринта 12»: стикеры трёх цветов, стрелки, голоса, таймер и курсор коллеги',
    'disk-panel': 'Диск плитками: папки (одна закрытая), файлы с превью и занятое место',
    'mail-panel': 'Открытое письмо «Договор на внедрение Calab — финальная версия» с двумя вложениями',
    'search': 'Окно поиска ⌘K: по запросу найдены заметки, комнаты, сообщения и задачи',
    'notifyrelay-panel': 'Настройки уведомлений о задачах: переключатели по событиям и блок «Передавать боту»',
    'roles': 'Настройки роли «Поддержка»: название, цвет и упоминание роли через @',
    'webapps-panel': 'Панель продаж, открытая внутри Calab из значка в рейле: выручка, сделки и график по неделям',
    'aitask': 'Окно «Умная задача»: описание задачи и два прикреплённых файла',
    'bot-card': 'Сводка бота «Продажи за вчера» с кнопками «Открыть отчёт» и «Напомнить в 18:00»',
    'telephony-ivr': 'Настройки телефонии, вкладка IVR: «Главное меню» с записью и кнопками, «Нерабочее время» и кнопка «Новое меню»',
    'telephony-groups': 'Вкладка «Группы»: «Продажи» — все сразу, переадресация через 20 с, «Поддержка» — по очереди',
    'telephony-call': 'Вкладка «Активные звонки»: три звонка — в голосовом меню, звонит группе «Продажи», разговор с Верой Ким',
    'recording-transcript': 'Окно «Транскрипт встречи» с поиском по слову «эталоны» и двумя найденными репликами',
    'phone-canvas': 'Холст на телефоне в режиме просмотра с кнопкой «Править»',
    'phone-rooms': 'Список комнат на телефоне: последние сообщения и кто сейчас в голосе',
    'phone-voice': 'Карточка «В голосе» на телефоне: три участника и кнопка «Подключиться»',
  },
};

export const homes: Record<Locale, Home> = { ru, en, es, zh };
export const getHome = (locale: Locale): Home => homes[locale];
