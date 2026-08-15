$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefix = 'http://127.0.0.1:8777/'
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Output "ONIX HOUSE  $prefix"
Write-Output "ADMIN       $($prefix)admin.html"

function Get-Mime([string]$ext) {
    switch ($ext.ToLower()) {
        '.html' { 'text/html; charset=utf-8' }
        '.css'  { 'text/css; charset=utf-8' }
        '.js'   { 'application/javascript; charset=utf-8' }
        '.json' { 'application/json; charset=utf-8' }
        '.mp4'  { 'video/mp4' }
        '.mp3'  { 'audio/mpeg' }
        '.png'  { 'image/png' }
        '.jpg'  { 'image/jpeg' }
        '.jpeg' { 'image/jpeg' }
        '.webp' { 'image/webp' }
        '.svg'  { 'image/svg+xml' }
        '.ico'  { 'image/x-icon' }
        default { 'application/octet-stream' }
    }
}

function Get-Sha256([string]$s) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($s))).Replace('-', '').ToLower()
    } finally {
        $sha.Dispose()
    }
}

function Read-Body($ctx) {
    $reader = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
    try { return $reader.ReadToEnd() } finally { $reader.Close() }
}

function Write-Json($ctx, $code, $obj) {
    $json = $obj | ConvertTo-Json -Compress -Depth 12
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $ctx.Response.StatusCode = $code
    $ctx.Response.ContentType = 'application/json; charset=utf-8'
    $ctx.Response.Headers.Add('Cache-Control', 'no-store')
    $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.Close()
}

function Test-Admin($ctx) {
    $lockPath = Join-Path $root 'js\admin.lock.json'
    if (-not (Test-Path -LiteralPath $lockPath)) { return $false }
    $lock = Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $key = [string]$ctx.Request.Headers['X-Onix-Key']
    if ([string]::IsNullOrWhiteSpace($key)) { return $false }
    return ((Get-Sha256 $key) -eq [string]$lock.hash)
}

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
        $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
        if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }
        $method = $ctx.Request.HttpMethod.ToUpperInvariant()

        if ($method -eq 'OPTIONS') {
            $ctx.Response.StatusCode = 204
            $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
            $ctx.Response.Headers.Add('Access-Control-Allow-Headers', 'Content-Type, X-Onix-Key')
            $ctx.Response.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            $ctx.Response.Close()
            continue
        }

        if ($path -eq 'api/live') {
            $payload = [ordered]@{
                fivem = [ordered]@{ online = $false; clients = 0; max = 64; hostname = 'ONiX Roleplay V2' }
                discord = [ordered]@{ members = 0; online = 0; name = 'ONiX Roleplay' }
            }
            try {
                $f = Invoke-RestMethod -Uri 'https://frontend.cfx-services.net/api/servers/single/lera5g7' -TimeoutSec 12
                $d = $f.Data
                $payload.fivem.online = $true
                $payload.fivem.clients = [int]$d.clients
                $payload.fivem.max = [int]$(if ($d.svMaxclients) { $d.svMaxclients } else { 64 })
                $payload.fivem.hostname = [string]$d.hostname
            } catch {}
            try {
                $i = Invoke-RestMethod -Uri 'https://discord.com/api/v10/invites/wdUntyZzt?with_counts=true' -TimeoutSec 12
                $payload.discord.members = [int]$i.approximate_member_count
                $payload.discord.online = [int]$i.approximate_presence_count
                if ($i.guild.name) { $payload.discord.name = [string]$i.guild.name }
            } catch {}
            Write-Json $ctx 200 $payload
            continue
        }

        if ($path -eq 'api/admin/save' -and $method -eq 'POST') {
            if (-not (Test-Admin $ctx)) { Write-Json $ctx 401 @{ error = 'Pogresna lozinka' }; continue }
            $obj = (Read-Body $ctx) | ConvertFrom-Json
            $json = [string]$obj.json
            if ([string]::IsNullOrWhiteSpace($json)) {
                Write-Json $ctx 400 @{ error = 'Nema podataka' }
                continue
            }
            $incoming = $json | ConvertFrom-Json
            if (@($incoming.products).Count -eq 0) {
                Write-Json $ctx 400 @{ error = 'Katalog je prazan — nije spremljeno' }
                continue
            }
            if ([string]::IsNullOrWhiteSpace([string]$incoming.discord) -or [string]::IsNullOrWhiteSpace([string]$incoming.paypal)) {
                Write-Json $ctx 400 @{ error = 'Fale linkovi sajta — nije spremljeno' }
                continue
            }
            $pathData = Join-Path $root 'js\data.json'
            $utf8 = New-Object Text.UTF8Encoding $false
            [IO.File]::WriteAllText($pathData, $json, $utf8)
            Write-Json $ctx 200 @{ ok = $true }
            continue
        }

        if ($path -eq 'api/admin/upload' -and $method -eq 'POST') {
            if (-not (Test-Admin $ctx)) { Write-Json $ctx 401 @{ error = 'Pogresna lozinka' }; continue }
            $obj = (Read-Body $ctx) | ConvertFrom-Json
            $name = [string]$obj.name
            $name = ($name -replace '[^a-zA-Z0-9._-]', '-')
            if ([string]::IsNullOrWhiteSpace($name)) { $name = ('upload-' + [DateTimeOffset]::Now.ToUnixTimeSeconds() + '.jpg') }
            $dir = Join-Path $root 'assets\uploads'
            New-Item -ItemType Directory -Force -Path $dir | Out-Null
            $full = Join-Path $dir $name
            $bytes = [Convert]::FromBase64String([string]$obj.content)
            [IO.File]::WriteAllBytes($full, $bytes)
            Write-Json $ctx 200 @{ ok = $true; path = ('assets/uploads/' + $name) }
            continue
        }

        if ($path -eq 'api/admin/publish' -and $method -eq 'POST') {
            if (-not (Test-Admin $ctx)) { Write-Json $ctx 401 @{ error = 'Pogresna lozinka' }; continue }
            $gitDir = Join-Path $root '.git'
            if (-not (Test-Path -LiteralPath $gitDir)) {
                Write-Json $ctx 200 @{ ok = $true; pushed = $false; detail = 'Nema git repo — fajlovi su spremljeni' }
                continue
            }
            $env:GIT_AUTHOR_NAME = 'seid98sutovic-cloud'
            $env:GIT_AUTHOR_EMAIL = 'seid98sutovic-cloud@users.noreply.github.com'
            $env:GIT_COMMITTER_NAME = $env:GIT_AUTHOR_NAME
            $env:GIT_COMMITTER_EMAIL = $env:GIT_AUTHOR_EMAIL
            Push-Location $root
            try {
                git add js/data.json assets/uploads 2>$null
                git diff --cached --quiet
                if ($LASTEXITCODE -ne 0) {
                    git commit -m "Admin: izmjena sajta"
                }
                git push origin HEAD
                $ok1 = $LASTEXITCODE -eq 0
                git push onixrp HEAD
                $ok2 = $LASTEXITCODE -eq 0
                $pushed = $ok1 -or $ok2
                Write-Json $ctx 200 @{ ok = $true; pushed = $pushed; detail = $(if ($pushed) { 'Push OK' } else { 'Push nije uspio' }) }
            } catch {
                Write-Json $ctx 200 @{ ok = $true; pushed = $false; detail = [string]$_.Exception.Message }
            } finally {
                Pop-Location
            }
            continue
        }

        $full = [IO.Path]::GetFullPath((Join-Path $root ($path -replace '/','\')))
        if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
            $ctx.Response.StatusCode = 403
            $ctx.Response.Close()
            continue
        }
        if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
            $ctx.Response.StatusCode = 404
            $ctx.Response.Close()
            continue
        }

        $info = Get-Item -LiteralPath $full
        $len = $info.Length
        $mime = Get-Mime $info.Extension
        $ctx.Response.Headers.Add('Accept-Ranges', 'bytes')
        $ctx.Response.Headers.Add('Access-Control-Allow-Origin', '*')
        if ($info.Extension -in @('.json', '.html', '.js', '.css')) {
            $ctx.Response.Headers.Add('Cache-Control', 'no-store')
        }
        $ctx.Response.ContentType = $mime

        $range = $ctx.Request.Headers['Range']
        $start = [int64]0
        $end = $len - 1
        if ($range -and $range -match '^bytes=(\d*)-(\d*)$') {
            if ($Matches[1] -ne '') { $start = [int64]$Matches[1] }
            if ($Matches[2] -ne '') { $end = [int64]$Matches[2] }
            if ($end -ge $len) { $end = $len - 1 }
            $ctx.Response.StatusCode = 206
            $ctx.Response.Headers.Add('Content-Range', "bytes $start-$end/$len")
        } else {
            $ctx.Response.StatusCode = 200
        }

        $count = $end - $start + 1
        $ctx.Response.ContentLength64 = $count
        $fs = [IO.File]::OpenRead($full)
        try {
            $null = $fs.Seek($start, 'Begin')
            $buffer = New-Object byte[] 65536
            $left = $count
            while ($left -gt 0) {
                $n = $fs.Read($buffer, 0, [Math]::Min($buffer.Length, $left))
                if ($n -le 0) { break }
                $ctx.Response.OutputStream.Write($buffer, 0, $n)
                $left -= $n
            }
        } finally {
            $fs.Close()
        }
        $ctx.Response.Close()
    } catch {
        try { $ctx.Response.Abort() } catch {}
    }
}
