param(
  [string]$VersionName = '1.2.0',
  [int]$VersionCode = 12,
  [string]$SourceRoot,
  [string]$OutputDirectory,
  [Parameter(Mandatory = $true)][string]$CredentialsPath
)
$ErrorActionPreference = 'Stop'
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $SourceRoot) { $SourceRoot = $appRoot }
$SourceRoot = (Resolve-Path -LiteralPath $SourceRoot).Path
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $appRoot 'artifacts/apk' }
if (-not (Test-Path -LiteralPath $CredentialsPath)) { throw 'Die lokale Signaturdatei fehlt. Siehe RELEASE_APK.md.' }
if ($VersionName -notmatch '^[a-zA-Z0-9._-]+$' -or $VersionCode -lt 1) { throw 'Ungültige Versionsangabe.' }
$signing = Get-Content -LiteralPath $CredentialsPath -Raw | ConvertFrom-Json
if ($signing.certificateSha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'certificateSha256 fehlt in der lokalen Signaturdatei oder ist ungültig.' }
if (-not (Test-Path -LiteralPath $signing.keystorePath)) { throw 'Der hinterlegte Signaturschlüssel fehlt.' }
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = Join-Path $env:ProgramFiles 'Android/Android Studio/jbr' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$androidRoot = Join-Path $appRoot 'android'
if (-not (Select-String -LiteralPath (Join-Path $androidRoot 'app/build.gradle') -Pattern '@todo-local-release' -Quiet)) {
  throw 'Bitte zuerst npx expo prebuild --platform android --no-install ausführen.'
}
$names = @('TODO_APK_KEYSTORE', 'TODO_APK_STORE_PASSWORD', 'TODO_APK_KEY_ALIAS', 'TODO_APK_KEY_PASSWORD', 'NODE_ENV')
$savedEnvironment = @{}
foreach ($name in $names) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
  $env:NODE_ENV = 'production'
  $env:TODO_APK_KEYSTORE = $signing.keystorePath
  $env:TODO_APK_STORE_PASSWORD = $signing.storePassword
  $env:TODO_APK_KEY_ALIAS = $signing.keyAlias
  $env:TODO_APK_KEY_PASSWORD = $signing.keyPassword
  Push-Location -LiteralPath $androidRoot
  try {
    & ./gradlew.bat :app:assembleRelease --console=plain --max-workers=2 "-PtodoSourceRoot=$SourceRoot" "-PtodoVersionName=$VersionName" "-PtodoVersionCode=$VersionCode" '-Pexpo.useLegacyPackaging=true'
    if ($LASTEXITCODE -ne 0) { throw 'Der Android-Release-Build ist fehlgeschlagen.' }
  } finally { Pop-Location }
  New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
  $destination = Join-Path $OutputDirectory ("TodoApp-" + $VersionName + ".apk")
  Copy-Item -LiteralPath (Join-Path $androidRoot 'app/build/outputs/apk/release/app-release.apk') -Destination $destination -Force
  $buildTools = Get-ChildItem -LiteralPath (Join-Path $env:ANDROID_HOME 'build-tools') -Directory |
    Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
  $signatureReport = & (Join-Path $buildTools.FullName 'apksigner.bat') verify --verbose --print-certs $destination
  if ($LASTEXITCODE -ne 0) { throw 'Die APK-Signaturprüfung ist fehlgeschlagen.' }
  $signatureReport | Write-Output
  $expectedCertificate = $signing.certificateSha256.ToLowerInvariant()
  $certificateLine = $signatureReport | Where-Object { $_ -match '^Signer #1 certificate SHA-256 digest:' }
  if (-not $certificateLine -or ($certificateLine -split ': ', 2)[1].Trim() -ne $expectedCertificate) {
    throw 'Die APK verwendet nicht das erwartete Signaturzertifikat. Nicht als Update veröffentlichen.'
  }
  $hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText($destination + '.sha256', $hash + '  ' + [IO.Path]::GetFileName($destination) + [Environment]::NewLine)
  Write-Output ("APK: " + $destination)
  Write-Output ("SHA-256: " + $hash)
} finally {
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
  $signing = $null
}
