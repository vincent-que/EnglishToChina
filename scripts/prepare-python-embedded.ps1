param(
  [string]$Python = "python",
  [string]$Target = "python-embedded",
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$targetPath = [System.IO.Path]::GetFullPath((Join-Path $root $Target))
$requirementsPath = Join-Path $root "requirements.txt"

if (-not $targetPath.StartsWith($root.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to prepare runtime outside project root: $targetPath"
}

if (Test-Path $targetPath) {
  Get-ChildItem -LiteralPath $targetPath -Force | Remove-Item -Recurse -Force
} else {
  New-Item -ItemType Directory -Force -Path $targetPath | Out-Null
}

$pythonExe = (& $Python -c "import sys; print(sys.executable)").Trim()
$pythonPrefix = (& $Python -c "import sys; print(sys.prefix)").Trim()
$pythonVersion = (& $Python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')").Trim()

if (-not (Test-Path $pythonExe)) {
  throw "Python executable not found: $pythonExe"
}

Write-Host "Preparing embedded Python from $pythonExe"
Write-Host "Target: $targetPath"

$targetLib = Join-Path $targetPath "Lib"
$targetSitePackages = Join-Path $targetLib "site-packages"
New-Item -ItemType Directory -Force -Path $targetLib, $targetSitePackages | Out-Null

$coreItems = @("python.exe", "pythonw.exe", "DLLs")

foreach ($item in $coreItems) {
  $source = Join-Path $pythonPrefix $item
  if (Test-Path $source) {
    Copy-Item -Path $source -Destination $targetPath -Recurse -Force
  }
}

$sourceLib = Join-Path $pythonPrefix "Lib"
$excludedLibDirs = @("site-packages", "test", "tkinter", "idlelib", "ensurepip", "__pycache__")
Get-ChildItem -LiteralPath $sourceLib -Force |
  Where-Object { $excludedLibDirs -notcontains $_.Name } |
  Copy-Item -Destination $targetLib -Recurse -Force

Get-ChildItem -Path $pythonPrefix -Filter "python*.dll" -File -ErrorAction SilentlyContinue |
  Copy-Item -Destination $targetPath -Force

Get-ChildItem -Path $pythonPrefix -Filter "vcruntime*.dll" -File -ErrorAction SilentlyContinue |
  Copy-Item -Destination $targetPath -Force

Get-ChildItem -Path (Split-Path $pythonExe) -Filter "*.dll" -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match "^(python|vcruntime|msvcp)" } |
  Copy-Item -Destination $targetPath -Force

$targetPython = Join-Path $targetPath "python.exe"
if (-not (Test-Path $targetPython)) {
  Copy-Item -Path $pythonExe -Destination $targetPython -Force
}

$pthName = "python$($pythonVersion.Replace('.', ''))._pth"
$pthPath = Join-Path $targetPath $pthName
if (Test-Path $pthPath) {
  $pthContent = Get-Content $pthPath
  if ($pthContent -notcontains "import site") {
    Add-Content -Path $pthPath -Value "import site"
  }
}

if (-not $SkipInstall) {
  if (-not (Test-Path $requirementsPath)) {
    throw "requirements.txt not found: $requirementsPath"
  }
  & $Python -m pip install --upgrade --target $targetSitePackages -r $requirementsPath
} else {
  & $Python (Join-Path $PSScriptRoot "copy-python-packages.py") $targetSitePackages
}

Get-ChildItem -LiteralPath $targetPath -Recurse -Directory -Force |
  Where-Object { $_.Name -in @("__pycache__", "tests", "test") } |
  Remove-Item -Recurse -Force

$manifest = @(
  "Python: $pythonVersion",
  "Source: $pythonExe",
  "PreparedAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
  "SkipInstall: $SkipInstall"
)
$manifest | Set-Content -Path (Join-Path $targetPath "RUNTIME-MANIFEST.txt") -Encoding UTF8

& $targetPython -c "import sys; print(sys.executable); import fitz, pdfplumber, docx, reportlab, pdf2docx; print('Python embedded runtime ready')"
