const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));

  console.log("Navigating to localhost:3000...");
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  console.log("Waiting for the page to load...");
  await new Promise(r => setTimeout(r, 2000));

  console.log("Looking for Top Movers table VIEW buttons...");
  const buttons = await page.$$('button');
  let viewButton = null;
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text.trim() === 'VIEW') {
      viewButton = btn;
      break;
    }
  }

  if (viewButton) {
    console.log("Clicking VIEW button...");
    await viewButton.click();
    await new Promise(r => setTimeout(r, 2000));
    console.log("Clicked and waited 2 seconds.");
  } else {
    console.log("No VIEW button found!");
  }

  await browser.close();
})();
