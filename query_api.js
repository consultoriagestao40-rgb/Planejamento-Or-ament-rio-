fetch('https://planejamento-or-ament-rio.vercel.app/api/debug-sync')
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(console.error);
