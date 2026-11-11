@echo off
cd /d "%~dp0"
where codex >nul 2>nul
if errorlevel 1 (
  echo Instale o Codex CLI oficial antes de autenticar.
  pause
  exit /b 1
)
codex login
if errorlevel 1 (
  echo Login nao concluido. Consulte docs\INTEGRACOES-V2.3.md.
  pause
  exit /b 1
)
python scripts\verify_codex.py --execute --out runtime\codex-verification.json
pause
