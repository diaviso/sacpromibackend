# ============================================================================
# SACPROMI — Sauvegarde PostgreSQL quotidienne (Windows PowerShell)
# Utilisation : .\backup-db.ps1
# ============================================================================

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$BackupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $RootDir 'backups' }
$RetentionDays = if ($env:BACKUP_RETENTION_DAYS) { [int]$env:BACKUP_RETENTION_DAYS } else { 30 }

# Charger .env
$EnvFile = Join-Path $RootDir '.env'
if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') {
      $k = $matches[1].Trim()
      $v = $matches[2].Trim() -replace '^"', '' -replace '"$', ''
      Set-Item -Path "Env:$k" -Value $v
    }
  }
}

if (-not $env:DATABASE_URL) {
  Write-Error 'DATABASE_URL non definie (verifiez backend/.env)'
  exit 1
}

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$Date = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$BackupFile = Join-Path $BackupDir "sacpromi-$Date.sql"

Write-Host "Sauvegarde vers $BackupFile..." -ForegroundColor Cyan

# pg_dump (nécessite que pg_dump soit dans le PATH)
& pg_dump --dbname="$env:DATABASE_URL" --no-owner --no-privileges --clean --if-exists `
  --file="$BackupFile"

if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump a echoue avec le code $LASTEXITCODE"
  exit $LASTEXITCODE
}

# Compression gzip si disponible
$Gzip = Get-Command gzip -ErrorAction SilentlyContinue
if ($Gzip) {
  & gzip $BackupFile
  $BackupFile = "$BackupFile.gz"
}

$Size = (Get-Item $BackupFile).Length / 1KB
Write-Host ("Sauvegarde OK ({0:N0} KB)" -f $Size) -ForegroundColor Green

# Rotation
Write-Host "Suppression des sauvegardes > $RetentionDays jours..." -ForegroundColor Yellow
Get-ChildItem -Path $BackupDir -Filter 'sacpromi-*' |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
  Remove-Item -Force

Write-Host 'Sauvegardes existantes :' -ForegroundColor Cyan
Get-ChildItem -Path $BackupDir -Filter 'sacpromi-*' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 10 |
  Format-Table Name, @{N = 'Size (KB)'; E = { [math]::Round($_.Length / 1KB, 1) } }, LastWriteTime
