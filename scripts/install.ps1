. (Join-Path $PSScriptRoot 'common.ps1')
Write-Host 'VENDREX usa apenas a biblioteca padrao do Python. Nenhuma dependencia paga sera instalada.'
$python = Find-VendrexPython
Write-Host "Python encontrado: $($python.Executable)"
Invoke-Vendrex -Arguments @('diagnose')
Write-Host 'Diagnostico salvo na base local. Para iniciar: .\Iniciar.cmd'
Write-Host 'Nenhuma tarefa permanente foi registrada. Codex e configurado separadamente com codex login.'
