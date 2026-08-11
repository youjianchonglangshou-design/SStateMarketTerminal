param(
  [Parameter(Mandatory=$true)][string]$WorkerUrl,
  [Parameter(Mandatory=$true)][string]$CallbackToken
)
$ErrorActionPreference = "Stop"
$WorkerUrl = $WorkerUrl.TrimEnd('/')
$headers = @{ Authorization = "Bearer $CallbackToken" }

Write-Host "1/3 Seed active probability_model.json"
Invoke-RestMethod -Method Put -Uri "$WorkerUrl/api/internal/model/active" -Headers $headers -ContentType "application/json" -InFile "engine/models/probability_model.json"

function Seed-Snapshot([string]$market, [string]$path) {
  if (!(Test-Path $path)) { return }
  $run = "seed_" + $market.Replace('-', '_') + "_" + (Get-Date -Format "yyyyMMddHHmmss")
  Write-Host "Seed $market -> $path"
  Invoke-RestMethod -Method Put -Uri "$WorkerUrl/api/internal/snapshot?market=$market&run_id=$run" -Headers $headers -ContentType "application/json" -InFile $path
}

Seed-Snapshot "crypto" "data/bootstrap/snapshot_ai.json"
Seed-Snapshot "us-stock" "data/bootstrap/snapshot_us_stock_ai.json"
Write-Host "R2 seed complete."
