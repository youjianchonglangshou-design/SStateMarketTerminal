param(
  [Parameter(Mandatory=$false)]
  [string]$WorkerUrl = "https://white-meadow-16bc.youjianchonglangshou.workers.dev",
  [Parameter(Mandatory=$true)]
  [string]$CallbackToken
)

$headers = @{ Authorization = "Bearer $CallbackToken" }
$result = Invoke-RestMethod -Method Post -Uri "$WorkerUrl/api/internal/learning/start" -Headers $headers
$result | ConvertTo-Json -Depth 8
