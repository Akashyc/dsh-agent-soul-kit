# dsh-agent-soul kit - Windows one-command bootstrap
#
#   irm https://raw.githubusercontent.com/Akashyc/dsh-agent-soul-kit/main/install.ps1 | iex
#   with arguments (for example an existing setup):
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/Akashyc/dsh-agent-soul-kit/main/install.ps1))) --setup <name>
#
# It only does what PowerShell has to: find a node >= 18, put the kit in a fixed folder, and start
# install.mjs in this console. Choosing a setup, the questions, installing, heartbeat and checks all
# live in install.mjs - the same file macOS (install.sh) hands over to.
#
# Kept ASCII-only on purpose: Windows PowerShell 5.1 may decode a piped script with the ANSI code page.
# Env: DSH_KIT_DIR (default: <Documents>\dsh-agent-soul-kit), DSH_KIT_REF (default: main), DSH_NODE.

# Everything runs in a child scope: under `irm | iex` this script shares the caller's session,
# so preferences set here must not leak, and errors must not close the user's window.
& {
  param([string[]]$KitArgs)
  $ErrorActionPreference = 'Stop'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $repo = 'Akashyc/dsh-agent-soul-kit'
  $ref = if ($env:DSH_KIT_REF) { $env:DSH_KIT_REF } else { 'main' }
  $kit = if ($env:DSH_KIT_DIR) { $env:DSH_KIT_DIR } else { Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'dsh-agent-soul-kit' }
  function Say($m) { Write-Host "  $m" }
  function Die($m) { Write-Host "  FAIL $m" -ForegroundColor Red; throw $m }
  function NodeOk($p) {
    if (-not $p -or -not (Test-Path $p)) { return $false }
    & $p -e "process.exit(+process.versions.node.split('.')[0] >= 18 ? 0 : 1)"
    return ($LASTEXITCODE -eq 0)
  }

  Write-Host ''
  Write-Host '  dsh-agent-soul kit' -ForegroundColor Cyan
  Write-Host '  ------------------'

  # 1. node: DSH_NODE -> node bundled with DSH (wherever DSH is installed) -> PATH
  $node = $null
  if (NodeOk $env:DSH_NODE) { $node = $env:DSH_NODE }
  if (-not $node) {
    $roots = @((Join-Path $env:LOCALAPPDATA 'Programs'), $env:LOCALAPPDATA, $env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ -and (Test-Path $_) }
    foreach ($r in $roots) {
      foreach ($d in (Get-ChildItem $r -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'dsh|deepseek' })) {
        $c = Get-ChildItem $d.FullName -Recurse -Filter node.exe -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match 'dependencies\\node\\bin' } | Select-Object -First 1
        if ($c -and (NodeOk $c.FullName)) { $node = $c.FullName; break }
      }
      if ($node) { break }
    }
  }
  if (-not $node) { $c = Get-Command node -ErrorAction SilentlyContinue; if ($c -and (NodeOk $c.Source)) { $node = $c.Source } }
  if (-not $node) { Die 'No node >= 18 found. Install DSH and open it once (its bundled node is used), or install Node.js, or set $env:DSH_NODE to a node.exe, then run this again.' }
  Say "node: $node ($(& $node -v))"

  # 2. kit folder: update it when git can fast-forward, keep local changes, otherwise clone or download
  $hasGit = [bool](Get-Command git -ErrorAction SilentlyContinue)
  if ((Test-Path (Join-Path $kit '.git')) -and $hasGit) {
    git -C $kit pull --ff-only --quiet
    if ($LASTEXITCODE -eq 0) { Say "kit is up to date: $kit" } else { Say "kit has local changes or GitHub is unreachable; using it as is: $kit" }
  } elseif (Test-Path (Join-Path $kit 'install.mjs')) {
    Say "using existing kit: $kit (run install.mjs --kit-update to sync)"
  } else {
    $parent = Split-Path $kit
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    if ($hasGit) {
      git clone --quiet --depth 1 --branch $ref "https://github.com/$repo.git" $kit
      if ($LASTEXITCODE -ne 0) { Die "git clone failed. Set HTTPS_PROXY, or download https://github.com/$repo/archive/$ref.zip and unzip it to $kit" }
    } else {
      $zip = Join-Path $env:TEMP ('dsh-soul-kit-' + [guid]::NewGuid().ToString('N').Substring(0, 8) + '.zip')
      try {
        Invoke-WebRequest -UseBasicParsing -Uri "https://codeload.github.com/$repo/zip/refs/heads/$ref" -OutFile $zip
        # unzip next to the target and rename: same volume, so no cross-drive move
        $before = @(Get-ChildItem $parent -Directory | ForEach-Object { $_.FullName })
        Expand-Archive -Path $zip -DestinationPath $parent -Force
        $src = Get-ChildItem $parent -Directory | Where-Object { $before -notcontains $_.FullName } | Select-Object -First 1
        if (-not $src) { Die "unzip produced no folder in $parent" }
        Rename-Item $src.FullName (Split-Path $kit -Leaf)
      } catch {
        Die "download failed: $($_.Exception.Message). Set HTTPS_PROXY, or download https://github.com/$repo/archive/$ref.zip and unzip it to $kit"
      } finally { Remove-Item $zip -Force -ErrorAction SilentlyContinue }
    }
    Say "kit is in place: $kit"
  }

  # 3. hand over to install.mjs; it asks its questions in this console
  Push-Location $kit
  try { & $node install.mjs @KitArgs } finally { Pop-Location }
} $args
