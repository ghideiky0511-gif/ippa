#!/bin/sh
set -eu

# No Render, os dois Web Services são inicializados em paralelo. Antes de
# expor o Next, aguarda o backend concluir o boot; assim o primeiro request
# SSR não tenta montar o TenantProvider com dados ainda indisponíveis.
backend_url="${BACKEND_INTERNAL_URL:-http://backend:3011}"
health_url="${backend_url%/}/api/health"

attempt=1
max_attempts=120
while ! wget -q -T 3 -O /dev/null "$health_url"; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Backend não ficou pronto após ${max_attempts}s; frontend não será exposto sem a API."
    exit 1
  fi
  echo "Aguardando backend (${attempt}/${max_attempts})..."
  attempt=$((attempt + 1))
  sleep 1
done

echo "Backend pronto; iniciando frontend."

exec node server.js
