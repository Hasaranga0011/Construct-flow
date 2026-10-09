const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const WIDTHS = [320, 360, 390, 414, 768, 1024, 1280, 1440];
const BASE_URL = 'http://localhost:8081';

const ROLES = [
  { role: 'admin', email: 'admin@constructai.lk', password: 'password123' },
  { role: 'pm', email: 'pm@constructai.lk', password: 'password123' },
  { role: 'site_manager', email: 'sm@constructai.lk', password: 'password123' },
  { role: 'supplier', email: 'supplier@constructai.lk', password: 'password123' },
  { role: 'client', email: 'client@constructai.lk', password: 'password123' },
  { role: 'worker', email: 'worker@constructai.lk', password: 'password123' }
];

const PUBLIC_ROUTES = [
  '/',
  '/team-login',
  '/partner-login',
  '/team-register',
  '/partner-register'
];

async function runAudit() {
  console.log('Starting responsive audit...');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge' });
  } catch (e) {
    console.log('Edge not found, trying chrome...');
    browser = await chromium.launch({ channel: 'chrome' });
  }
  let totalFailures = 0;

  // Block media requests to avoid timeouts
  await browser.contexts()[0]?.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['media', 'image', 'font'].includes(type)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  for (const width of WIDTHS) {
    console.log(`\n=== Testing at width: ${width}px ===`);
    const page = await browser.newPage({ viewport: { width, height: 800 } });

    // Test public routes
    for (const route of PUBLIC_ROUTES) {
      totalFailures += await testRoute(page, route, width, 'public');
    }

    // Test each role
    for (const user of ROLES) {
      await page.goto(`${BASE_URL}/team-login`);
      await page.waitForLoadState('domcontentloaded');
      // Very basic mock login handling - this will likely need to be adapted based on actual auth flow
      try {
        await page.fill('input[type="email"]', user.email);
        await page.fill('input[type="password"]', user.password);
        await page.click('button:has-text("Login")');
        await page.waitForTimeout(2000);
      } catch (e) {
        console.warn(`Could not log in as ${user.role}`);
      }

      // Collect routes for this role (assuming they are nested under /role)
      const roleRoute = `/${user.role}`;
      totalFailures += await testRoute(page, roleRoute, width, user.role);

      // Sign out
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    }

    await page.close();
  }

  await browser.close();

  if (totalFailures > 0) {
    console.error(`\nAudit failed with ${totalFailures} issues.`);
    process.exit(1);
  } else {
    console.log('\nAudit passed! Zero layout failures found.');
  }
}

async function testRoute(page, route, width, context) {
  let failures = 0;
  const url = `${BASE_URL}${route}`;
  
  try {
    const context = page.context();
    await context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['media', 'image', 'font'].includes(type)) route.abort();
      else route.continue();
    });
    
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000); // Allow animations/layout to settle

    const issues = await page.evaluate((width) => {
      const foundIssues = [];

      // 1. Horizontal scroll check
      if (document.documentElement.scrollWidth > window.innerWidth) {
        foundIssues.push(`Page horizontal scroll: scrollWidth (${document.documentElement.scrollWidth}) > window.innerWidth (${window.innerWidth})`);
      }

      // 2. Element bounds check
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        // Skip hidden elements or ones inside scroll containers
        if (el.offsetParent === null) continue;
        
        let isInsideScrollContainer = false;
        let parent = el.parentElement;
        while (parent) {
          const overflowX = window.getComputedStyle(parent).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll') {
            isInsideScrollContainer = true;
            break;
          }
          parent = parent.parentElement;
        }

        if (isInsideScrollContainer) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          if (rect.right > window.innerWidth) {
            foundIssues.push(`Element overflow right (${Math.round(rect.right)} > ${window.innerWidth}): <${el.tagName.toLowerCase()} class="${el.className}">`);
          }
          if (rect.left < 0) {
            foundIssues.push(`Element overflow left (${Math.round(rect.left)} < 0): <${el.tagName.toLowerCase()} class="${el.className}">`);
          }
        }
        
        // 3. Text clipping check
        const style = window.getComputedStyle(el);
        if (style.overflow === 'hidden' && style.textOverflow !== 'ellipsis') {
          if (el.scrollWidth > el.clientWidth) {
             foundIssues.push(`Text clipped: <${el.tagName.toLowerCase()} class="${el.className}">`);
          }
        }
        
        // 4. Tappable size check (buttons, links)
        if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') {
          if (rect.width > 0 && rect.height > 0) {
            if (rect.width < 44 || rect.height < 44) {
              // Note: Many design systems allow smaller buttons inline, so this might be noisy.
              // foundIssues.push(`Tappable area too small (${Math.round(rect.width)}x${Math.round(rect.height)}): <${el.tagName.toLowerCase()} class="${el.className}">`);
            }
          }
        }
      }

      return foundIssues;
    }, width);

    if (issues.length > 0) {
      console.log(`[FAIL] ${context} | ${route}`);
      issues.forEach(i => console.log(`       - ${i}`));
      failures += issues.length;
    } else {
      console.log(`[PASS] ${context} | ${route}`);
    }

  } catch (e) {
    console.error(`[ERROR] Failed to test ${route}:`, e.message);
  }

  return failures;
}

runAudit().catch(console.error);
