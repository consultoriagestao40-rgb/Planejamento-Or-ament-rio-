curl "https://planejamento-or-ament-rio.vercel.app/api/debug-ca?costCenterId=572262ec-5b2b-11f0-be76-0ff178060de5" | jq -r '
  .payables.itemsMatch[] | 
  "PAGAR | ID: \(.id) | Val: \(.valor) | Cat: \(.categorias[0].nome)"
'
curl "https://planejamento-or-ament-rio.vercel.app/api/debug-ca?costCenterId=572262ec-5b2b-11f0-be76-0ff178060de5" | jq -r '
  .receivables.itemsMatch[] | 
  "RECEBER | ID: \(.id) | Val: \(.valor) | Cat: \(.categorias[0].nome)"
'
