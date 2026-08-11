[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$launcher = Join-Path $PSScriptRoot "Start-ShippingBuddy.ps1"
$artifactDirectory = Join-Path ([IO.Path]::GetTempPath()) "shipping-buddy-issue14-launcher"
New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null
$log = Join-Path $artifactDirectory "launcher-self-test.log"

function New-FreePort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try { return ([Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
}

function ListenerIds([int]$Port) {
  return @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
}

$started = $null
$foreign = $null
try {
  $port = New-FreePort
  $foreignDirectory = Join-Path ([IO.Path]::GetTempPath()) "shipping-buddy-issue14-foreign-cwd"
  New-Item -ItemType Directory -Force -Path $foreignDirectory | Out-Null
  Push-Location $foreignDirectory
  try {
    $started = & $launcher -Port $port -SkipBuild -PassThru -ReadyTimeoutSeconds 60
    if ($started.Status -ne "Started") { throw "Expected Started, received $($started.Status)." }
    if ($started.Root -ne $root) { throw "Expected root $root, received $($started.Root)." }
    if (-not $started.OwnsProcessTree) { throw "Started launch did not claim its process tree." }
    if ($null -eq $started.LauncherProcess -or $null -eq $started.LauncherProcessStartTimeUtc) { throw "Started launch omitted typed ownership identity." }
    if (@($started.OwnedProcessIds).Count -eq 0) { throw "Started launch reported no owned processes." }
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 5
    if ($response.Content -notmatch 'data-app-id="shipping-buddy"') { throw "Identity marker was absent." }
    $again = & $launcher -Port $port -SkipBuild -PassThru -ReadyTimeoutSeconds 10
    if ($again.Status -ne "AlreadyRunning" -or $again.Process.Id -ne $started.Process.Id) { throw "Second launch did not return the existing listener." }
    if ($again.OwnsProcessTree) { throw "AlreadyRunning launch incorrectly claimed process ownership." }
    $notOwned = $again.Cleanup()
    if ($notOwned.Status -ne "NotOwned") { throw "AlreadyRunning cleanup was not NotOwned: $($notOwned.Status)." }

    $savedStartTime = [DateTime]$started.LauncherProcessStartTimeUtc
    $started.LauncherProcessStartTimeUtc = $savedStartTime.AddTicks(-1)
    $reusedPidRefused = $false
    try { $started.Cleanup() | Out-Null } catch { $reusedPidRefused = $_.Exception.Message -match "Refusing cleanup" }
    if (-not $reusedPidRefused) { throw "Cleanup did not refuse a tampered launcher start time." }
    $liveResponse = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 5
    if ($liveResponse.Content -notmatch 'data-app-id="shipping-buddy"') { throw "Tampered cleanup stopped the live server." }
    $started.LauncherProcessStartTimeUtc = $savedStartTime
  } finally { Pop-Location }

  $foreignPort = New-FreePort
  $foreign = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $foreignPort)
  $foreign.Start()
  $before = (@(ListenerIds $foreignPort) -join ",")
  $rejected = $false
  try { & $launcher -Port $foreignPort -SkipBuild -PassThru -ReadyTimeoutSeconds 5 | Out-Null } catch { $rejected = $_.Exception.Message -match "foreign listener" }
  if (-not $rejected) { throw "Foreign occupied port was not rejected." }
  $after = (@(ListenerIds $foreignPort) -join ",")
  if ($after -ne $before) { throw "Foreign listener was changed." }

  $ownedIds = @($started.OwnedProcessIds)
  $cleanup = $started.Cleanup()
  if ($cleanup.Status -ne "Stopped") { throw "Owned cleanup did not stop the tree: $($cleanup.Status)." }
  Start-Sleep -Milliseconds 500
  if (@(ListenerIds $started.Port).Count -ne 0) { throw "Owned cleanup left a listener on port $($started.Port)." }
  foreach ($ownedId in $ownedIds) {
    if (Get-Process -Id $ownedId -ErrorAction SilentlyContinue) { throw "Owned cleanup left process $ownedId." }
  }
  "PASS Started=$($started.Process.Id) Port=$port Root=$root Owned=$($ownedIds -join ',') Cleanup=$($cleanup.Status)" | Set-Content -LiteralPath $log
  Write-Output "Launcher self-test passed. Artifacts: $artifactDirectory"
} finally {
  if ($foreign) { $foreign.Stop() }
  if ($started) {
    if (@(ListenerIds $started.Port).Count -ne 0) {
      $started.LauncherProcessStartTimeUtc = [DateTime]$started.LauncherProcess.StartTime.ToUniversalTime()
      $started.Cleanup() | Out-Null
      Start-Sleep -Milliseconds 500
    }
    if (@(ListenerIds $started.Port).Count -ne 0) { throw "Launcher cleanup left a listener on port $($started.Port)." }
  }
}
