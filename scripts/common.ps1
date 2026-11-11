$ErrorActionPreference = 'Stop'
$script:VendrexRoot = Split-Path -Parent $PSScriptRoot

function Find-VendrexPython {
    $candidates = @(
        @{ Name = 'py'; Prefix = @('-3') },
        @{ Name = 'python'; Prefix = @() },
        @{ Name = 'python3'; Prefix = @() }
    )
    foreach ($candidate in $candidates) {
        $command = Get-Command $candidate.Name -ErrorAction SilentlyContinue
        if (-not $command) { continue }
        $prefix = $candidate.Prefix
        try {
            $version = & $command.Source @prefix -c 'import sys; print(int(sys.version_info >= (3, 11)))' 2>$null
            if ($LASTEXITCODE -eq 0 -and "$version".Trim() -eq '1') {
                return @{ Executable = $command.Source; Prefix = $prefix }
            }
        } catch { continue }
    }
    throw 'Python 3.11 ou superior nao encontrado. Instale pelo site python.org e habilite o launcher py.'
}

function Invoke-Vendrex {
    param([string[]]$Arguments)
    $python = Find-VendrexPython
    $prefix = $python.Prefix
    Push-Location $script:VendrexRoot
    try {
        & $python.Executable @prefix (Join-Path $script:VendrexRoot 'run.py') @Arguments
        if ($LASTEXITCODE -ne 0) { throw "VENDREX encerrou com codigo $LASTEXITCODE." }
    } finally { Pop-Location }
}
