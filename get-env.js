const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').match(/POSTGRES_PRISMA_URL="(.*?)"/);
console.log(env ? env[1] : 'not found in .env');
