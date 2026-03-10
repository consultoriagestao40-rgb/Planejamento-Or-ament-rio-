const https = require('https');
const t = Date.now();
https.get(`https://planejamento-or-ament-rio.vercel.app/api/debug3?nocache=${t}`, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    try {
      console.log(JSON.stringify(JSON.parse(body), null, 2));
    } catch(e) {
      console.log("Not JSON. First 200 chars:", body.substring(0, 200));
    }
  });
}).on('error', console.error);
