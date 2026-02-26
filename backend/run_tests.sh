#!/bin/bash
# run_tests.sh

echo "🚀 Iniciando suite de pruebas para Jackpot Jockeys..."

# Asegurarse de que el stack está arriba (opcional, depende de si el usuario lo prefiere manual)
# docker compose up -d db api

# Ejecutar pytest
# -v: verbose
# -s: mostrar prints
# -q: modo silencioso (opcional)
pytest -v -s tests/

echo "✅ Pruebas finalizadas."
