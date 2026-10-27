<#
.SYNOPSIS
  Stops and removes the Comp AI Device Agent privileged helper scheduled task.
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'Comp AI Device Agent Helper'
)

$ErrorActionPreference = 'SilentlyContinue'

$task = Get-ScheduledTask -TaskName $TaskName
if ($task) {
  Stop-ScheduledTask -TaskName $TaskName
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "Removed '$TaskName'."
} else {
  Write-Output "'$TaskName' is not registered."
}
