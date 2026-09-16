# Run once in PowerShell as the Windows account that owns the webcam.
param([switch]$AfterSignIn)
$ErrorActionPreference = 'Stop'
$cameraProject = Split-Path -Parent $PSScriptRoot
$cameraPython = (Get-Command python.exe).Source
$cameraNode = (Get-Command node.exe).Source
$cameraUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$cameraAction = New-ScheduledTaskAction -Execute $cameraPython -Argument ('"{0}" --node "{1}"' -f (Join-Path $PSScriptRoot 'supervise.py'), $cameraNode) -WorkingDirectory $cameraProject
$cameraTriggers = @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -AtLogOn -User $cameraUser))
if ($AfterSignIn) { $cameraTriggers = @((New-ScheduledTaskTrigger -AtLogOn -User $cameraUser)) }
$cameraSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$cameraPrincipal = New-ScheduledTaskPrincipal -UserId $cameraUser -LogonType S4U -RunLevel Limited
if ($AfterSignIn) { $cameraPrincipal = New-ScheduledTaskPrincipal -UserId $cameraUser -LogonType Interactive -RunLevel Limited }
$cameraTask = New-ScheduledTask -Action $cameraAction -Trigger $cameraTriggers -Settings $cameraSettings -Principal $cameraPrincipal -Description 'Local C922 motion recorder and automatic private Vercel Blob uploads. No audio.'
Register-ScheduledTask -TaskName 'Marktan Camera Monitor' -InputObject $cameraTask -Force -ErrorAction Stop | Out-Null
Start-ScheduledTask -TaskName 'Marktan Camera Monitor' -ErrorAction Stop
Get-ScheduledTask -TaskName 'Marktan Camera Monitor' | Select-Object TaskName, State
