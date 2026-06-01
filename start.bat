@echo off
cd /d "%~dp0"

echo ========================================
echo  Texto a Voz - Frontend + Flask
echo ========================================
echo.

echo [1/4] Instalando dependencias de Python...
pip install -r backend\requirements.txt
if %errorlevel% neq 0 (
    echo Error instalando dependencias Python
    pause
    exit /b %errorlevel%
)

echo.
echo [2/4] Instalando dependencias de Node...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo Error instalando dependencias Node
    pause
    exit /b %errorlevel%
)

echo.
echo [3/4] Construyendo frontend React...
call npm run build
if %errorlevel% neq 0 (
    echo Error construyendo frontend
    pause
    exit /b %errorlevel%
)

cd ..

echo.
echo [4/4] Iniciando servidor Flask...
echo.
echo Abre http://localhost:8080 en tu navegador
echo.
python backend\app.py

pause
