@echo off
setlocal
cd /d "%~dp0.."
echo Starting dev server (reloads the browser when you save). Press Ctrl+C to stop.
call npm run game
