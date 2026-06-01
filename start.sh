#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "========================================"
echo " Texto a Voz - Frontend + Flask"
echo "========================================"
echo ""

echo "[1/4] Instalando dependencias de Python..."
pip install -r backend/requirements.txt

echo ""
echo "[2/4] Instalando dependencias de Node..."
cd frontend
npm install

echo ""
echo "[3/4] Construyendo frontend React..."
npm run build

cd ..

echo ""
echo "[4/4] Iniciando servidor Flask..."
echo ""
echo "Abre http://localhost:8080 en tu navegador"
echo ""

exec python backend/app.py
