[CmdletBinding()]
param(
    [string] $Server = 'tcp:localhost,1433',
    [Parameter(Mandatory = $true)]
    [string] $Database
)

$ErrorActionPreference = 'Stop'
$sqlcmd = (Get-Command sqlcmd -ErrorAction Stop).Source
$sqlFile = Join-Path $PSScriptRoot 'PS77__owner_vault_storage_readonly.sql'
$migrationDirectory = Join-Path $PSScriptRoot '../migration'

# Explicit read-only SQL only; no Spring startup, Flyway command, DDL, DML or output file.
& $sqlcmd -S $Server -d $Database -E -l 5 -t 30 -b -r 1 -W -s '|' -i $sqlFile
if ($LASTEXITCODE -ne 0) { throw 'SQL preflight failed; findings are inconclusive. No repair was attempted.' }

$historyQuery = @'
SET NOCOUNT ON;
SET LOCK_TIMEOUT 5000;
IF OBJECT_ID(N'dbo.flyway_schema_history', N'U') IS NULL
    THROW 51773, 'Default Flyway history is absent or not visible; cannot compare manifest.', 1;
SELECT COALESCE(version, '<repeatable>'), script, CONVERT(int, success)
FROM dbo.flyway_schema_history ORDER BY installed_rank;
'@
$historyLines = @(& $sqlcmd -S $Server -d $Database -E -l 5 -t 30 -b -r 1 -h -1 -W -s '|' -Q $historyQuery)
if ($LASTEXITCODE -ne 0) { throw 'Flyway manifest read failed; no migration validation or repair was attempted.' }

$local = @{}
foreach ($file in Get-ChildItem -LiteralPath $migrationDirectory -File) {
    if ($file.Name -match '^V([0-9]+(?:[._][0-9]+)*)__.+\.sql$') {
        $version = $Matches[1].Replace('_', '.')
        if ($local.ContainsKey($version)) { throw "Duplicate local migration version: $version" }
        $local[$version] = $file.Name
    }
}
if ($local.Count -eq 0) { throw 'No local versioned migration files found; comparison is inconclusive.' }

$appliedVersions = @{}
$findings = @(
    foreach ($line in $historyLines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $parts = $line.Split('|')
        if ($parts.Count -ne 3) { throw 'Unexpected Flyway history format; comparison is inconclusive.' }
        $version = $parts[0].Trim().Replace('_', '.')
        $script = $parts[1].Trim()
        $success = $parts[2].Trim()
        $appliedVersions[$version] = $true
        $status = if ($success -ne '1') { 'FAILED_HISTORY_ENTRY' }
                  elseif (-not $local.ContainsKey($version)) { 'DB_ONLY_VERSION' }
                  elseif ($local[$version] -cne $script) { 'SCRIPT_NAME_MISMATCH' }
                  else { 'SCRIPT_NAME_MATCH_CHECKSUM_UNVALIDATED' }
        [pscustomobject]@{ Version = $version; Status = $status; DatabaseScript = $script; LocalScript = $local[$version] }
    }
    foreach ($version in ($local.Keys | Sort-Object)) {
        if (-not $appliedVersions.ContainsKey($version)) {
            [pscustomobject]@{ Version = $version; Status = 'LOCAL_NOT_APPLIED'; DatabaseScript = ''; LocalScript = $local[$version] }
        }
    }
)

Write-Output 'Repository migration manifest comparison (file names only; NOT Flyway checksum validation):'
$findings | Format-Table -AutoSize | Out-Host
if (@($findings | Where-Object { $_.Status -ne 'SCRIPT_NAME_MATCH_CHECKSUM_UNVALIDATED' }).Count -gt 0) {
    Write-Output 'Migration differences found. Review baseline/history before planning PS-77 migrations; no changes were made.'
    exit 2
}
Write-Output 'Manifest names match. Checksums and policy readiness remain unvalidated; no changes were made.'
