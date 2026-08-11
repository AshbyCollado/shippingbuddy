[CmdletBinding()]
param(
  [Parameter()]
  [ValidateRange(1, 65535)]
  [int]$Port = 3000,

  [Parameter()]
  [switch]$SkipBuild,

  [Parameter()]
  [switch]$PassThru,

  [Parameter()]
  [ValidateRange(1, 300)]
  [int]$ReadyTimeoutSeconds = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$appName = "shipping-buddy"
$identityMarker = 'data-app-id="shipping-buddy"'
$resolvedScriptDirectory = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$resolvedRoot = (Resolve-Path -LiteralPath (Join-Path $resolvedScriptDirectory "..")).Path
$packagePath = Join-Path $resolvedRoot "package.json"
$url = "http://127.0.0.1:$Port"

function Get-ListenerProcessIds {
  param([int]$RequestedPort)

  return @(
    Get-NetTCPConnection -State Listen -LocalPort $RequestedPort -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique |
      Sort-Object
  )
}

function Test-ShippingBuddyIdentity {
  param([string]$RequestedUrl)

  try {
    $response = Invoke-WebRequest -Uri "$RequestedUrl/" -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200 -and $response.Content.Contains($identityMarker)
  } catch {
    return $false
  }
}

function Get-OwnedProcessIds {
  param(
    [int]$RootProcessId,
    [DateTime]$ExpectedRootStartTimeUtc
  )

  $rootProcess = Get-Process -Id $RootProcessId -ErrorAction SilentlyContinue
  if ($null -eq $rootProcess) {
    return @()
  }
  if (
    $rootProcess.StartTime.ToUniversalTime().Ticks -ne
    $ExpectedRootStartTimeUtc.ToUniversalTime().Ticks
  ) {
    throw "Refusing process-tree access because launcher PID $RootProcessId was reused."
  }
  $processes = @(Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue)
  $owned = [System.Collections.Generic.List[int]]::new()
  $pending = [System.Collections.Generic.Queue[int]]::new()
  $owned.Add($RootProcessId)
  $pending.Enqueue($RootProcessId)
  while ($pending.Count -gt 0) {
    $parentId = $pending.Dequeue()
    foreach ($process in $processes) {
      $candidateId = [int]$process.ProcessId
      if (
        [int]$process.ParentProcessId -eq $parentId -and
        -not $owned.Contains($candidateId)
      ) {
        $owned.Add($candidateId)
        $pending.Enqueue($candidateId)
      }
    }
  }
  return @($owned)
}

function Stop-OwnedProcessTree {
  param(
    [int]$RootProcessId,
    [DateTime]$ExpectedRootStartTimeUtc
  )

  $ownedIds = @(
    Get-OwnedProcessIds -RootProcessId $RootProcessId -ExpectedRootStartTimeUtc $ExpectedRootStartTimeUtc
  )
  [array]::Reverse($ownedIds)
  foreach ($ownedId in $ownedIds) {
    Stop-Process -Id $ownedId -Force -ErrorAction SilentlyContinue
  }
}

function New-LaunchResult {
  param(
    [ValidateSet("Started", "AlreadyRunning")]
    [string]$Status,
    [System.Diagnostics.Process]$Process,
    [AllowNull()]
    [System.Diagnostics.Process]$LauncherProcess,
    [AllowNull()]
    [object]$LauncherProcessStartTimeUtc,
    [string]$StandardOutputLog,
    [string]$StandardErrorLog
  )

  $ownsProcessTree = $null -ne $LauncherProcess -and $null -ne $LauncherProcessStartTimeUtc
  $ownedProcessIds = if ($ownsProcessTree) {
    @(
      Get-OwnedProcessIds -RootProcessId $LauncherProcess.Id -ExpectedRootStartTimeUtc ([DateTime]$LauncherProcessStartTimeUtc)
    )
  } else {
    @()
  }
  $result = [pscustomobject]@{
    PSTypeName = "ShippingBuddy.LaunchResult"
    Status = $Status
    Url = $url
    Root = $resolvedRoot
    Port = $Port
    Process = $Process
    LauncherProcess = $LauncherProcess
    LauncherProcessStartTimeUtc = $LauncherProcessStartTimeUtc
    OwnedProcessIds = $ownedProcessIds
    OwnsProcessTree = $ownsProcessTree
    CleanupContract = if ($ownsProcessTree) { "Call Cleanup(); launcher PID and start time are verified before any owned descendant is stopped." } else { "This launcher did not start the process and will not stop it." }
    StandardOutputLog = $StandardOutputLog
    StandardErrorLog = $StandardErrorLog
  }
  $cleanupMethod = {
    if (-not $this.OwnsProcessTree) {
      return [pscustomobject]@{
        PSTypeName = "ShippingBuddy.CleanupResult"
        Status = "NotOwned"
        RootProcessId = $null
        StoppedProcessIds = @()
      }
    }

    $rootId = [int]$this.LauncherProcess.Id
    $expectedStartTimeUtc = [DateTime]$this.LauncherProcessStartTimeUtc
    $rootProcess = Get-Process -Id $rootId -ErrorAction SilentlyContinue
    if ($null -eq $rootProcess) {
      return [pscustomobject]@{
        PSTypeName = "ShippingBuddy.CleanupResult"
        Status = "AlreadyStopped"
        RootProcessId = $rootId
        StoppedProcessIds = @()
      }
    }
    if (
      $rootProcess.StartTime.ToUniversalTime().Ticks -ne
      $expectedStartTimeUtc.ToUniversalTime().Ticks
    ) {
      throw "Refusing cleanup because launcher PID $rootId was reused. No process was stopped."
    }

    $processes = @(Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue)
    $owned = [System.Collections.Generic.List[int]]::new()
    $pending = [System.Collections.Generic.Queue[int]]::new()
    $owned.Add($rootId)
    $pending.Enqueue($rootId)
    while ($pending.Count -gt 0) {
      $parentId = $pending.Dequeue()
      foreach ($candidate in $processes) {
        $candidateId = [int]$candidate.ProcessId
        if (
          [int]$candidate.ParentProcessId -eq $parentId -and
          -not $owned.Contains($candidateId)
        ) {
          $owned.Add($candidateId)
          $pending.Enqueue($candidateId)
        }
      }
    }

    $listenerIds = @(
      Get-NetTCPConnection -State Listen -LocalPort ([int]$this.Port) -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    )
    $foreignListenerIds = @($listenerIds | Where-Object { -not $owned.Contains([int]$_) })
    if ($foreignListenerIds.Count -gt 0) {
      throw "Refusing cleanup because port $($this.Port) has a foreign listener (PID(s): $($foreignListenerIds -join ', ')). No process was stopped."
    }

    $stoppedIds = @($owned)
    [array]::Reverse($stoppedIds)
    foreach ($ownedId in $stoppedIds) {
      Stop-Process -Id $ownedId -Force -ErrorAction SilentlyContinue
    }
    return [pscustomobject]@{
      PSTypeName = "ShippingBuddy.CleanupResult"
      Status = "Stopped"
      RootProcessId = $rootId
      StoppedProcessIds = $stoppedIds
    }
  }
  $result | Add-Member -MemberType ScriptMethod -Name Cleanup -Value $cleanupMethod
  return $result
}

if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) {
  throw "Shipping Buddy package.json was not found at $packagePath."
}

try {
  $package = Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json
} catch {
  throw "Shipping Buddy package.json could not be parsed: $($_.Exception.Message)"
}
if ([string]$package.name -cne $appName) {
  throw "Refusing to launch unexpected package '$($package.name)' from $resolvedRoot. Expected '$appName'."
}

$pnpmCommand = Get-Command pnpm -CommandType Application -ErrorAction Stop |
  Select-Object -First 1
$pnpmPath = $pnpmCommand.Source
if ([string]::IsNullOrWhiteSpace($pnpmPath)) {
  throw "pnpm was found but its executable path could not be resolved."
}

$existingListenerIds = @(Get-ListenerProcessIds -RequestedPort $Port)
if ($existingListenerIds.Count -gt 0) {
  $pidList = $existingListenerIds -join ", "
  if (-not (Test-ShippingBuddyIdentity -RequestedUrl $url)) {
    throw "Port $Port is already owned by a foreign listener (PID(s): $pidList). It was not terminated."
  }
  $existingProcess = Get-Process -Id $existingListenerIds[0] -ErrorAction Stop
  $alreadyRunning = New-LaunchResult -Status "AlreadyRunning" -Process $existingProcess -LauncherProcess $null -LauncherProcessStartTimeUtc $null -StandardOutputLog "" -StandardErrorLog ""
  if ($PassThru) {
    return $alreadyRunning
  }
  Write-Host "Shipping Buddy is already running."
  Write-Host "Site: $url"
  return
}

if (-not $SkipBuild) {
  Push-Location -LiteralPath $resolvedRoot
  try {
    & $pnpmPath build | Out-Host
    if ($LASTEXITCODE -ne 0) {
      throw "Shipping Buddy production build failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

$logDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "shipping-buddy-launch"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$launchId = [Guid]::NewGuid().ToString("N")
$standardOutputLog = Join-Path $logDirectory "shipping-buddy-$Port-$launchId.out.log"
$standardErrorLog = Join-Path $logDirectory "shipping-buddy-$Port-$launchId.err.log"
# pnpm 11 forwards a literal `--` to Next here, where Next treats the following
# flag as a project directory. Pass supported Next flags directly through pnpm.
$startArguments = @(
  "start",
  "--hostname",
  "127.0.0.1",
  "--port",
  [string]$Port
)

$startProcessParameters = @{
  FilePath = $pnpmPath
  ArgumentList = $startArguments
  WorkingDirectory = $resolvedRoot
  WindowStyle = "Hidden"
  RedirectStandardOutput = $standardOutputLog
  RedirectStandardError = $standardErrorLog
  PassThru = $true
}
$launchedProcess = Start-Process @startProcessParameters
$launcherProcessStartTimeUtc = $launchedProcess.StartTime.ToUniversalTime()

try {
  $deadline = [DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
  $serverProcess = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    if (Test-ShippingBuddyIdentity -RequestedUrl $url) {
      $listenerIds = @(Get-ListenerProcessIds -RequestedPort $Port)
      $ownedIds = @(Get-OwnedProcessIds -RootProcessId $launchedProcess.Id -ExpectedRootStartTimeUtc $launcherProcessStartTimeUtc)
      $serverProcessId = @($listenerIds | Where-Object { $ownedIds -contains $_ } | Select-Object -First 1)
      if ($serverProcessId.Count -eq 1) {
        $serverProcess = Get-Process -Id $serverProcessId[0] -ErrorAction Stop
        break
      }
      if ($listenerIds.Count -gt 0) {
        $pidList = $listenerIds -join ", "
        throw "Port $Port became owned by a process outside this launch (PID(s): $pidList). It was not terminated."
      }
    }
    Start-Sleep -Milliseconds 250
  }
  if ($null -eq $serverProcess) {
    throw "Shipping Buddy did not become ready at $url within $ReadyTimeoutSeconds seconds. Logs: $standardOutputLog and $standardErrorLog"
  }

  $started = New-LaunchResult -Status "Started" -Process $serverProcess -LauncherProcess $launchedProcess -LauncherProcessStartTimeUtc $launcherProcessStartTimeUtc -StandardOutputLog $standardOutputLog -StandardErrorLog $standardErrorLog
  if ($PassThru) {
    return $started
  }

  Write-Host "Shipping Buddy is ready."
  Write-Host "Site: $url"
  Wait-Process -Id $serverProcess.Id
} catch {
  Stop-OwnedProcessTree -RootProcessId $launchedProcess.Id -ExpectedRootStartTimeUtc $launcherProcessStartTimeUtc
  throw
} finally {
  if (-not $PassThru -and $null -ne $serverProcess -and -not $serverProcess.HasExited) {
    Stop-OwnedProcessTree -RootProcessId $launchedProcess.Id -ExpectedRootStartTimeUtc $launcherProcessStartTimeUtc
  }
}
