param([switch]$Authorize)
. (Join-Path $PSScriptRoot 'common.ps1')
Write-Host 'PLANO: registrar duas tarefas do usuario, sem privilegio administrativo.'
Write-Host '1. Vendrex-Local-Dashboard: iniciar painel local ao entrar no Windows.'
Write-Host '2. Vendrex-Local-Queue: verificar eventos a cada minuto, usando fila e trava exclusivas.'
Write-Host 'As rotinas 12h, 18h e 20h usam America/Recife dentro do aplicativo.'
Write-Host 'Nenhuma chamada de IA ocorre sem modelos e saldo. O estado de pausa e preservado.'
if (-not $Authorize) {
    $answer = Read-Host 'Digite SIM para autorizar esse registro permanente'
    if ($answer -cne 'SIM') { Write-Host 'Nada registrado.'; exit 0 }
}
$python = Find-VendrexPython
$prefix = $python.Prefix
$realPython = & $python.Executable @prefix -c 'import sys; print(sys.executable)'
if ($LASTEXITCODE -ne 0) { throw 'Python nao localizado.' }
$realPython = "$realPython".Trim()
$pythonWindowless = Join-Path (Split-Path $realPython) 'pythonw.exe'
if (-not (Test-Path $pythonWindowless)) { $pythonWindowless = $realPython }
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 24) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$runPath = Join-Path $script:VendrexRoot 'run.py'
$dashboardAction = New-ScheduledTaskAction -Execute $pythonWindowless -Argument "`"$runPath`" serve" -WorkingDirectory $script:VendrexRoot
$queueAction = New-ScheduledTaskAction -Execute $pythonWindowless -Argument "`"$runPath`" tick" -WorkingDirectory $script:VendrexRoot
$login = New-ScheduledTaskTrigger -AtLogOn -User $user
$periodic = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'Vendrex-Local-Dashboard' -Action $dashboardAction -Trigger $login -Principal $principal -Settings $settings -Description 'Painel Vendrex local. Pausa e parada no dashboard.' -Force | Out-Null
Register-ScheduledTask -TaskName 'Vendrex-Local-Queue' -Action $queueAction -Trigger $periodic -Principal $principal -Settings $settings -Description 'Fila sequencial e horarios America/Recife. Sem execucao simultanea.' -Force | Out-Null
Write-Host 'Tarefas registradas. Para remover: .\scripts\remove-schedules.ps1'
