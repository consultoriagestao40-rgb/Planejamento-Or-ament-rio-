require('dotenv').config({ path: '.env.local' });
const { runCronSync } = require('./src/lib/cronSync.js');

async function main() {
  console.log('Starting...');
  try {
     const res = await runCronSync(2026);
     console.log(JSON.stringify(res, null, 2));
  } catch(e) { console.error(e); }
}
main();
