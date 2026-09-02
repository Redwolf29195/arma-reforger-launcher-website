document.documentElement.classList.add('js');

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const header = $('#siteHeader');
const menuButton = $('#menuButton');
const mainNav = $('#mainNav');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let currentRelease = null;

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
    showScreenshot: 'Show {title}'
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
    showScreenshot: 'Показать раздел «{title}»'
  }
};

const staticRussian = {
  'Language': 'Язык',
  'Arma Reforger Launcher — home': 'Arma Reforger Launcher — на главную',
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
  'Mod presets for Arma Reforger': 'Пресеты модов для Arma Reforger',
  'Download for Windows': 'Скачать для Windows',
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
  'Installation options': 'Способ установки',
  'Choose the installer or the portable build for Windows 10/11 x64.': 'Выбери установщик или portable-версию для Windows 10/11 x64.',
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
    image: '/assets/launcher-workshop.png?v=3eda1f9eb8da',
    title: { en: 'Workshop', ru: 'Мастерская' },
    alt: { en: 'Arma Reforger Launcher Workshop', ru: 'Мастерская Arma Reforger Launcher' }
  },
  {
    image: '/assets/launcher-servers.png?v=60c054bebd7c',
    title: { en: 'Servers', ru: 'Серверы' },
    alt: { en: 'Arma Reforger Launcher server browser', ru: 'Список серверов Arma Reforger Launcher' }
  },
  {
    image: '/assets/launcher-mods.png?v=e0e6485f9594',
    title: { en: 'Mods', ru: 'Моды' },
    alt: { en: 'Arma Reforger Launcher mods', ru: 'Моды Arma Reforger Launcher' }
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
    ? 'Arma Reforger Launcher — импорт и запуск пресетов модов'
    : 'Arma Reforger Launcher — import and launch mod presets';
  $('meta[name="description"]').content = language === 'ru'
    ? 'Импортируй JSON-пресеты Arma Reforger, проверяй установленные моды и запускай выбранный набор.'
    : 'Import Arma Reforger JSON presets, check installed mods, and launch the selected set.';
  $('meta[property="og:description"]').content = language === 'ru'
    ? 'Открой пресет, проверь моды и запусти Arma Reforger с выбранным набором.'
    : 'Open a preset, check the mod list, and launch Arma Reforger with the selected set.';
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
  if (currentRelease) {
    setDownloadAvailability('setup', currentRelease.downloads.setup);
    setDownloadAvailability('portable', currentRelease.downloads.portable);
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
  image.src = slide.image;
  image.alt = slide.alt[language];
  $('#launcherGalleryCaption').textContent = `ARMA REFORGER LAUNCHER / ${slide.title[language].toUpperCase()}`;
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

if ('IntersectionObserver' in window) {
  const sectionObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
    if (!visible) return;
    sectionLinks.forEach((link, id) => link.classList.toggle('active', id === visible.target.id));
  }, { rootMargin: '-28% 0px -55% 0px', threshold: [0, 0.2, 0.5] });
  $$('[data-page-section]').forEach((section) => sectionObserver.observe(section));
}

let scrollScheduled = false;
function updateScrollEffects() {
  const scrollTop = window.scrollY;
  header.classList.toggle('is-compact', scrollTop > 24);
  if (!reducedMotion.matches) {
    const shift = Math.min(scrollTop * 0.12, 72);
    document.documentElement.style.setProperty('--hero-shift', `${shift}px`);
  }
  scrollScheduled = false;
}

window.addEventListener('scroll', () => {
  if (scrollScheduled) return;
  scrollScheduled = true;
  window.requestAnimationFrame(updateScrollEffects);
}, { passive: true });
updateScrollEffects();

function formatBytes(bytes) {
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const unit = language === 'ru' ? 'МБ' : 'MB';
  return `${(bytes / 1024 / 1024).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${unit}`;
}

function setDownloadAvailability(type, download) {
  $$(`[data-download="${type}"]`).forEach((link) => {
    link.href = download.url;
    link.classList.toggle('is-disabled', !download.available);
    link.setAttribute('aria-disabled', String(!download.available));
  });
  $$(`[data-release-size="${type}"]`).forEach((element) => {
    element.textContent = formatBytes(download.bytes);
  });
  const releaseRow = $(`[data-release-row="${type}"]`);
  if (releaseRow) releaseRow.dataset.available = String(download.available);
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
    setDownloadAvailability('setup', release.downloads.setup);
    setDownloadAvailability('portable', release.downloads.portable);
    $('#copySetupHash').dataset.copyHash = release.downloads.setup.sha256 || '';
  } catch {
    $('#downloadStatus').textContent = text('releaseError');
  }
}

$$('[data-download]').forEach((link) => {
  link.addEventListener('click', (event) => {
    if (link.classList.contains('is-disabled')) {
      event.preventDefault();
      $('#downloadStatus').textContent = text('unavailable');
      return;
    }
    const label = link.dataset.download === 'setup' ? 'Windows Setup' : 'Portable';
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
