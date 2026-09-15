[CmdletBinding()]
param(
    [ValidateSet('app','server','developer')][string]$Mode,
    [switch]$NonInteractive,
    [switch]$DeployDesk,
    [switch]$NoStart
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "$Name fehlt. Hinweise: https://github.com/vounder/todo-public#einrichtung" }
}
function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command ist fehlgeschlagen. Die Fehlermeldung steht oben." }
}
Push-Location $PSScriptRoot
try {
    if (-not $Mode) {
        if ($NonInteractive) { $Mode = 'server' }
        else {
            Write-Host "Todo einrichten`n1. Android-App installieren (empfohlen für Nutzer)`n2. Eigenen Server einrichten (Docker)`n3. Am Quellcode entwickeln (Node.js 24 LTS)"
            switch (Read-Host 'Auswahl [1]') { '2' { $Mode='server' } '3' { $Mode='developer' } '' { $Mode='app' } '1' { $Mode='app' } default { throw 'Bitte 1, 2 oder 3 auswählen.' } }
        }
    }
    if ($DeployDesk -and $Mode -ne 'server') { throw 'DeployDesk gehört zum Server-Setup: -Mode server -DeployDesk.' }
    if ($Mode -eq 'app') {
        Write-Host "APK herunterladen: https://github.com/vounder/todo-public/releases/latest`nAuf Android öffnen und installieren. Danach lokal starten oder den QR-Code deines Servers scannen."
        return
    }
    if ($Mode -eq 'developer') {
        Require-Command node; Require-Command npm
        $major = & node -p 'process.versions.node.split(".")[0]'
        if ($LASTEXITCODE -ne 0 -or $major -ne '24') { throw 'Bitte Node.js 24 LTS installieren: https://nodejs.org/en/download' }
        foreach ($folder in @('TodoApp','server')) {
            Push-Location $folder
            try { Invoke-Checked npm @('ci') } finally { Pop-Location }
        }
        Write-Host "Entwicklung bereit: cd TodoApp; npm start`nServer separat: ./setup.ps1 -Mode server"
        return
    }
    Require-Command docker
    Invoke-Checked docker @('info','--format','{{.ServerVersion}}')
    Invoke-Checked docker @('compose','version')
    $envFile = if (Test-Path -LiteralPath '.env') { '.env' } else { '.env.example' }
    Invoke-Checked docker @('compose','--env-file',$envFile,'build','server')
    $oldAddresses = $env:TODO_NETWORK_ADDRESSES
    try {
        if (-not $env:TODO_NETWORK_ADDRESSES) {
            $env:TODO_NETWORK_ADDRESSES = (([Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
                Where-Object { $_.OperationalStatus -eq 'Up' } |
                ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
                Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' } |
                ForEach-Object { $_.Address.IPAddressToString }) -join ',')
        }
        $runArgs = @('compose','--env-file',$envFile,'run','--rm','--no-deps','-T','--volume',($PSScriptRoot + ':/workspace'))
        foreach ($name in @('TODO_NETWORK_ADDRESSES','TODO_BIND_ADDRESS','TODO_SERVER_PORT','TODO_MONGO_DB_NAME','TODO_PUBLIC_URL','TODO_CORS_ORIGINS','TODO_DEPLOY_HOST','TODO_DEPLOY_USER','TODO_DEPLOY_REMOTE_PATH','TODO_DEPLOY_PROJECT_ID','TODO_DEPLOY_BRANCH','TODO_DEPLOY_SSH_PORT','TODO_DEPLOY_HEALTH_PORT')) {
            if ([Environment]::GetEnvironmentVariable($name)) { $runArgs += @('--env',$name) }
        }
        $runArgs += @('server','node','setup/cli.js','--root','/workspace')
        if ($NonInteractive) { $runArgs += '--non-interactive' }
        if ($DeployDesk) { $runArgs += '--deploydesk' }
        Invoke-Checked docker $runArgs
    } finally { $env:TODO_NETWORK_ADDRESSES = $oldAddresses }
    Invoke-Checked docker @('compose','config','--quiet')
    if (-not $NoStart) {
        Invoke-Checked docker @('compose','up','-d','--wait','--wait-timeout','120')
        Write-Host 'Server und Datenbank sind bereit.' -ForegroundColor Green
    }
    Write-Host "Öffne setup-card.local.html und scanne den QR-Code in der App.`nStatus: docker compose ps`nProtokoll: docker compose logs --tail 50 server`nStoppen: docker compose down (Daten bleiben erhalten)."
} catch { Write-Error $_.Exception.Message; exit 1 }
finally { Pop-Location }
