param([int]$Port = 8766)
$ErrorActionPreference = 'Stop'
$address = "http://127.0.0.1:$Port"
$snapshot = Invoke-RestMethod "$address/api/snapshot"
$headers = @{ 'X-Vendrex-CSRF' = $snapshot.csrf }
Invoke-RestMethod "$address/api/control" -Method Post -ContentType 'application/json' -Headers $headers -Body '{"action":"emergency"}' | Out-Null
Write-Host 'Novas tarefas bloqueadas. A tarefa atual termina em checkpoint seguro. Use Ctrl+C na janela do servidor para encerra-lo.'
