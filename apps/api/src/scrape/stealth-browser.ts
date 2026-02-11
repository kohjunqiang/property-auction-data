import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-site-isolation-trials',
  '--no-first-run',
  '--no-default-browser-check',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--disable-dev-shm-usage',
  '--lang=en-US',
];

const VIEWPORT_PRESETS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
];

interface StealthBrowserResult {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

interface StealthBrowserOptions {
  headless?: boolean;
}

export async function launchStealthBrowser(
  options?: StealthBrowserOptions,
): Promise<StealthBrowserResult> {
  const headless = options?.headless ?? process.env.HEADLESS_MODE !== 'false';
  const viewport = VIEWPORT_PRESETS[Math.floor(Math.random() * VIEWPORT_PRESETS.length)];
  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  const browser = await chromium.launch({
    headless,
    args: STEALTH_ARGS,
  });

  const context = await browser.newContext({
    viewport,
    userAgent,
    locale: 'en-US',
    timezoneId: 'Asia/Kuala_Lumpur',
  });

  // Inject stealth patches before any page navigation (passed as string to avoid Node.js TS DOM errors)
  await context.addInitScript(`(() => {
    // 1. Hide webdriver flag
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // 2. Fake chrome.runtime
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) {
      window.chrome.runtime = { connect: function(){}, sendMessage: function(){} };
    }

    // 3. Fake plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        var plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
        ];
        var arr = Object.create(PluginArray.prototype);
        plugins.forEach(function(p, i) { arr[i] = p; });
        Object.defineProperty(arr, 'length', { get: function() { return plugins.length; } });
        arr.item = function(i) { return plugins[i] || null; };
        arr.namedItem = function(name) { return plugins.find(function(p) { return p.name === name; }) || null; };
        arr.refresh = function() {};
        return arr;
      },
    });

    // 4. Fake languages
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

    // 5. Override permissions.query for notifications
    var originalQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = function(desc) {
      if (desc.name === 'notifications') {
        return Promise.resolve({ state: 'prompt', onchange: null, addEventListener: function(){}, removeEventListener: function(){}, dispatchEvent: function(){ return true; } });
      }
      return originalQuery(desc);
    };

    // 6. Remove automation artifacts from window
    Object.keys(window).forEach(function(key) {
      if (key.startsWith('cdc_') || key.startsWith('__selenium') || key.startsWith('__webdriver')) {
        delete window[key];
      }
    });
  })()`);

  const page = await context.newPage();
  return { browser, context, page };
}

export function humanDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await humanDelay(100, 300);
  await page.click(selector);
  await humanDelay(50, 150);

  for (const char of text) {
    await page.keyboard.type(char, { delay: 0 });
    await humanDelay(50, 150);
  }
}

export async function humanClick(page: Page, selector: string): Promise<void> {
  await humanDelay(200, 800);
  await page.click(selector);
}

export async function scrollPageGradually(page: Page): Promise<void> {
  const totalHeight = (await page.evaluate('document.body.scrollHeight')) as number;
  const viewportHeight = (await page.evaluate('window.innerHeight')) as number;
  let scrolled = 0;

  while (scrolled < totalHeight - viewportHeight) {
    const increment = Math.floor(Math.random() * 300) + 100;
    scrolled = Math.min(scrolled + increment, totalHeight - viewportHeight);

    await page.evaluate(`window.scrollTo(0, ${scrolled})`);
    await humanDelay(200, 600);
  }
}
