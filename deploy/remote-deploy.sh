#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# OwlMind 远端热更新部署脚本（在 VM 上由本地 deploy.ps1 触发）
#
# 流程：停容器 → 保留 VM 本地配置 → 解压新源码 → 恢复配置 → 复用现有镜像启动
#        → 容器内重新生成 uv.lock → 重启 gateway → 健康检查
#
# 用法： bash remote-deploy.sh <源码包路径> [项目名] [端口]
#   源码包路径  默认 /root/owlmind-src.tar.gz
#   项目名      compose project，默认 deer-flow-dev
#   端口        对外端口，默认 2026
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SRC_PKG="${1:-/root/owlmind-src.tar.gz}"
PROJECT="${2:-deer-flow-dev}"
PORT="${3:-2026}"

PARENT="/root"
TOP_DIR="deer-flow-main"
DEST="$PARENT/$TOP_DIR"
COMPOSE_FILE="docker/docker-compose-dev.yaml"

log() { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }

# ── 1. 校验源码包 ────────────────────────────────────────────────────────────
[ -f "$SRC_PKG" ] || { echo "源码包不存在: $SRC_PKG" >&2; exit 1; }
log "源码包: $SRC_PKG"

# ── 2. 备份 VM 本地配置（绝不被新源码覆盖） ───────────────────────────────────
KEEP="$(mktemp -d)"
trap 'rm -rf "$KEEP"' EXIT
if [ -d "$DEST" ]; then
  for f in config.yaml .env frontend/.env extensions_config.json backend/uv.lock; do
    if [ -f "$DEST/$f" ]; then
      mkdir -p "$KEEP/$(dirname "$f")"
      cp "$DEST/$f" "$KEEP/$f"
      log "保留配置: $f"
    fi
  done
fi

# ── 3. 停止现有容器（保留 volume，.venv / redis 数据不丢） ────────────────────
if [ -f "$DEST/$COMPOSE_FILE" ]; then
  log "停止现有容器 (project=$PROJECT) ..."
  ( cd "$DEST" && docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down ) >/dev/null 2>&1 || warn "停止容器失败（可能本就未运行），继续"
fi

# ── 4. 替换源码 ──────────────────────────────────────────────────────────────
if [ -d "$DEST" ]; then
  BAK="$DEST.bak.$(date +%Y%m%d-%H%M%S)"
  mv "$DEST" "$BAK"
  log "旧源码已备份: $BAK"
fi
log "解压新源码 ..."
mkdir -p "$PARENT"
tar xzf "$SRC_PKG" -C "$PARENT"
[ -d "$DEST" ] || { echo "解压后未找到 $DEST" >&2; exit 1; }

# ── 5. 恢复 VM 本地配置；缺失则从 example 生成 ────────────────────────────────
for f in config.yaml .env frontend/.env extensions_config.json backend/uv.lock; do
  if [ -f "$KEEP/$f" ]; then
    mkdir -p "$DEST/$(dirname "$f")"
    cp "$KEEP/$f" "$DEST/$f"
    log "恢复配置: $f"
  fi
done
[ -f "$DEST/config.yaml" ]            || { cp "$DEST/config.example.yaml" "$DEST/config.yaml"; log "新建 config.yaml (example)"; }
[ -f "$DEST/frontend/.env" ]          || { [ -f "$DEST/frontend/.env.example" ] && cp "$DEST/frontend/.env.example" "$DEST/frontend/.env" || touch "$DEST/frontend/.env"; log "新建 frontend/.env"; }
[ -f "$DEST/extensions_config.json" ] || { echo '{}' > "$DEST/extensions_config.json"; log "新建 extensions_config.json"; }
[ -f "$DEST/.env" ]                   || { [ -f "$DEST/.env.example" ] && cp "$DEST/.env.example" "$DEST/.env" || touch "$DEST/.env"; log "新建 .env"; }

# 确保鉴权密钥存在（不覆盖已有）
secret() { LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 64; }
grep -q '^BETTER_AUTH_SECRET='            "$DEST/.env" 2>/dev/null || echo "BETTER_AUTH_SECRET=$(secret)"            >> "$DEST/.env"
grep -q '^DEER_FLOW_INTERNAL_AUTH_TOKEN=' "$DEST/.env" 2>/dev/null || echo "DEER_FLOW_INTERNAL_AUTH_TOKEN=$(secret)" >> "$DEST/.env"

# 登录模式：清理可能残留的免登录开关，确保正常登录生效。
# 前端读 frontend/.env，后端读根 .env，两处都要清。
sed -i '/^DEER_FLOW_AUTH_DISABLED=/d' "$DEST/.env"          2>/dev/null || true
sed -i '/^DEER_FLOW_AUTH_DISABLED=/d' "$DEST/frontend/.env" 2>/dev/null || true

# ── 6. 复用现有镜像启动（--no-build，不拉基础镜像） ───────────────────────────
log "启动服务 (--no-build, 复用现有镜像) ..."
# 放行本机 IP 作为 Next.js dev origin：用 LAN IP 访问时，Next dev 默认只允许
# localhost 加载 /_next/*，否则返回 403，页面不 hydrate、登录后无法跳转。
# 自动收集本机所有非 loopback IP，兼容 VM IP 变化。
DEV_HOSTS="$(hostname -I 2>/dev/null | tr ' ' ',' | sed 's/,\{1,\}$//')"
export DEER_FLOW_DEV_ALLOWED_ORIGINS="${DEV_HOSTS:+$DEV_HOSTS,}127.0.0.1,::1"
export DEER_FLOW_ROOT="$DEST" BIND_HOST="0.0.0.0" PORT
( cd "$DEST/docker" && docker compose -p "$PROJECT" -f docker-compose-dev.yaml \
    up --no-build -d --remove-orphans redis frontend gateway nginx )

# ── 7. 容器内重新生成 uv.lock（与运行环境一致），再重启 gateway ───────────────
log "重新生成 uv.lock (容器环境) ..."
if ! docker run --rm \
     -v "$DEST/backend:/app/backend" -w /app/backend \
     -e UV_INDEX_URL="https://pypi.tuna.tsinghua.edu.cn/simple" \
     deer-flow-dev-gateway uv lock; then
  warn "uv lock 失败，使用保留的旧 lock 继续"
fi
log "重启 gateway 使新 lock 生效 ..."
( cd "$DEST/docker" && docker compose -p "$PROJECT" -f docker-compose-dev.yaml restart gateway ) >/dev/null

# ── 8. 健康检查 ──────────────────────────────────────────────────────────────
log "等待服务就绪 (最多 90s) ..."
ok=0
for i in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT" 2>/dev/null || true)"
  if [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "302" ]; then ok=1; break; fi
  sleep 3
done

echo
docker compose -p "$PROJECT" -f "$DEST/$COMPOSE_FILE" ps
echo
if [ "$ok" = "1" ]; then
  # ── 9. 自动初始化管理员账号（仅首次，幂等：已存在 admin 则跳过） ─────────
  # 这样部署后无需再手动访问 /setup 创建管理员，needs_setup=false 后前端
  # 也不会再引导到初始化页面。可用环境变量 ADMIN_EMAIL / ADMIN_PASSWORD 覆盖。
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@owlmind.com}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-OwlMind@2026}"
  BASE="http://localhost:$PORT"
  st=""
  for i in $(seq 1 20); do
    st="$(curl -s "$BASE/api/v1/auth/setup-status" 2>/dev/null || true)"
    echo "$st" | grep -q '"needs_setup"' && break
    sleep 2
  done
  if echo "$st" | grep -q '"needs_setup"[[:space:]]*:[[:space:]]*true'; then
    log "首次部署，自动创建管理员账号 ..."
    code="$(curl -s -o /tmp/init.out -w '%{http_code}' -X POST "$BASE/api/v1/auth/initialize" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"remember_me\":true}" || true)"
    if [ "$code" = "201" ] || [ "$code" = "409" ]; then
      log "✅ 管理员已就绪: $ADMIN_EMAIL"
      log "   默认密码: $ADMIN_PASSWORD  （首次登录后请在设置中修改）"
    else
      warn "自动初始化失败 (HTTP $code)，请手动访问 http://<VM-IP>:$PORT/setup"
      warn "响应: $(cat /tmp/init.out 2>/dev/null)"
    fi
  else
    log "管理员已存在，跳过初始化"
  fi
  log "✅ 部署完成，访问: http://<VM-IP>:$PORT"
else
  warn "⚠️  端口 $PORT 未在限时内返回 200，请检查日志: docker logs deer-flow-gateway"
fi
