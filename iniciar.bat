@echo off
title MultiChat OBS Studio
cd /d "%~dp0"
echo ========================================================
echo       INICIANDO MULTICHAT LIVE PARA O OBS STUDIO
echo ========================================================
echo.
echo Abrindo o painel de controle no seu navegador...
start http://localhost:3333
echo.
echo Para adicionar no OBS:
echo 1. No OBS, adicione uma fonte 'Navegador' (Browser)
echo 2. Cole a URL: http://localhost:3333/overlay
echo 3. Largura: 450, Altura: 800
echo.
node server.js
pause
