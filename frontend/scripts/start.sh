#!/bin/sh
set -eu

# O frontend deve subir mesmo quando o backend do Render ainda estiver
# iniciando. Bloquear aqui pela URL pública cria um ciclo de reinicialização
# quando a borda do Render responde 429 às sondagens de disponibilidade.
exec node server.js
