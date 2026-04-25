const fs = require('fs');
const path = require('path');

const INPUT = path.resolve(__dirname, '..', 'food_items_with_image_urls_20000.csv');
const OUTPUT = path.resolve(__dirname, '..', 'food_items_with_image_urls_20000_resolved.csv');
const MAP = path.resolve(__dirname, '..', 'server', 'foodImageMap.json');

const CONCURRENCY = 6;

async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function resolveUrl(url){
  try{
    // Use global fetch (Node 18+). Use HEAD first to follow redirects and get final URL.
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    // Some servers may not support HEAD - fallback to GET
    if (res.status >= 400) {
      const res2 = await fetch(url, { method: 'GET', redirect: 'follow' });
      return res2.url || url;
    }
    return res.url || url;
  }catch(err){
    return url;
  }
}

(async ()=>{
  if (!fs.existsSync(INPUT)){
    console.error('Input CSV not found at', INPUT);
    process.exit(1);
  }
  const text = fs.readFileSync(INPUT, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines.shift();
  const rows = lines.map(l => {
    // naive split by first two commas (id,food_name,image_url)
    const parts = l.split(',');
    const id = parts.shift();
    const image_url = parts.pop();
    const food_name = parts.join(',');
    return { id, food_name, image_url };
  });

  console.log('Rows to process:', rows.length);

  const outLines = [header];
  const map = fs.existsSync(MAP) ? JSON.parse(fs.readFileSync(MAP,'utf8')) : {};

  let i = 0;
  const queue = [];
  for (const row of rows){
    const job = (async (r, idx)=>{
      const orig = r.image_url;
      if (!orig || orig.trim() === ''){
        outLines.push(`${r.id},${r.food_name},${orig}`);
        return;
      }
      // Only attempt to resolve source.unsplash.com redirects
      let final = orig;
      if (/source\.unsplash\.com/i.test(orig)){
        try{
          final = await resolveUrl(orig);
          // small pause to be gentle
          await sleep(120);
        }catch(e){ final = orig; }
      }
      outLines.push(`${r.id},${r.food_name},${final}`);

      // update map for normalized key
      const key = r.food_name.trim().toLowerCase();
      map[key] = final;
      if ((idx+1) % 100 === 0) console.log('Processed', idx+1);
    })(row, i);
    queue.push(job);
    i++;
    if (queue.length >= CONCURRENCY){
      await Promise.all(queue.splice(0));
    }
  }
  // wait remaining
  if (queue.length) await Promise.all(queue);

  fs.writeFileSync(OUTPUT, outLines.join('\n'), 'utf8');
  fs.writeFileSync(MAP, JSON.stringify(map, null, 2), 'utf8');
  console.log('Wrote resolved CSV to', OUTPUT);
  console.log('Updated map at', MAP);
})();
