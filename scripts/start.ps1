param([switch]$Demo, [int]$Port = 8766)
. (Join-Path $PSScriptRoot 'common.ps1')
$arguments = @('serve', '--open', '--port', "$Port")
if ($Demo) { $arguments += '--demo' }
Invoke-Vendrex -Arguments $arguments
