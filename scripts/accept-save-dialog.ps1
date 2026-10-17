# Accepts the native save dialog (AppActivate by title, then Enter).
$w = New-Object -ComObject WScript.Shell
$ok = $w.AppActivate('Export')
Start-Sleep -Milliseconds 600
$w.SendKeys('{ENTER}')
Write-Output ("activated: {0}" -f $ok)
