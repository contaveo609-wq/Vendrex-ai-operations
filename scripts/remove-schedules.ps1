$ErrorActionPreference = 'Stop'
foreach ($taskName in @('Vendrex-Local-Dashboard','Vendrex-Local-Queue')) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Host "Removida: $taskName"
    }
}
Write-Host 'Arquivos, banco e backups preservados. Use a parada do painel para impedir novas tarefas.'
