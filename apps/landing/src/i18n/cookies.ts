import type { Locale } from './locales';

type CookieCopy = {
  title: string; body: string; allow: string; reject: string; settings: string;
  save: string; close: string; policy: string; necessary: string; necessaryDetail: string;
  language: string; languageDetail: string; analytics: string; analyticsDetail: string; marketing: string;
  inactive: string; future: string; error: string;
};

export const COOKIE_COPY: Record<Locale, CookieCopy> = {
  ru: {
    title: 'Cookies и настройки',
    body: 'Вы решаете, запоминать ли язык сайта и включать ли аналитику. Необходимая запись сохраняет ваш выбор на 180 дней. Реклама не подключена.',
    allow: 'Принять все', reject: 'Только необходимые', settings: 'Настроить',
    save: 'Сохранить выбор', close: 'Закрыть без изменения выбора', policy: 'Политика cookies',
    necessary: 'Необходимые · всегда включены', necessaryDetail: 'Хранят ваш выбор, чтобы соблюдать разрешение или отказ.',
    language: 'Предпочтения', languageDetail: 'Запоминать выбранный язык при следующем посещении.',
    analytics: 'Аналитика', analyticsDetail: 'Яндекс Метрика: посещения, клики и запись сессий, чтобы улучшать сайт.', marketing: 'Маркетинг', inactive: 'Не подключено',
    future: 'Рекламные сервисы мы не подключаем. Если добавим, укажем их здесь и запросим согласие заново. Яндекс Метрика не загружается до вашего согласия; отозвать его можно здесь же.',
    error: 'Браузер не позволил сохранить выбор. Необязательное хранение выключено; ссылки выбора языка работают.',
  },
  en: {
    title: 'Cookies & preferences',
    body: 'Choose whether this site remembers your language and whether analytics is on. A necessary record saves your choice for 180 days. Advertising is not connected.',
    allow: 'Accept all', reject: 'Necessary only', settings: 'Customise',
    save: 'Save choices', close: 'Close without changing choices', policy: 'Cookie policy',
    necessary: 'Necessary · always on', necessaryDetail: 'Remember your choice so we can honour permission or refusal.',
    language: 'Preferences', languageDetail: 'Remember your chosen language on your next visit.',
    analytics: 'Analytics', analyticsDetail: 'Yandex Metrika: visits, clicks and session recordings, so we can improve the site.', marketing: 'Marketing', inactive: 'Not connected',
    future: 'We do not use advertising services. If we add any, we will list them here and ask again. Yandex Metrika does not load before you agree; you can withdraw here at any time.',
    error: 'Your browser could not save this choice. Optional storage stays off; language links still work.',
  },
  es: {
    title: 'Cookies y preferencias',
    body: 'Tú decides si recordamos el idioma y si se activa la analítica. Un registro necesario guarda tu elección durante 180 días. No hay publicidad conectada.',
    allow: 'Aceptar todo', reject: 'Solo necesarias', settings: 'Personalizar',
    save: 'Guardar selección', close: 'Cerrar sin cambiar la selección', policy: 'Política de cookies (EN)',
    necessary: 'Necesarias · siempre activas', necessaryDetail: 'Guardan tu elección para respetar tu permiso o rechazo.',
    language: 'Preferencias', languageDetail: 'Recordar el idioma elegido en tu próxima visita.',
    analytics: 'Analítica', analyticsDetail: 'Yandex Metrika: visitas, clics y grabación de sesiones, para mejorar el sitio.', marketing: 'Marketing', inactive: 'Sin conectar',
    future: 'No usamos servicios de publicidad. Si los añadimos, los indicaremos aquí y pediremos permiso de nuevo. Yandex Metrika no se carga antes de tu consentimiento; puedes retirarlo aquí en cualquier momento.',
    error: 'El navegador no pudo guardar tu elección. El almacenamiento opcional sigue desactivado; los enlaces de idioma funcionan.',
  },
  zh: {
    title: 'Cookie 与偏好设置',
    body: '由你决定是否记住网站语言以及是否启用分析。必要记录会保存你的选择 180 天。未接入广告服务。',
    allow: '全部接受', reject: '仅必要存储', settings: '自定义',
    save: '保存选择', close: '关闭且不更改选择', policy: 'Cookie 政策（英语）',
    necessary: '必要存储 · 始终启用', necessaryDetail: '记录你的选择，以尊重允许或拒绝的决定。',
    language: '偏好设置', languageDetail: '下次访问时记住你选择的语言。',
    analytics: '分析', analyticsDetail: 'Yandex Metrika：访问、点击和会话录制，用于改进网站。', marketing: '营销', inactive: '尚未接入',
    future: '我们不使用广告服务；如接入，会在这里列出并重新征求同意。获得你的同意前不会加载 Yandex Metrika，你可随时在此撤回。',
    error: '浏览器无法保存选择。可选存储保持关闭，语言切换链接仍然可用。',
  },
};
