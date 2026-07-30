[CmdletBinding()]
param(
    [string]$DeployLinkPath,
    [switch]$NonInteractive,
    [switch]$SkipLocalGit,
    [switch]$ValidateOnly,
    [string]$CommitMessage,
    [ValidateSet('Text', 'JsonLines')]
    [string]$OutputFormat = 'Text'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$script:ErrorEmitted = $false
$script:EmptyHooksPath = $null

function Write-DeployEvent {
    param([ValidateSet('step','success','warning','error','completed')][string]$Type, [string]$Message)
    if ($OutputFormat -eq 'JsonLines') {
        [pscustomobject]@{ type = $Type; message = $Message } | ConvertTo-Json -Compress | Write-Output
    } else {
        Write-Host ('[{0}] {1}' -f $Type.ToUpperInvariant(), $Message)
    }
}

function Fail-Deploy {
    param([string]$Message)
    $script:ErrorEmitted = $true
    Write-DeployEvent error $Message
    throw $Message
}

function Test-WithinRoot {
    param([string]$Path, [string]$Root)
    $prefix = $Root.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    return $Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
}

function Assert-NoReparsePoint {
    param([string]$Path, [string]$Root)
    $current = Get-Item -LiteralPath $Path -Force
    while ($true) {
        if (($current.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            Fail-Deploy 'DeployLink and runner paths must not contain symlinks or junctions.'
        }
        if ($current.FullName -eq $Root) { break }
        $parent = Split-Path -Parent $current.FullName
        if ([string]::IsNullOrWhiteSpace($parent) -or -not (Test-WithinRoot ($parent + [IO.Path]::DirectorySeparatorChar) $Root)) { break }
        $current = Get-Item -LiteralPath $parent -Force
    }
}

function Require-Match {
    param([string]$Value, [string]$Pattern, [string]$Name, [int]$MaxLength = 0)
    if ([string]::IsNullOrWhiteSpace($Value) -or ($MaxLength -gt 0 -and $Value.Length -gt $MaxLength) -or $Value -notmatch $Pattern) {
        Fail-Deploy "Invalid $Name in DeployLink."
    }
}

function Require-String {
    param($Value, [string]$Pattern, [string]$Name, [int]$MaxLength = 0)
    if ($Value -isnot [string]) { Fail-Deploy "$Name must be a string in DeployLink." }
    Require-Match $Value $Pattern $Name $MaxLength
}

function Require-Integer {
    param($Value, [string]$Name, [int]$Minimum, [int]$Maximum)
    if ($Value -isnot [byte] -and $Value -isnot [int16] -and $Value -isnot [int32] -and $Value -isnot [int64]) {
        Fail-Deploy "$Name must be an integer in DeployLink."
    }
    $number = [int64]$Value
    if ($number -lt $Minimum -or $number -gt $Maximum) { Fail-Deploy "Invalid $Name in DeployLink." }
    return [int]$number
}

function Assert-ObjectShape {
    param($Object, [string[]]$Required, [string[]]$Allowed, [string]$Name)
    if ($null -eq $Object -or $Object -isnot [pscustomobject]) { Fail-Deploy "$Name must be an object in DeployLink." }
    $properties = @($Object.PSObject.Properties.Name)
    foreach ($property in $properties) {
        if ($Allowed -cnotcontains $property) { Fail-Deploy "Unknown property '$property' in $Name." }
    }
    foreach ($property in $Required) {
        if ($properties -cnotcontains $property) { Fail-Deploy "Missing property '$property' in $Name." }
    }
}

function Assert-NoDuplicateJsonProperties {
    param([string]$Json)
    $tokenPattern = '"(?:\\.|[^"\\])*"|[{}\[\]:,]|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?'
    $tokens = @([regex]::Matches($Json, $tokenPattern) | ForEach-Object { $_.Value })
    $stack = [Collections.ArrayList]::new()
    for ($index = 0; $index -lt $tokens.Count; $index++) {
        $token = $tokens[$index]
        if ($token -eq '{') {
            [void]$stack.Add([pscustomobject]@{
                Kind = 'object'
                Keys = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
            })
            continue
        }
        if ($token -eq '[') {
            [void]$stack.Add([pscustomobject]@{ Kind = 'array'; Keys = $null })
            continue
        }
        if ($token -eq '}' -or $token -eq ']') {
            if ($stack.Count -gt 0) { $stack.RemoveAt($stack.Count - 1) }
            continue
        }
        if ($token.StartsWith('"') -and $index + 1 -lt $tokens.Count -and $tokens[$index + 1] -eq ':' -and
            $stack.Count -gt 0 -and $stack[$stack.Count - 1].Kind -eq 'object') {
            $key = (('{"value":' + $token + '}') | ConvertFrom-Json).value
            if (-not $stack[$stack.Count - 1].Keys.Add([string]$key)) {
                Fail-Deploy "Duplicate JSON property '$key'."
            }
        }
    }
}

function Quote-Posix {
    param([string]$Value)
    return "'" + $Value.Replace("'", "'`"`"'`"`'") + "'"
}

function Invoke-Native {
    param([string]$File, [string[]]$Arguments, [string]$Description)
    if ($OutputFormat -eq 'JsonLines') { & $File @Arguments 2>$null | Out-Null } else { & $File @Arguments }
    if ($LASTEXITCODE -ne 0) { Fail-Deploy "$Description failed." }
}

function Invoke-Git {
    param([string[]]$Arguments, [string]$Description)
    Invoke-Native 'git' (@('-c', "core.hooksPath=$script:EmptyHooksPath") + $Arguments) $Description
}

try {
    $repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
    $runnerPath = (Resolve-Path -LiteralPath $PSCommandPath).Path
    if (-not (Test-WithinRoot $runnerPath $repoRoot)) { Fail-Deploy 'Runner resolves outside the repository.' }
    Assert-NoReparsePoint $runnerPath $repoRoot

    if ([string]::IsNullOrWhiteSpace($DeployLinkPath)) {
        $links = @(Get-ChildItem -LiteralPath $repoRoot -Filter '*.deploylink' -File)
        if ($links.Count -ne 1) { Fail-Deploy 'Specify -DeployLinkPath; exactly one root .deploylink is required for discovery.' }
        $DeployLinkPath = $links[0].FullName
    }
    $resolvedLink = (Resolve-Path -LiteralPath $DeployLinkPath).Path
    if (-not (Test-WithinRoot $resolvedLink $repoRoot)) { Fail-Deploy 'DeployLink must resolve inside the repository.' }
    Assert-NoReparsePoint $resolvedLink $repoRoot

    $rawConfig = [IO.File]::ReadAllText($resolvedLink, [Text.Encoding]::UTF8)
    Assert-NoDuplicateJsonProperties $rawConfig
    $config = $rawConfig | ConvertFrom-Json

    Assert-ObjectShape $config @('schemaVersion','project','repository','server','runner') @('$schema','schemaVersion','project','repository','server','runner','options','links') 'root'
    if ($config.schemaVersion -isnot [int64] -and $config.schemaVersion -isnot [int32]) { Fail-Deploy 'schemaVersion must be the integer 2.' }
    if ([int64]$config.schemaVersion -ne 2) { Fail-Deploy 'schemaVersion 2 is required.' }

    Assert-ObjectShape $config.project @('id','name') @('id','name','description','icon','accentColor') 'project'
    Assert-ObjectShape $config.repository @('remote','branch') @('remote','branch') 'repository'
    Assert-ObjectShape $config.server @('host','user','sshPort','remotePath','healthCheck') @('name','host','user','sshPort','remotePath','healthCheck') 'server'
    Assert-ObjectShape $config.server.healthCheck @('port','path') @('port','path','expectedStatus','attempts','intervalSeconds') 'server.healthCheck'
    Assert-ObjectShape $config.runner @('type','file','protocol') @('type','file','protocol','arguments') 'runner'

    Require-String $config.project.id '^[a-z0-9][a-z0-9_-]{1,63}$' 'project id' 64
    Require-String $config.project.name '^.{1,120}$' 'project name' 120
    if ($config.project.PSObject.Properties.Name -ccontains 'description') { Require-String $config.project.description '^.{0,2000}$' 'project description' 2000 }
    if ($config.project.PSObject.Properties.Name -ccontains 'icon') { Require-String $config.project.icon '^.*$' 'project icon' }
    if ($config.project.PSObject.Properties.Name -ccontains 'accentColor') { Require-String $config.project.accentColor '^#[0-9A-Fa-f]{6}$' 'project accent color' 7 }
    Require-String $config.repository.remote '^[A-Za-z0-9][A-Za-z0-9._/-]*$' 'repository remote'
    Require-String $config.repository.branch '^[A-Za-z0-9][A-Za-z0-9._/-]*$' 'repository branch' 255
    if ($config.server.PSObject.Properties.Name -ccontains 'name') { Require-String $config.server.name '^.{1,40}$' 'server name' 40 }
    Require-String $config.server.host '^[A-Za-z0-9._-]+$' 'server host' 253
    Require-String $config.server.user '^[A-Za-z_][A-Za-z0-9._-]{0,31}$' 'server user'
    Require-String $config.server.remotePath '^/[A-Za-z0-9._/-]+$' 'remote path' 1024
    if (@([string]$config.server.remotePath -split '/') -contains '..' -or @([string]$config.server.remotePath -split '/') -contains '.') {
        Fail-Deploy 'Remote path must not contain dot segments.'
    }
    Require-String $config.server.healthCheck.path '^/[A-Za-z0-9._~%/?=&-]{0,2047}$' 'health path' 2048
    Require-String $config.runner.type '^powershell$' 'runner type' 10
    Require-String $config.runner.file '^deploy/deploy\.ps1$' 'runner file' 1024
    Require-String $config.runner.protocol '^deploydesk-jsonl-v1$' 'runner protocol' 64
    if ($config.runner.type -ne 'powershell' -or $config.runner.protocol -ne 'deploydesk-jsonl-v1' -or $config.runner.file -ne 'deploy/deploy.ps1') {
        Fail-Deploy 'Unsupported runner configuration.'
    }
    if ($config.runner.PSObject.Properties.Name -ccontains 'arguments') {
        if ($config.runner.arguments -isnot [array]) { Fail-Deploy 'Runner arguments must be an array.' }
        if (@($config.runner.arguments).Count -ne 0) { Fail-Deploy 'Static runner arguments are not supported.' }
    }
    foreach ($arrayProperty in @('options','links')) {
        if ($config.PSObject.Properties.Name -ccontains $arrayProperty) {
            if ($config.$arrayProperty -isnot [array]) { Fail-Deploy "$arrayProperty must be an array." }
            if (@($config.$arrayProperty).Count -ne 0) { Fail-Deploy "This runner supports only an empty $arrayProperty array." }
        }
    }

    $sshPort = Require-Integer $config.server.sshPort 'SSH port' 1 65535
    $healthPort = Require-Integer $config.server.healthCheck.port 'health port' 1 65535
    $expectedStatus = if ($config.server.healthCheck.PSObject.Properties.Name -ccontains 'expectedStatus') { Require-Integer $config.server.healthCheck.expectedStatus 'expected status' 100 599 } else { 200 }
    $attempts = if ($config.server.healthCheck.PSObject.Properties.Name -ccontains 'attempts') { Require-Integer $config.server.healthCheck.attempts 'health attempts' 1 120 } else { 20 }
    $interval = if ($config.server.healthCheck.PSObject.Properties.Name -ccontains 'intervalSeconds') { Require-Integer $config.server.healthCheck.intervalSeconds 'health interval' 1 60 } else { 2 }

    & git check-ref-format --branch ([string]$config.repository.branch) 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail-Deploy 'Invalid repository branch in DeployLink.' }
    foreach ($program in @('git','ssh')) {
        if ($null -eq (Get-Command $program -ErrorAction SilentlyContinue)) { Fail-Deploy "Required executable '$program' was not found." }
    }
    Write-DeployEvent success 'DeployLink and local prerequisites validated.'
    if ($ValidateOnly) {
        Write-DeployEvent warning 'Validation completed; no deployment actions were performed.'
        exit 0
    }

    $script:EmptyHooksPath = Join-Path ([IO.Path]::GetTempPath()) ('todo-public-empty-hooks-' + [guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($script:EmptyHooksPath) | Out-Null
    $env:GIT_TERMINAL_PROMPT = '0'
    $env:GCM_INTERACTIVE = 'Never'
    $env:GIT_SSH_COMMAND = 'ssh -o BatchMode=yes'

    Invoke-Git @('rev-parse','--is-inside-work-tree') 'Git repository check'
    $currentBranch = (& git branch --show-current).Trim()
    if ($currentBranch -ne [string]$config.repository.branch) { Fail-Deploy 'Current branch does not match the configured deployment branch.' }

    if ($SkipLocalGit) {
        if (-not [string]::IsNullOrWhiteSpace((& git status --porcelain=v1))) {
            Fail-Deploy 'SkipLocalGit requires a clean worktree and index.'
        }
    } else {
        if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
            if ($NonInteractive) { Fail-Deploy 'A commit message is required when local Git is not skipped.' }
            $CommitMessage = Read-Host 'Commit message'
        }
        & git diff --quiet
        if ($LASTEXITCODE -ne 0) { Fail-Deploy 'Stage intended changes explicitly before deployment; unstaged changes are not accepted.' }
        $untracked = @(& git ls-files --others --exclude-standard)
        if ($untracked.Count -gt 0) { Fail-Deploy 'Untracked files must be reviewed or ignored before deployment.' }
        & git diff --cached --quiet
        if ($LASTEXITCODE -eq 0) { Fail-Deploy 'No staged changes are available to commit.' }
        $stagedFiles = @(& git diff --cached --name-only --diff-filter=ACMR)
        foreach ($path in $stagedFiles) {
            $leaf = Split-Path -Leaf $path
            if (($leaf -like '.env*' -and $leaf -ne '.env.example') -or
                ($leaf -like '*.deploylink' -and $leaf -notlike '*.deploylink.example')) {
                Fail-Deploy "Sensitive local configuration must not be committed: $path"
            }
        }
        Invoke-Git @('commit','-m',$CommitMessage) 'Git commit'
    }

    if (-not [string]::IsNullOrWhiteSpace((& git status --porcelain=v1))) { Fail-Deploy 'Worktree and index must be clean before push.' }
    $head = (& git rev-parse --verify HEAD).Trim()
    if ($head -notmatch '^[0-9a-f]{40}$') { Fail-Deploy 'Unable to determine the exact local HEAD.' }

    Write-DeployEvent step 'Pushing the exact configured branch head.'
    Invoke-Git @('push',[string]$config.repository.remote,($head + ':' + [string]$config.repository.branch)) 'Git push'

    $target = ([string]$config.server.user) + '@' + ([string]$config.server.host)
    $sshBase = @('-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15','-p',[string]$sshPort,$target)
    Write-DeployEvent step 'Checking the server connection.'
    Invoke-Native 'ssh' ($sshBase + @('true')) 'SSH connectivity check'

    $remoteScript = @'
set -eu
lock=__LOCK__
if ! mkdir "$lock" 2>/dev/null; then
  echo "Another deployment is already running." >&2
  exit 1
fi
trap 'rmdir "$lock"' EXIT HUP INT TERM
cd __REMOTE_PATH__
test "$(git symbolic-ref --short HEAD)" = __BRANCH__
test -z "$(git status --porcelain --untracked-files=normal)"
git remote get-url __REMOTE__ >/dev/null
export GIT_TERMINAL_PROMPT=0
export GCM_INTERACTIVE=Never
export GIT_SSH_COMMAND='ssh -o BatchMode=yes -o StrictHostKeyChecking=yes'
git fetch --no-tags __REMOTE__ __BRANCH__
test "$(git rev-parse FETCH_HEAD)" = __HEAD__
git merge-base --is-ancestor HEAD __HEAD__
git merge --ff-only __HEAD__
test "$(git rev-parse HEAD)" = __HEAD__
test -z "$(git status --porcelain --untracked-files=normal)"
docker compose --project-name __PROJECT__ config >/dev/null
docker compose --project-name __PROJECT__ build
docker compose --project-name __PROJECT__ up -d
i=1
while [ "$i" -le __ATTEMPTS__ ]; do
  status=$(curl --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' __HEALTH_URL__ || true)
  if [ "$status" = __EXPECTED_STATUS__ ]; then
    exit 0
  fi
  sleep __INTERVAL__
  i=$((i+1))
done
exit 1
'@
    $remoteScript = $remoteScript.Replace('__LOCK__', (Quote-Posix ('/tmp/deploydesk-' + [string]$config.project.id + '.lock')))
    $remoteScript = $remoteScript.Replace('__REMOTE_PATH__', (Quote-Posix ([string]$config.server.remotePath)))
    $remoteScript = $remoteScript.Replace('__BRANCH__', (Quote-Posix ([string]$config.repository.branch)))
    $remoteScript = $remoteScript.Replace('__REMOTE__', (Quote-Posix ([string]$config.repository.remote)))
    $remoteScript = $remoteScript.Replace('__HEAD__', (Quote-Posix $head))
    $remoteScript = $remoteScript.Replace('__PROJECT__', (Quote-Posix ([string]$config.project.id))
    )
    $remoteScript = $remoteScript.Replace('__ATTEMPTS__', [string]$attempts)
    $remoteScript = $remoteScript.Replace('__HEALTH_URL__', (Quote-Posix ("http://127.0.0.1:$healthPort" + [string]$config.server.healthCheck.path)))
    $remoteScript = $remoteScript.Replace('__EXPECTED_STATUS__', (Quote-Posix ([string]$expectedStatus)))
    $remoteScript = $remoteScript.Replace('__INTERVAL__', [string]$interval)
    $remoteCommand = 'sh -lc ' + (Quote-Posix $remoteScript)

    Write-DeployEvent step 'Updating the exact checked commit, starting Compose, and running the server-local health check.'
    Invoke-Native 'ssh' ($sshBase + @($remoteCommand)) 'Remote deployment'
    Write-DeployEvent completed 'Deployment completed successfully.'
    exit 0
} catch {
    if (-not $script:ErrorEmitted -and $_.Exception.Message -ne $null) { Write-DeployEvent error $_.Exception.Message }
    exit 1
} finally {
    if ($null -ne $script:EmptyHooksPath -and (Test-Path -LiteralPath $script:EmptyHooksPath)) {
        Remove-Item -LiteralPath $script:EmptyHooksPath -Force -Recurse
    }
}
