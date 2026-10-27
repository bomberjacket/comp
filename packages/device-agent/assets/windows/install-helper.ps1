<#
.SYNOPSIS
  Registers the Comp AI Device Agent privileged helper as a scheduled task
  that runs as LocalSystem at boot.

.DESCRIPTION
  The helper answers a fixed set of read-only questions (audit policy, SMBv1
  feature state) for the user-mode agent over a loopback TCP port. It needs
  administrator rights that the signed-in user should not have, so it runs as
  the built-in SYSTEM service account, not as any person.

  Run from an elevated PowerShell, or let the installer call it.

.PARAMETER ExePath
  Full path to "Comp AI Device Agent.exe". Defaults to the copy next to this script's install.
#>
[CmdletBinding()]
param(
  [string]$ExePath = (Join-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))) 'Comp AI Device Agent.exe'),
  [string]$TaskName = 'Comp AI Device Agent Helper'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "Agent executable not found at '$ExePath'. Pass -ExePath."
}

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$action = New-ScheduledTaskAction -Execute $ExePath -Argument '--helper'
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Principal $principal -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Start-Sleep -Seconds 2
$task = Get-ScheduledTask -TaskName $TaskName
Write-Output "Registered '$TaskName' (state: $($task.State)) running '$ExePath --helper' as SYSTEM at startup."
Write-Output "Helper log: $env:ProgramData\Comp AI Device Agent\helper.log"
