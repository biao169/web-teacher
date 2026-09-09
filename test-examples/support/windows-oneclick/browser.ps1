$ErrorActionPreference = 'Stop'
try {
    $url = $env:ONECLICK_BROWSER_URL
    if ($url -notmatch '^http://127\.0\.0\.1:[0-9]{4,5}/zh(?:/transfer)?$') { throw '无效的本机浏览地址。' }
    Start-Process -FilePath $url
} catch { exit 1 }
