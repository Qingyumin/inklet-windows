param([string]$ProjectRoot)
$ErrorActionPreference = 'Stop'
$root = if ($ProjectRoot) { $ProjectRoot } else { Split-Path $PSScriptRoot -Parent }
$output = Join-Path $root 'verification'
[void][IO.Directory]::CreateDirectory($output)
$testExe = Join-Path $output 'FileStoreTests.exe'
if (Test-Path $testExe) {
    try { Remove-Item $testExe -Force -ErrorAction Stop }
    catch { $testExe = Join-Path $output ('FileStoreTests-' + $PID + '.exe') }
}
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /codepage:65001 /target:exe /reference:System.Web.Extensions.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /out:"$testExe" "$root\native\FileStore.cs" "$root\native\WorkspaceStore.cs" "$root\native\OpenHistory.cs" "$root\native\RuntimeDiagnostics.cs" "$root\native\ShellIntegration.cs" "$root\native\SpeechService.cs" "$root\native\ResourcePack.cs" "$root\native\FileStoreTests.cs"
if ($LASTEXITCODE -ne 0) { throw 'File store test compilation failed.' }
try {
    & "$testExe"
    if ($LASTEXITCODE -ne 0) { throw 'File store tests failed.' }
} finally {
    if ($testExe -ne (Join-Path $output 'FileStoreTests.exe') -and (Test-Path $testExe)) { Remove-Item $testExe -Force -ErrorAction SilentlyContinue }
}
& $compiler /nologo /target:exe /reference:System.Windows.Forms.dll /out:"$output\NativeSaveDialog.exe" "$root\tools\NativeSaveDialog.cs"
if ($LASTEXITCODE -ne 0) { throw 'Native dialog test helper compilation failed.' }