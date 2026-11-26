@echo off
rem Servicio de YouTube de Herramientas. Doble click para abrirlo; cerrar la ventana lo apaga.
title Herramientas - Servicio de YouTube
cd /d "%~dp0"
node server.mjs
pause
