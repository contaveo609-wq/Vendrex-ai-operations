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
        & node tests/test_cloud_config.cjs
        if ($LASTEXITCODE -ne 0) { throw 'Configuracao publica insegura.' }
        & node --test tests/test_growth.mjs tests/test_meta_proxy.mjs tests/test_sales_cloud.mjs tests/test_sales_proxy.mjs tests/test_sales_netlify.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Integracao Meta falhou nos testes controlados.' }
        & node --test sales-gateway/test/gateway.test.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Gateway Sales falhou nos testes controlados. Instale dependencias com npm ci em sales-gateway.' }
        Push-Location cloud
        try {
            & node build.mjs
            if ($LASTEXITCODE -ne 0) { throw 'Build cloud falhou.' }
        } finally { Pop-Location }
    }
} finally { Pop-Location }
