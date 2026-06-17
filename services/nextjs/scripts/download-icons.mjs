import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ICONS_DIR = path.join(__dirname, '../public/assets/icons');
const MAPPING_URL = 'https://prices.runescape.wiki/api/v1/osrs/mapping';
const USER_AGENT = 'OSRSMarketTracker/1.0 (contact: samirkatakamsetty@gmail.com; developer project)';

// Ensure directory exists
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

async function downloadIcon(item, attempt = 1) {
  if (!item.icon) return;
  
  const destPath = path.join(ICONS_DIR, `${item.id}.png`);
  if (fs.existsSync(destPath)) {
    // Skip if already exists
    return { id: item.id, status: 'skipped' };
  }

  // Construct Special:FilePath URL
  const wikiUrl = `https://oldschool.runescape.wiki/w/Special:FilePath/${encodeURIComponent(item.icon)}`;

  try {
    const res = await fetch(wikiUrl, {
      headers: {
        'User-Agent': USER_AGENT
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const buffer = await res.arrayBuffer();
    await fs.promises.writeFile(destPath, Buffer.from(buffer));
    return { id: item.id, status: 'downloaded' };
  } catch (err) {
    if (attempt < 3) {
      const delay = Math.pow(2, attempt) * 1000;
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, delay));
      return downloadIcon(item, attempt + 1);
    } else {
      console.error(`Failed to download icon for item ${item.name} (${item.id}) after 3 attempts:`, err.message);
      return { id: item.id, status: 'failed', error: err.message };
    }
  }
}

async function runPool(items, limit) {
  let active = 0;
  let index = 0;
  let completedCount = 0;
  const total = items.length;
  let downloadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  return new Promise((resolve) => {
    function next() {
      if (index >= total && active === 0) {
        resolve({ downloadedCount, skippedCount, failedCount });
        return;
      }

      while (active < limit && index < total) {
        const item = items[index++];
        active++;
        
        downloadIcon(item)
          .then((res) => {
            if (res) {
              if (res.status === 'downloaded') downloadedCount++;
              if (res.status === 'skipped') skippedCount++;
              if (res.status === 'failed') failedCount++;
            }
          })
          .catch((err) => {
            console.error('Unexpected pool error:', err);
            failedCount++;
          })
          .finally(() => {
            active--;
            completedCount++;
            if (completedCount % 100 === 0 || completedCount === total) {
              console.log(`Progress: ${completedCount}/${total} items processed (Downloaded: ${downloadedCount}, Skipped: ${skippedCount}, Failed: ${failedCount})`);
            }
            next();
          });
      }
    }
    next();
  });
}

async function main() {
  console.log('Fetching item mapping from OSRS Wiki...');
  try {
    const res = await fetch(MAPPING_URL, {
      headers: {
        'User-Agent': USER_AGENT
      }
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch mapping: ${res.statusText}`);
    }
    const items = await res.json();
    console.log(`Found ${items.length} items in mapping. Starting download pool...`);

    const start = Date.now();
    const stats = await runPool(items, 15);
    const duration = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`Download finished in ${duration}s.`);
    console.log(`Stats: Total Downloaded = ${stats.downloadedCount}, Skipped = ${stats.skippedCount}, Failed = ${stats.failedCount}`);
  } catch (err) {
    console.error('Fatal error in downloader:', err);
  }
}

main();
