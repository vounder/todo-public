[CmdletBinding()]
param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot),
    [string[]]$ForbiddenTerm = @()
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
$textExtensions = @(
    ".cs", ".css", ".env", ".example", ".html", ".js", ".json", ".jsx",
    ".md", ".ps1", ".sh", ".ts", ".tsx", ".txt", ".xml", ".yaml", ".yml"
)

$patterns = [ordered]@{
    "private key" = "-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"
    "GitHub token" = "(?:gh[opusr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})"
    "AWS access key" = "(?:AKIA|ASIA)[A-Z0-9]{16}"
}

$findings = [System.Collections.Generic.List[string]]::new()
$files = Get-ChildItem -LiteralPath $resolvedRoot -File -Recurse |
    Where-Object {
        $_.FullName -notmatch "[\\/](?:\.git|node_modules|artifacts|dist|build)[\\/]" -and
        ($textExtensions -contains $_.Extension.ToLowerInvariant() -or $_.Name -eq "Dockerfile")
    }

foreach ($file in $files) {
    $content = [System.IO.File]::ReadAllText($file.FullName)
    $relative = $file.FullName.Substring($resolvedRoot.Length).TrimStart("\", "/")

    foreach ($entry in $patterns.GetEnumerator()) {
        if ([regex]::IsMatch($content, $entry.Value, [Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
            $findings.Add("$relative [$($entry.Key)]")
        }
    }

    foreach ($match in [regex]::Matches(
        $content,
        "(?i)https?://[^/\s:@]+:[^/\s@]+@(?<host>[A-Za-z0-9.-]+)"
    )) {
        if ($match.Groups["host"].Value -notmatch "\.(?:test|invalid|example)$") {
            $findings.Add("$relative [credential in URL]")
        }
    }

    foreach ($match in [regex]::Matches(
        $content,
        "\b[A-Za-z0-9._%+-]+@(?<domain>[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b"
    )) {
        if ($match.Groups["domain"].Value -notmatch "\.(?:test|invalid|example)$") {
            $findings.Add("$relative [email address]")
        }
    }

    foreach ($match in [regex]::Matches(
        $content,
        "(?i)(?:https?|wss?|mongodb(?:\+srv)?)://(?<ip>(?:\d{1,3}\.){3}\d{1,3})"
    )) {
        $ip = $match.Groups["ip"].Value
        if ($ip -notin @("127.0.0.1", "0.0.0.0")) {
            $findings.Add("$relative [non-loopback IP URL]")
        }
    }

    foreach ($term in $ForbiddenTerm) {
        if ($term -and $content.IndexOf($term, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            $findings.Add("$relative [forbidden term]")
        }
    }
}

$uniqueFindings = @($findings | Sort-Object -Unique)
if ($uniqueFindings.Count -gt 0) {
    Write-Error ("Public-safety scan failed:`n" + ($uniqueFindings -join [Environment]::NewLine))
    exit 1
}

Write-Host "Public-safety scan passed for $($files.Count) text files."
