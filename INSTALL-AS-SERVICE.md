# Keep the relay running after reboot

Run this once in an elevated PowerShell 5.1 window, from this folder.
It creates a scheduled task that starts the relay at logon.

    $folder = (Get-Location).Path
    $action  = New-ScheduledTaskAction -Execute "node.exe" -Argument "relay.js" -WorkingDirectory $folder
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName "Audiopheliac Remote Relay" -Action $action -Trigger $trigger -Settings $set -RunLevel Highest -Force

To remove it:

    Unregister-ScheduledTask -TaskName "Audiopheliac Remote Relay" -Confirm:$false
