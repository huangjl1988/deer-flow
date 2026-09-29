#Requires -Version 5.1
<#
.SYNOPSIS
  OwlMind 一键上传 + 热更新部署脚本（Windows -> Linux VM）

.DESCRIPTION
  把本地源码打包（排除依赖/环境配置），scp 传到 VM，在 VM 上解压并复用现有
  dev 镜像热更新部署。不重新构建镜像、不在本地编译前端。
  VM 上的 config.yaml / .env / API key 等配置会被保留，不会被覆盖。

.PARAMETER Server    VM 地址（默认 192.168.40.100）
.PARAMETER User      SSH 用户（默认 root）
.PARAMETER SshPort   SSH 端口（默认 22）
.PARAMETER Port      服务对外端口（默认 2026）
.PARAMETER Project   docker compose 项目名（默认 deer-flow-dev）
.PARAMETER SrcDir    本地源码目录（默认脚本上级目录，即 deer-flow-main）

.EXAMPLE
  # 密码放环境变量（推荐，避免交互）：
  $env:OWLMIND_VM_PASS = '你的密码'
  .\deploy.ps1

.EXAMPLE
  # 不传环境变量则交互式提示输入密码（安全，不回显）：
  .\deploy.ps1 -Server 192.168.40.100
#>
[CmdletBinding()]
param(
  [string]$Server  = '192.168.40.100',
  [string]$User    = 'root',
  [int]   $SshPort = 22,
  [int]   $Port    = 2026,
  [string]$Project = 'deer-flow-dev',
  [string]$SrcDir  = '',
  # 首次部署自动创建的管理员账号；不传则远端用默认 (admin@owlmind.local / OwlMind@2026)
  [string]$AdminEmail    = '',
  [string]$AdminPassword = ''
)

# 用 Continue：外部命令(ssh/scp)回传的远端 stderr 属正常进度，
# 不应被当成致命错误；失败一律靠 $LASTEXITCODE 判断后 throw。
$ErrorActionPreference = 'Continue'

# ── 路径解析 ──────────────────────────────────────────────────────────────────
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $SrcDir) { $SrcDir = (Resolve-Path (Join-Path $ScriptDir '..')).Path }
$SrcName  = Split-Path -Leaf $SrcDir.TrimEnd('\')      # deer-flow-main
$SrcParent= Split-Path -Parent $SrcDir                 # 父目录（tar -C 用）
$RemoteSh = Join-Path $ScriptDir 'remote-deploy.sh'
if (-not (Test-Path $RemoteSh)) { throw "找不到远端脚本: $RemoteSh" }

function Need($cmd) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "缺少命令: $cmd（请在 PATH 中可用）" } }
Need 'tar'; Need 'scp'; Need 'ssh'

# ── 密码（不打印、不硬编码）───────────────────────────────────────────────────
if (-not $env:OWLMIND_VM_PASS) {
  $sec = Read-Host "请输入 $User@$Server 的密码" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  $env:OWLMIND_VM_PASS = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
$pass = $env:OWLMIND_VM_PASS
if (-not $pass) { throw "未提供密码" }

# 临时 askpass（输出密码），用完即删
$askpass = Join-Path $env:TEMP ("owlmind_askpass_{0}.cmd" -f [guid]::NewGuid().ToString('N'))
Set-Content -Path $askpass -Value "@echo off`r`necho $pass" -Encoding ASCII
$env:SSH_ASKPASS = $askpass
$env:SSH_ASKPASS_REQUIRE = 'force'
$env:DISPLAY = '1'
$sshOpts = @('-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15')

function Cleanup {
  Remove-Item $askpass -ErrorAction SilentlyContinue
  Remove-Item $pkg -ErrorAction SilentlyContinue
}
trap { Cleanup; throw }

try {
  # ── 1. 打包源码（排除依赖与环境配置）────────────────────────────────────────
  $pkg = Join-Path $env:TEMP ("{0}-src.tar.gz" -f $SrcName)
  $excludes = @(
    'node_modules','.venv','.git','.next','dist','build','logs','__pycache__',
    '*.pyc','.idea','.vscode',
    'config.yaml','.env','frontend/.env','extensions_config.json','backend/uv.lock'
  )
  $tarArgs = @()
  foreach ($e in $excludes) { $tarArgs += "--exclude=$e" }
  $tarArgs += @('-czf', $pkg, '-C', $SrcParent, $SrcName)
  Write-Host "[1/4] 打包源码 -> $pkg" -ForegroundColor Cyan
  & tar @tarArgs
  if ($LASTEXITCODE -ne 0) { throw "tar 打包失败" }
  $size = [math]::Round((Get-Item $pkg).Length / 1MB, 1)
  Write-Host "      打包完成: ${size} MB" -ForegroundColor Green

  # ── 2. 上传源码包 + 远端脚本 ───────────────────────────────────────────────
  $at = "{0}@{1}" -f $User, $Server
  Write-Host "[2/4] 上传到 $at ..." -ForegroundColor Cyan
  & scp @sshOpts -P $SshPort $pkg "${at}:/root/$SrcName-src.tar.gz"
  if ($LASTEXITCODE -ne 0) { throw "scp 源码包失败" }
  & scp @sshOpts -P $SshPort $RemoteSh "${at}:/root/remote-deploy.sh"
  if ($LASTEXITCODE -ne 0) { throw "scp 远端脚本失败" }

  # ── 3. 远端执行部署 ────────────────────────────────────────────────────────
  Write-Host "[3/4] 远端部署中 ..." -ForegroundColor Cyan
  # 把管理员账号作为环境变量前缀传给远端 bash（单引号转义防注入）；不传则远端用默认
  function BashQuote([string]$s) { "'" + ($s -replace "'", "'\''") + "'" }
  $envPrefix = ''
  if ($AdminEmail)    { $envPrefix += "ADMIN_EMAIL=$(BashQuote $AdminEmail) " }
  if ($AdminPassword) { $envPrefix += "ADMIN_PASSWORD=$(BashQuote $AdminPassword) " }
  $remote = "${envPrefix}bash /root/remote-deploy.sh /root/$SrcName-src.tar.gz $Project $Port"
  # 2>&1 把远端 stderr(compose/docker 进度)并入成功流，避免被误判为错误
  & ssh @sshOpts -p $SshPort $at $remote 2>&1
  if ($LASTEXITCODE -ne 0) { throw "远端部署失败" }

  Write-Host "[4/4] 完成，访问 http://${Server}:${Port}" -ForegroundColor Green
}
finally {
  Cleanup
  Remove-Item Env:\SSH_ASKPASS, Env:\SSH_ASKPASS_REQUIRE, Env:\DISPLAY -ErrorAction SilentlyContinue
}
