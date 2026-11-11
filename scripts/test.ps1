. (Join-Path $PSScriptRoot 'common.ps1')
$python = Find-VendrexPython
$prefix = $python.Prefix
Push-Location $script:VendrexRoot
try {
    & $python.Executable @prefix -m unittest discover -s tests -v
    if ($LASTEXITCODE -ne 0) { throw 'Testes Python falharam.' }
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $env:VENDREX_TEST_PYTHON = (& $python.Executable @prefix -c 'import sys; print(sys.executable)').Trim()
        & node --check dashboard/app.js
        if ($LASTEXITCODE -ne 0) { throw 'Sintaxe JavaScript invalida.' }
        & node tests/test_dashboard.cjs
        if ($LASTEXITCODE -ne 0) { throw 'Verificacao de renderizacao falhou.' }
    }
} finally { Pop-Location }
