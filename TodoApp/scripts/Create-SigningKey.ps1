[CmdletBinding()]
param([string]$Directory = (Join-Path $env:USERPROFILE '.android/todo-public-release'))
$ErrorActionPreference = 'Stop'
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repositoryRoot = (Resolve-Path (Join-Path $appRoot '..')).Path
$keyDirectory = [IO.Path]::GetFullPath($Directory)
if ($keyDirectory -eq $repositoryRoot -or $keyDirectory.StartsWith($repositoryRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Der Signaturschlüssel muss außerhalb des Repositories liegen.' }
New-Item -ItemType Directory -Path $keyDirectory -Force | Out-Null
$credentialsFile = Join-Path $keyDirectory 'signing.json'
$keystoreFile = Join-Path $keyDirectory 'release.p12'
if ((Test-Path -LiteralPath $credentialsFile) -or (Test-Path -LiteralPath $keystoreFile)) { throw 'Hier liegt bereits ein Schlüssel. Für Updates diesen wiederverwenden.' }
$javaRoot = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { Join-Path $env:ProgramFiles 'Android/Android Studio/jbr' }
$keytool = Join-Path $javaRoot 'bin/keytool.exe'
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$password = [Convert]::ToBase64String($bytes)
$previousPassword = $env:TODO_NEW_KEY_PASSWORD
try {
    $env:TODO_NEW_KEY_PASSWORD = $password
    & $keytool '-J-Duser.language=en' -genkeypair -keystore $keystoreFile -storetype PKCS12 -storepass:env TODO_NEW_KEY_PASSWORD -keypass:env TODO_NEW_KEY_PASSWORD -alias todo-public -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Todo Public, O=Todo Contributors'
    if ($LASTEXITCODE -ne 0) { throw 'Signaturschlüssel konnte nicht erstellt werden.' }
    $report = & $keytool '-J-Duser.language=en' -list -v -keystore $keystoreFile -storepass:env TODO_NEW_KEY_PASSWORD -alias todo-public
    if ($LASTEXITCODE -ne 0) { throw 'Zertifikat konnte nicht geprüft werden.' }
    $fingerprint = (($report | Where-Object { $_ -match '^\s*SHA256:' }) -replace '^\s*SHA256:\s*','').Replace(':','').Trim().ToLowerInvariant()
    if ($fingerprint -notmatch '^[a-f0-9]{64}$') { throw 'Zertifikatsfingerabdruck fehlt.' }
    $credentials = @{ keystorePath=$keystoreFile; keyAlias='todo-public'; storePassword=$password; keyPassword=$password; certificateSha256=$fingerprint }
    [IO.File]::WriteAllText($credentialsFile, ($credentials | ConvertTo-Json))
    Write-Host 'Signaturschlüssel erstellt. Verzeichnis privat sichern; für alle späteren Updates wiederverwenden.'
    Write-Host ('Signaturdatei: ' + $credentialsFile)
    Write-Host ('Öffentlicher Zertifikatsfingerabdruck: ' + $fingerprint)
} finally { $env:TODO_NEW_KEY_PASSWORD = $previousPassword; $password = $null; $credentials = $null }
