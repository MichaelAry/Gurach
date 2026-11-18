param([switch] $Resume, [switch] $EnableWsl)
$ErrorActionPreference = 'Stop'

if ($EnableWsl) {
    $restart = $false
    foreach ($feature in 'Microsoft-Windows-Subsystem-Linux', 'VirtualMachinePlatform') {
        $current = Get-WindowsOptionalFeature -Online -FeatureName $feature
        if ($current.State -eq 'EnablePending') { $restart = $true }
        elseif ($current.State -ne 'Enabled') {
            $result = Enable-WindowsOptionalFeature -Online -FeatureName $feature -All -NoRestart
            $restart = $restart -or $result.RestartNeeded
        }
    }
    if ($restart) { exit 42 }
    & wsl.exe --update --web-download
    exit $LASTEXITCODE
}

$state = Join-Path $env:LOCALAPPDATA 'Gurach'
$source = if ($Resume) { Get-Content -LiteralPath "$state\source.txt" -Raw } else { $PSScriptRoot }
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$desktopPaths = @(
    "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe",
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
)
$lock = $null
$logging = $false

function Invoke-Docker {
    & $script:docker @args
    if ($LASTEXITCODE -ne 0) { throw "Docker command failed with exit code $LASTEXITCODE." }
}

function Add-Resume {
    Copy-Item -LiteralPath "$source\install.ps1" -Destination "$state\resume.ps1" -Force
    [IO.File]::WriteAllText("$state\source.txt", $source)
    Set-ItemProperty -Path $runKey -Name 'GurachInstall' -Value (
        'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + "$state\resume.ps1" + '" -Resume'
    )
}

function New-Secret {
    $bytes = New-Object byte[] 32
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}

try {
    if ([Environment]::OSVersion.Version.Build -lt 22631 -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
        throw 'The Windows installer requires Windows 11 23H2 (build 22631) or later, x64.'
    }
    New-Item -ItemType Directory -Path $state -Force | Out-Null
    $lock = [IO.File]::Open("$state\install.lock", 'OpenOrCreate', 'ReadWrite', 'None')
    Start-Transcript -Path "$state\install.log" -Append | Out-Null
    $logging = $true
    if (!$Resume -and (Test-Path -LiteralPath "$source\deploy\images.env")) {
        $staged = "$state\installer"
        New-Item -ItemType Directory -Path $staged -Force | Out-Null
        foreach ($item in 'install.ps1', 'deploy', 'docker') {
            Copy-Item -LiteralPath "$source\$item" -Destination $staged -Recurse -Force
        }
        $source = $staged
    }
    if ($Resume) { Remove-ItemProperty -Path $runKey -Name 'GurachInstall' -ErrorAction SilentlyContinue }

    $desktop = $desktopPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (!$desktop) {
        $computer = Get-CimInstance Win32_ComputerSystem
        if (!$computer.HypervisorPresent -and !(Get-CimInstance Win32_Processor | Where-Object VirtualizationFirmwareEnabled)) {
            throw 'Enable hardware virtualization in UEFI or nested virtualization in your VM.'
        }
        # Keep elevation limited to Windows features. Docker and Gurach run as the signed-in user.
        Add-Resume
        $enable = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList (
            '-NoProfile -ExecutionPolicy Bypass -File "' + "$state\resume.ps1" + '" -EnableWsl'
        )
        if ($enable.ExitCode -eq 42) {
            Write-Host 'Restart Windows and sign in again. Gurach setup will resume automatically.'
            exit 0
        }
        if ($enable.ExitCode -ne 0) { throw 'Could not enable WSL 2 Windows features.' }
        Remove-ItemProperty -Path $runKey -Name 'GurachInstall'

        $installer = "$state\Docker Desktop Installer.exe"
        Invoke-WebRequest -UseBasicParsing 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe' -OutFile $installer
        $signature = Get-AuthenticodeSignature -LiteralPath $installer
        if ($signature.Status -ne 'Valid' -or
            $signature.SignerCertificate.GetNameInfo('SimpleName', $false) -notmatch '^Docker,? Inc\.?$') {
            throw 'The downloaded Docker Desktop installer has an unexpected signature.'
        }
        Add-Resume
        $install = Start-Process -FilePath $installer -Wait -PassThru -ArgumentList 'install', '--user', '--quiet', '--backend=wsl-2'
        if ($install.ExitCode -in 1641, 3010) {
            Write-Host 'Restart Windows and sign in again. Gurach setup will resume automatically.'
            exit 0
        }
        if ($install.ExitCode -ne 0) { throw "Docker Desktop installation failed ($($install.ExitCode))." }
        Remove-ItemProperty -Path $runKey -Name 'GurachInstall'
        $desktop = $desktopPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    }

    if (!$desktop) { throw 'Docker Desktop executable was not found.' }
    $script:docker = Join-Path (Split-Path -Parent $desktop) 'resources\bin\docker.exe'
    if (!(Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
        Start-Process -FilePath $desktop
    }
    Write-Host 'Waiting for Docker Desktop. Accept the Docker terms in its window if prompted.'
    $deadline = (Get-Date).AddMinutes(8)
    do {
        $previousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $engine = & $docker --context desktop-linux info --format '{{.OSType}}' 2>$null
        } finally {
            $ErrorActionPreference = $previousPreference
        }
        if ($LASTEXITCODE -eq 0 -and $engine -eq 'linux') { break }
        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)
    if ($engine -ne 'linux') { throw 'Docker Desktop Linux engine did not become ready.' }
    Invoke-Docker --context desktop-linux compose version

    if (!(Test-Path -LiteralPath "$state\install.env")) {
        $secrets = foreach ($key in 'MONGO_KEY', 'MONGO_ROOT_PASSWORD', 'MONGO_APP_PASSWORD', 'CACHE_SECRET', 'INITIAL_PASSWORD') {
            "GURACH_${key}=$(New-Secret)"
        }
        [IO.File]::WriteAllLines("$state\install.env.tmp", [string[]]$secrets)
        Move-Item -LiteralPath "$state\install.env.tmp" -Destination "$state\install.env" -Force
    }

    $payload = "$state\runtime"
    New-Item -ItemType Directory -Path "$payload\deploy", "$payload\docker\mongo" -Force | Out-Null
    foreach ($file in 'compose.yml', 'mongo-ready.js', 'setup.mjs') {
        Copy-Item -LiteralPath "$source\deploy\$file" -Destination "$payload\deploy\$file" -Force
    }
    Copy-Item -Path "$source\docker\mongo\*" -Destination "$payload\docker\mongo" -Force

    $envFiles = @('--env-file', "$state\images.env", '--env-file', "$state\install.env")
    $compose = @('--context', 'desktop-linux', 'compose') + $envFiles + @('-f', "$payload\deploy\compose.yml")
    if (Test-Path -LiteralPath "$source\deploy\images.env") {
        Copy-Item -LiteralPath "$source\deploy\images.env" -Destination "$state\images.env" -Force
        Invoke-Docker @compose pull mongodb api client
    } else {
        $nodeVersion = (Get-Content -LiteralPath "$source\.node-version" -Raw).Trim()
        [IO.File]::WriteAllText("$state\images.env", "GURACH_NODE_VERSION=$nodeVersion`n")
        Invoke-Docker --context desktop-linux compose @envFiles -f "$source\deploy\compose.yml" -f "$source\deploy\compose.build.yml" build api client
    }
    try {
        Invoke-Docker @compose up -d --wait --wait-timeout 180
    } catch {
        & $docker @compose logs --tail 35 mongodb setup api client
        throw
    }

    Set-ItemProperty -Path $runKey -Name 'GurachDocker' -Value ('"' + $desktop + '"')
    $webPort = $env:GURACH_WEB_PORT
    if (!$webPort) {
        $portLine = Get-Content -LiteralPath "$state\install.env" | Where-Object { $_ -match '^GURACH_WEB_PORT=' } | Select-Object -Last 1
        $webPort = if ($portLine) { ($portLine -split '=', 2)[1] } else { '3000' }
    }
    $appUrl = "http://localhost:$webPort"
    Write-Host "Gurach is ready at $appUrl"
    Write-Host "Initial account: gurach. Password: GURACH_INITIAL_PASSWORD in $state\install.env"
    Start-Process $appUrl
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Setup log: $state\install.log"
    exit 1
} finally {
    if ($logging) { Stop-Transcript | Out-Null }
    if ($lock) { $lock.Dispose() }
}
