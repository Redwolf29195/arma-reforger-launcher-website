document.documentElement.classList.add('js');

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const header = $('#siteHeader');
const menuButton = $('#menuButton');
const mainNav = $('#mainNav');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let currentRelease = null;
let currentDownloadCount = null;
let downloadCountUnavailable = false;

const dynamicText = {
  en: {
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    releaseError: 'Could not verify the release files. Please try again later.',
    unavailable: 'This file is temporarily unavailable.',
    downloadStarted: '{label} download started.',
    hashCopied: 'Setup SHA-256 copied.',
    hashCopyFailed: 'Could not copy the hash.',
    previousScreenshot: 'Previous screenshot',
    nextScreenshot: 'Next screenshot',
    showScreenshot: 'Show {title}',
    downloadCountLabel: 'Launcher downloads',
    downloadCountUnavailable: 'Counter temporarily unavailable'
  },
  ru: {
    openMenu: 'Открыть меню',
    closeMenu: 'Закрыть меню',
    releaseError: 'Не удалось проверить файлы релиза. Повторите попытку позже.',
    unavailable: 'Этот файл временно недоступен.',
    downloadStarted: 'Загрузка {label} началась.',
    hashCopied: 'SHA-256 установщика скопирован.',
    hashCopyFailed: 'Не удалось скопировать хэш.',
    previousScreenshot: 'Предыдущий скриншот',
    nextScreenshot: 'Следующий скриншот',
    showScreenshot: 'Показать раздел «{title}»',
    downloadCountLabel: 'Скачиваний лаунчера',
    downloadCountUnavailable: 'Счётчик временно недоступен'
  }
};

const staticRussian = {
  'Language': 'Язык',
  'ArmaLauncher — home': 'ArmaLauncher — на главную',
  'Main navigation': 'Основная навигация',
  'Interface': 'Интерфейс',
  'How it works': 'Как работает',
  'Features': 'Возможности',
  'Download': 'Скачать',
  'Open menu': 'Открыть меню',
  'Section navigation': 'Навигация по разделам',
  'Home': 'Главная',
  'Presets': 'Пресеты',
  'Control': 'Контроль',
  'A launcher for Arma Reforger': 'Лаунчер для Arma Reforger',
  'Browse servers, manage your mod presets and launch Arma Reforger with the right mod set.': 'Выбирай серверы, управляй пресетами и запускай Arma Reforger с нужным набором модов.',
  'ArmaLauncher brings the server browser, Workshop and installed mods into one desktop app. Keep a preset for each server or group so you can check your mod list before joining a session.': 'ArmaLauncher объединяет список серверов, Workshop и установленные моды в одном приложении. Сохраняй пресеты для разных серверов и групп, чтобы проверять набор модов перед игрой.',
  'Download for Windows': 'Скачать для Windows',
  'Download for Linux': 'Скачать для Linux',
  'Choose your system. Windows has an installer and a portable version. For Ubuntu and Linux Mint, use the DEB package or AppImage. Arma Reforger on Linux requires Steam and Proton.': 'Выбери свою систему. Для Windows есть установщик и portable-версия. Для Ubuntu и Linux Mint — DEB-пакет и AppImage. Для Arma Reforger на Linux нужны Steam и Proton.',
  'Recommended for Ubuntu and Linux Mint': 'Рекомендуется для Ubuntu и Linux Mint',
  'Linux installer': 'Установщик Linux',
  'Installs the launcher and adds it to your applications menu.': 'Устанавливает лаунчер и добавляет его в меню приложений.',
  'Portable Linux version': 'Переносная версия для Linux',
  'Make the file executable to run it. Requires FUSE 2.': 'Разреши выполнение файла, чтобы запустить его. Требуется FUSE 2.',
  'Linux: first launch the game once through Steam with Proton. Launcher updates are installed manually.': 'Linux: сначала один раз запусти игру через Steam с Proton. Обновления лаунчера устанавливаются вручную.',
  'Verify the Windows installer with SHA-256': 'Проверка установщика Windows по SHA-256',
  'Copy Windows installer hash': 'Копировать хэш установщика Windows',
  'Download on GitHub': 'Скачать с GitHub',
  'Source code · GPL-3.0': 'Исходный код · GPL-3.0',
  'Release information': 'Информация о версии',
  'Version': 'Версия',
  '01 / INTERFACE': '01 / ИНТЕРФЕЙС',
  'Launcher interface': 'Интерфейс лаунчера',
  'Launcher screenshot gallery': 'Галерея скриншотов лаунчера',
  'Launcher screenshots': 'Скриншоты лаунчера',
  '02 / PRESETS': '02 / ПРЕСЕТЫ',
  'Launcher features': 'Возможности лаунчера',
  'Add the preset': 'Добавь пресет',
  'Open a JSON file or paste a list from': 'Открой JSON-файл или вставь список из',
  'Check the mods': 'Проверь моды',
  'The launcher flags missing mods and version differences before launch.': 'До запуска лаунчер покажет, каких модов не хватает и где отличаются версии.',
  'Launch Arma Reforger': 'Запусти Арму Рефорджер',
  'Only mods from the selected preset are enabled for this launch.': 'Для этого запуска будут включены только моды из выбранного пресета.',
  '03 / CONTROL': '03 / КОНТРОЛЬ',
  'Works with large libraries.': 'Работает с большой библиотекой.',
  'The scan reads mod metadata without unpacking archives, so checking hundreds of installed mods stays quick.': 'Лаунчер читает данные о модах, не распаковывая архивы. Поэтому проверка большой библиотеки остаётся быстрой.',
  'Saved presets': 'Сохранённые пресеты',
  'Keep separate mod lists for different servers and groups.': 'Храни отдельные наборы для разных серверов и игровых групп.',
  'Dependencies': 'Зависимости',
  'Add known dependencies together with the selected mods.': 'Добавляй известные зависимости вместе с выбранными модами.',
  'Path detection': 'Поиск папок',
  'Steam, Workshop, and profile folders are found automatically.': 'Папки Steam, Workshop и профиля определяются автоматически.',
  'Repair tools': 'Восстановление',
  'Reset launcher data and scan the library again when needed.': 'При необходимости можно сбросить данные лаунчера и проверить библиотеку заново.',
  'Download ArmaLauncher': 'Скачать ArmaLauncher',
  'Get ArmaLauncher for Arma Reforger on Windows 10/11 x64. Choose the installer for shortcuts and a setup wizard, or the portable EXE to run it from any folder. Then open your JSON preset, check the mods and launch the game.': 'Скачай ArmaLauncher для Arma Reforger на Windows 10/11 x64. Установщик создаст ярлыки и поможет выбрать папку, а portable-версия запускается из любого каталога. Затем открой JSON-пресет, проверь моды и запусти игру.',
  'Standard installation': 'Обычная установка',
  'Windows installer': 'Установщик Windows',
  'Creates shortcuts and lets you choose the installation folder.': 'Создаёт ярлыки и позволяет выбрать папку установки.',
  'No installation required': 'Установка не требуется',
  'A standalone EXE that can run from any folder.': 'Отдельный EXE-файл, который запускается из любой папки.',
  'Verify the installer with SHA-256': 'Проверка установщика по SHA-256',
  'Copy installer hash': 'Копировать хэш установщика',
  'Independent community project. Not affiliated with Bohemia Interactive. Arma Reforger and related trademarks belong to their respective owners.': 'Независимый проект сообщества. Не связан с Bohemia Interactive. Arma Reforger и связанные товарные знаки принадлежат их правообладателям.'
};

const originalText = new WeakMap();
const originalAttributes = new WeakMap();
let language = localStorage.getItem('armaLauncherSiteLanguage') === 'ru' ? 'ru' : 'en';

const gallerySlides = [
  {
    image: '/assets/launcher-workshop.webp?v=classic20260909v47',
    width: 1380, height: 850,
    title: { en: 'Workshop', ru: 'Мастерская' },
    alt: { en: 'ArmaLauncher Workshop showing available mods', ru: 'Доступные моды в мастерской ArmaLauncher' }
  },
  {
    image: '/assets/launcher-servers.webp?v=classic20260909v47',
    width: 1380, height: 850,
    title: { en: 'Servers', ru: 'Серверы' },
    alt: { en: 'ArmaLauncher server browser', ru: 'Список серверов ArmaLauncher' }
  },
  {
    image: '/assets/launcher-mods.webp?v=classic20260909v47',
    width: 1380, height: 850,
    title: { en: 'Mods', ru: 'Моды' },
    alt: { en: 'ArmaLauncher installed mod library', ru: 'Установленные моды в ArmaLauncher' }
  }
];
let galleryIndex = 0;

function text(key, parameters = {}) {
  const value = dynamicText[language][key] || dynamicText.en[key] || key;
  return value.replace(/\{(\w+)\}/g, (_match, name) => String(parameters[name] ?? ''));
}

function preserveWhitespace(source, translated) {
  return `${source.match(/^\s*/)?.[0] || ''}${translated}${source.match(/\s*$/)?.[0] || ''}`;
}

function applyLanguage() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (!['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName)) {
      if (!originalText.has(node)) originalText.set(node, node.nodeValue);
      const source = originalText.get(node);
      const key = source.trim();
      node.nodeValue = language === 'ru' && staticRussian[key]
        ? preserveWhitespace(source, staticRussian[key])
        : source;
    }
    node = walker.nextNode();
  }

  $$('[title], [aria-label], [alt]').forEach((element) => {
    if (!originalAttributes.has(element)) {
      originalAttributes.set(element, {
        title: element.getAttribute('title'),
        ariaLabel: element.getAttribute('aria-label'),
        alt: element.getAttribute('alt')
      });
    }
    const source = originalAttributes.get(element);
    for (const [attribute, value] of [['title', source.title], ['aria-label', source.ariaLabel], ['alt', source.alt]]) {
      if (value === null) continue;
      element.setAttribute(attribute, language === 'ru' && staticRussian[value] ? staticRussian[value] : value);
    }
  });

  document.documentElement.lang = language;
  document.title = language === 'ru'
    ? 'ArmaLauncher — лаунчер для Arma Reforger'
    : 'ArmaLauncher — Launcher for Arma Reforger';
  $('meta[name="description"]').content = language === 'ru'
    ? 'Скачай ArmaLauncher для Windows и Linux: выбирай серверы Arma Reforger, импортируй JSON-пресеты, проверяй моды и запускай игру с выбранным набором.'
    : 'Download ArmaLauncher for Windows and Linux. Browse Arma Reforger servers, import JSON mod presets, check installed mods and launch the game with your selected mod set.';
  for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) $(selector).content = document.title;
  for (const selector of ['meta[property="og:description"]', 'meta[name="twitter:description"]']) $(selector).content = $('meta[name="description"]').content;
  $$('[data-language]').forEach((button) => {
    const active = button.dataset.language === language;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  menuButton.title = mainNav.classList.contains('open') ? text('closeMenu') : text('openMenu');
  renderLauncherGallery();
}

function setLanguage(nextLanguage) {
  language = nextLanguage === 'ru' ? 'ru' : 'en';
  localStorage.setItem('armaLauncherSiteLanguage', language);
  applyLanguage();
  renderDownloadCount();
  if (currentRelease) {
    for (const kind of ['setup', 'portable', 'deb', 'appimage']) {
      setDownloadAvailability(kind, currentRelease.downloads?.[kind]);
    }
  }
}

function setMenu(open) {
  mainNav.classList.toggle('open', open);
  document.body.classList.toggle('menu-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.title = open ? text('closeMenu') : text('openMenu');
  menuButton.querySelector('img').src = open ? '/assets/icons/x.svg' : '/assets/icons/menu.svg';
}

menuButton.addEventListener('click', () => setMenu(!mainNav.classList.contains('open')));
$$('#mainNav a').forEach((link) => link.addEventListener('click', () => setMenu(false)));
$$('[data-language]').forEach((button) => {
  button.addEventListener('click', () => setLanguage(button.dataset.language));
});

function renderLauncherGallery() {
  const gallery = $('#launcherGallery');
  if (!gallery) return;
  const slide = gallerySlides[galleryIndex];
  const image = $('#launcherGalleryImage');
  image.width = slide.width;
  image.height = slide.height;
  image.src = slide.image;
  image.alt = slide.alt[language];
  $('#launcherGalleryCaption').textContent = `ArmaLauncher / ${slide.title[language].toUpperCase()}`;
  $('#launcherGalleryCounter').textContent = `${String(galleryIndex + 1).padStart(2, '0')} / ${String(gallerySlides.length).padStart(2, '0')}`;

  const previous = $('#galleryPrevious');
  const next = $('#galleryNext');
  previous.title = text('previousScreenshot');
  previous.setAttribute('aria-label', text('previousScreenshot'));
  next.title = text('nextScreenshot');
  next.setAttribute('aria-label', text('nextScreenshot'));

  $$('[data-gallery-index]').forEach((button, index) => {
    const title = gallerySlides[index].title[language];
    button.textContent = title;
    button.setAttribute('aria-label', text('showScreenshot', { title }));
    button.setAttribute('aria-selected', String(index === galleryIndex));
    button.tabIndex = index === galleryIndex ? 0 : -1;
  });
}

function showGallerySlide(index) {
  galleryIndex = (index + gallerySlides.length) % gallerySlides.length;
  renderLauncherGallery();
}

$('#galleryPrevious')?.addEventListener('click', () => showGallerySlide(galleryIndex - 1));
$('#galleryNext')?.addEventListener('click', () => showGallerySlide(galleryIndex + 1));
$$('[data-gallery-index]').forEach((button) => {
  button.addEventListener('click', () => showGallerySlide(Number(button.dataset.galleryIndex)));
});
$('#launcherGallery')?.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  showGallerySlide(galleryIndex + (event.key === 'ArrowRight' ? 1 : -1));
});

const revealItems = $$('.reveal');
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
  const initialRevealLine = window.innerHeight * 0.96;
  revealItems.forEach((item) => {
    if (item.getBoundingClientRect().top <= initialRevealLine) item.classList.add('is-visible');
    else revealObserver.observe(item);
  });
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

const sectionLinks = new Map(
  $$('[data-section-link]').map((link) => [link.dataset.sectionLink, link])
);

const pageSections = $$('[data-page-section]');

function updateSectionNavigation() {
  if (!pageSections.length) return;
  // Inspect every section: observer entries contain only changed intersections,
  // so they can leave the previous dot selected after a fast or reverse scroll.
  const activationLine = Math.min(window.innerHeight / 2,
    header.getBoundingClientRect().bottom + window.innerHeight * 0.2);
  let currentSection = pageSections[0];
  for (const section of pageSections) {
    if (section.getBoundingClientRect().top > activationLine) break;
    currentSection = section;
  }
  // A short final section cannot always reach the activation line.
  if (window.scrollY > 0
    && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
    currentSection = pageSections[pageSections.length - 1];
  }
  $('.scroll-rail')?.classList.toggle('on-download', currentSection.id === 'download');
  sectionLinks.forEach((link, id) => {
    const active = id === currentSection.id;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}

let scrollScheduled = false;
function updateScrollEffects() {
  const scrollTop = window.scrollY;
  header.classList.toggle('is-compact', scrollTop > 24);
  if (!reducedMotion.matches) {
    const shift = Math.min(scrollTop * 0.12, 72);
    document.documentElement.style.setProperty('--hero-shift', `${shift}px`);
  }
  updateSectionNavigation();
  scrollScheduled = false;
}

function scheduleScrollEffects() {
  if (scrollScheduled) return;
  scrollScheduled = true;
  window.requestAnimationFrame(updateScrollEffects);
}
window.addEventListener('scroll', scheduleScrollEffects, { passive: true });
window.addEventListener('resize', scheduleScrollEffects);
window.addEventListener('pageshow', scheduleScrollEffects);
window.addEventListener('load', scheduleScrollEffects);
if ('ResizeObserver' in window) {
  const layoutObserver = new ResizeObserver(scheduleScrollEffects);
  pageSections.forEach((section) => layoutObserver.observe(section));
}
updateScrollEffects();

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const unit = language === 'ru' ? 'МБ' : 'MB';
  return `${(bytes / 1024 / 1024).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${unit}`;
}

function setDownloadAvailability(type, download) {
  const available = download?.available === true;
  $$(`[data-download="${type}"]`).forEach((link) => {
    link.href = `/get/${type}`;
    link.classList.toggle('is-disabled', !available);
    link.setAttribute('aria-disabled', String(!available));
  });
  $$(`[data-release-size="${type}"]`).forEach((element) => {
    element.textContent = formatBytes(download?.bytes || 0);
  });
  const releaseRow = $(`[data-release-row="${type}"]`);
  if (releaseRow) releaseRow.dataset.available = String(available);
}

async function loadRelease() {
  try {
    const response = await fetch('/api/release', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Release API returned ${response.status}`);
    const release = await response.json();
    currentRelease = release;
    $$('[data-release-version]').forEach((element) => {
      element.textContent = release.version;
    });
    for (const kind of ['setup', 'portable', 'deb', 'appimage']) {
      setDownloadAvailability(kind, release.downloads?.[kind]);
    }
    $('#copySetupHash').dataset.copyHash = release.downloads.setup.sha256 || '';
  } catch {
    $('#downloadStatus').textContent = text('releaseError');
  }
}

function renderDownloadCount() {
  $('#downloadCount').textContent = currentDownloadCount === null ? '—' : currentDownloadCount.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US');
  $('#downloadCountLabel').textContent = text('downloadCountLabel');
  $('#downloadCounter').title = downloadCountUnavailable && currentDownloadCount === null ? text('downloadCountUnavailable') : '';
}

async function loadDownloadCount() {
  try {
    const response = await fetch('/api/download-stats', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Counter unavailable');
    const stats = await response.json();
    if (!Number.isSafeInteger(stats.total) || stats.total < 0 || stats.source !== 'website' || stats.excludesUpdates !== true) throw new Error('Invalid counter');
    currentDownloadCount = stats.total;
    downloadCountUnavailable = false;
  } catch {
    downloadCountUnavailable = true;
  }
  renderDownloadCount();
}

$$('[data-download]').forEach((link) => {
  link.addEventListener('click', (event) => {
    if (link.classList.contains('is-disabled')) {
      event.preventDefault();
      $('#downloadStatus').textContent = text('unavailable');
      return;
    }
    const label = { setup: 'Windows Setup', portable: 'Windows Portable', deb: 'Linux DEB', appimage: 'Linux AppImage' }[link.dataset.download];
    $('#downloadStatus').textContent = text('downloadStarted', { label });
  });
});

async function copyText(value) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

$('#copySetupHash').addEventListener('click', async (event) => {
  try {
    await copyText(event.currentTarget.dataset.copyHash);
    $('#downloadStatus').textContent = text('hashCopied');
  } catch {
    $('#downloadStatus').textContent = text('hashCopyFailed');
  }
});

setLanguage(language);
loadRelease();
loadDownloadCount();
setInterval(() => { if (!document.hidden) loadDownloadCount(); }, 60000);
