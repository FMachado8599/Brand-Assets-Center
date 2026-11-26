@echo off
rem Compila ServicioYouTube.exe (la app de la bandeja) con el compilador de C# que ya trae Windows.
rem Queda en worker\youtube, al lado de server.mjs. Si la app está abierta, cerrala antes (Salir).
setlocal
cd /d "%~dp0"
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" (
  echo No encuentro el compilador de C# de .NET Framework 4 en esta PC.
  pause
  exit /b 1
)
"%CSC%" /nologo /codepage:65001 /target:winexe /optimize+ /win32icon:icono.ico /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /out:..\ServicioYouTube.exe ServicioYouTube.cs
if errorlevel 1 (
  echo.
  echo No se pudo compilar. Si dice que el archivo esta en uso, cerra la app ^(Salir^) y volve a probar.
  pause
  exit /b 1
)
echo Listo: worker\youtube\ServicioYouTube.exe
