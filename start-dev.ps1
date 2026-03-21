$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting backend on http://localhost:4000 ..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; npm run dev"

Write-Host "Starting frontend on http://localhost:3000 ..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; npm run dev"

Write-Host "Both services started in new terminal windows."
