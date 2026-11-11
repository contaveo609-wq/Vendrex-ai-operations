. (Join-Path $PSScriptRoot 'common.ps1')
Write-Host 'Executando missoes reais. FFmpeg, ffprobe, Node.js, Git e Pillow sao necessarios.'
Write-Host 'Serao gerados calculadora, dois videos de 32s, leads publicos e aula interna. Nenhuma mensagem externa sera enviada.'
Invoke-Vendrex -Arguments @('missions','--data',(Join-Path $script:VendrexRoot 'runtime-missions'))
