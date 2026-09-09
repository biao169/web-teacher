param([Parameter(Mandatory=$true)][string]$InterfaceName)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$adapter = @(Get-NetAdapter -IncludeHidden | Where-Object { $_.Name -ceq $InterfaceName })
if ($adapter.Count -ne 1 -or $adapter[0].Status -ne 'Up') { throw 'FT_METER_UNAVAILABLE' }
$stats = $adapter[0] | Get-NetAdapterStatistics
$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')
@{
    rxBytes = ([UInt64]$stats.ReceivedBytes).ToString([Globalization.CultureInfo]::InvariantCulture)
    txBytes = ([UInt64]$stats.SentBytes).ToString([Globalization.CultureInfo]::InvariantCulture)
    epoch = $boot + ':' + $adapter[0].InterfaceGuid.ToString()
} | ConvertTo-Json -Compress
