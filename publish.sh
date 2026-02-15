#!/bin/bash
echo "🚀 Iniciando publicação das alterações..."

# Confirma o status
echo "📄 Verificando arquivos..."
git status

# Adiciona qualquer mudança pendente que eu possa ter feito
git add .

# Tenta commitar (se houver algo novo). O '|| true' impede erro se nada mudou.
git commit -m "feat: Automatic deploy from agent script" || true

echo "📦 Enviando para a nuvem (GitHub/Vercel)..."
echo "⚠️  Nota: Se o terminal pedir senha/passphrase, por favor digite."

git push

if [ $? -eq 0 ]; then
    echo "✅ Sucesso! O código foi enviado e o deploy deve começar na Vercel."
else
    echo "❌ O envio falhou. Verifique sua conexão ou credenciais do GitHub."
fi
