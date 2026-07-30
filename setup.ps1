[CmdletBinding()]
param([switch]$NonInteractive)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = $PSScriptRoot
function Require-Command([string]$Name) { if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "Required command '$Name' was not found. Install it and run setup again." } }
function Require-Value([string]$Value, [string]$Pattern, [string]$Name) { if ([string]::IsNullOrWhiteSpace($Value) -or $Value -notmatch $Pattern) { throw "Invalid $Name." } }
function Write-NewPrivateFile([string]$Path, [string]$Content) {
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($Content)
    $stream = [IO.FileStream]::new($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
}
function Require-RemotePath([string]$Value) {
    Require-Value $Value '^/[A-Za-z0-9._/-]+$' 'DeployDesk remote path'
    if ($Value.Length -gt 1024 -or @($Value -split '/') -contains '.' -or @($Value -split '/') -contains '..') {
        throw 'Invalid DeployDesk remote path.'
    }
    return $Value
}
function Get-SetupValue(
    [string]$EnvName,
    [string]$Prompt,
    [string]$Pattern,
    [string]$Name,
    [string]$DefaultValue = ''
) {
    $value = [Environment]::GetEnvironmentVariable($EnvName)
    if ([string]::IsNullOrWhiteSpace($value) -and -not $NonInteractive) {
        $suffix = if ($DefaultValue) { " [$DefaultValue]" } else { '' }
        $value = Read-Host ($Prompt + $suffix)
    }
    if ([string]::IsNullOrWhiteSpace($value)) { $value = $DefaultValue }
    Require-Value $value $Pattern $Name
    return $value
}

try {
    Require-Command node; Require-Command npm
    $nodeVersion = [version]((& node -p "process.versions.node").Trim())
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -lt [version]'22.13.0') { throw 'Node.js 22.13 or newer is required.' }
    Push-Location (Join-Path $root 'TodoApp'); npm ci; if ($LASTEXITCODE -ne 0) { throw 'TodoApp dependency installation failed.' }; Pop-Location
    Push-Location (Join-Path $root 'server'); npm ci; if ($LASTEXITCODE -ne 0) { throw 'Server dependency installation failed.' }; Pop-Location
    $envFile = Join-Path $root '.env'
    if (-not (Test-Path -LiteralPath $envFile)) {
        $serverPort = Get-SetupValue 'TODO_SERVER_PORT' 'Application server port' '^[0-9]{1,5}$' 'application server port' '8080'
        $serverPortNumber = 0
        if (-not [int]::TryParse($serverPort, [ref]$serverPortNumber) -or $serverPortNumber -lt 1 -or $serverPortNumber -gt 65535) { throw 'Invalid application server port.' }
        $databaseName = Get-SetupValue 'TODO_MONGO_DB_NAME' 'MongoDB database name' '^[A-Za-z0-9_-]{1,63}$' 'MongoDB database name' 'todoapp'
        $corsOrigins = [Environment]::GetEnvironmentVariable('TODO_CORS_ORIGINS')
        if ($null -eq $corsOrigins -and -not $NonInteractive) { $corsOrigins = Read-Host 'Allowed CORS origins, comma separated (optional)' }
        if ($null -eq $corsOrigins) { $corsOrigins = '' }
        if ($corsOrigins -and $corsOrigins -notmatch '^https?://[A-Za-z0-9._:-]+(?:,https?://[A-Za-z0-9._:-]+)*$') { throw 'Invalid CORS origins.' }
        $environment = @(
            "COMPOSE_PROJECT_NAME=todo-public-local",
            "SERVER_BIND_ADDRESS=127.0.0.1",
            "SERVER_HOST_PORT=$serverPortNumber",
            "SERVER_CONTAINER_PORT=$serverPortNumber",
            "MONGO_DB_NAME=$databaseName",
            "CORS_ORIGINS=$corsOrigins"
        ) -join [Environment]::NewLine
        Write-NewPrivateFile $envFile ($environment + [Environment]::NewLine)
        Write-Host 'Created local .env (configuration values were not displayed).'
    }
    else { Write-Host '.env already exists; it was not changed.' }

    $linkFile = Join-Path $root 'todo-public.deploylink'
    if (-not (Test-Path -LiteralPath $linkFile)) {
        $projectId = Get-SetupValue 'TODO_DEPLOY_PROJECT_ID' 'DeployDesk project id' '^[a-z0-9][a-z0-9_-]{1,63}$' 'DeployDesk project id' 'todo-public-environment'
        $deployHost = Get-SetupValue 'TODO_DEPLOY_HOST' 'DeployDesk host (DNS name or SSH alias)' '^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$' 'DeployDesk host'
        $user = Get-SetupValue 'TODO_DEPLOY_USER' 'DeployDesk SSH user' '^[A-Za-z_][A-Za-z0-9._-]{0,31}$' 'DeployDesk SSH user'
        $sshPort = Get-SetupValue 'TODO_DEPLOY_SSH_PORT' 'DeployDesk SSH port' '^[0-9]{1,5}$' 'DeployDesk SSH port' '22'
        $remotePath = Require-RemotePath (Get-SetupValue 'TODO_DEPLOY_REMOTE_PATH' 'DeployDesk remote Linux path' '^/[A-Za-z0-9._/-]+$' 'DeployDesk remote path')
        $branch = Get-SetupValue 'TODO_DEPLOY_BRANCH' 'DeployDesk Git branch' '^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$' 'DeployDesk branch' 'main'
        $healthPort = Get-SetupValue 'TODO_DEPLOY_HEALTH_PORT' 'Server-local health port' '^[0-9]{1,5}$' 'DeployDesk health port' '8080'
        $healthPath = Get-SetupValue 'TODO_DEPLOY_HEALTH_PATH' 'Server-local health path' '^/[A-Za-z0-9._~%/?=&-]{0,2047}$' 'DeployDesk health path' '/health'
        foreach ($pair in @(@($sshPort,'SSH port'),@($healthPort,'health port'))) { $n=0; if (-not [int]::TryParse($pair[0],[ref]$n) -or $n -lt 1 -or $n -gt 65535) { throw "Invalid $($pair[1])." } }
        $link = [ordered]@{ schemaVersion=2; project=[ordered]@{id=$projectId;name='Todo Public';description='Locally configured deployment target.';accentColor='#4F46E5'}; repository=[ordered]@{remote='origin';branch=$branch}; server=[ordered]@{name='Deployment environment';host=$deployHost;user=$user;sshPort=[int]$sshPort;remotePath=$remotePath;healthCheck=[ordered]@{port=[int]$healthPort;path=$healthPath;expectedStatus=200;attempts=20;intervalSeconds=2}}; runner=[ordered]@{type='powershell';file='deploy/deploy.ps1';protocol='deploydesk-jsonl-v1';arguments=@()}; options=@(); links=@() }
        Write-NewPrivateFile $linkFile (($link | ConvertTo-Json -Depth 8) + [Environment]::NewLine)
        Write-Host 'Created local DeployDesk configuration (target values were not displayed).'
    } else { Write-Host 'todo-public.deploylink already exists; it was not changed.' }
    Write-Host 'Setup completed.'
} catch { Write-Error $_.Exception.Message; exit 1 }
