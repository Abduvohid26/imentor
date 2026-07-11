#!/usr/bin/env python3
"""
Deploy imentor stack over SSH (password or private key).

Bitta buyruq — lokal git push + serverda pull/restart (SSH):
  python deploy/remote_deploy.py --push-then-server
  python deploy/remote_deploy.py --push-then-server --ref main --verbose

PowerShell (loyiha ildizidan):
  cd E:\\path\\to\\salomatlik-ai; python deploy/remote_deploy.py --push-then-server

Setup (this machine):
  pip install -r deploy/requirements-deploy.txt

Credentials — choose ONE:
  A) Environment variables (PowerShell):
     $env:SSH_HOST="164.90.186.193"
     $env:SSH_USER="root"
     $env:SSH_PASSWORD="your-password"
  B) Key file:
     $env:SSH_KEY_PATH="$env:USERPROFILE\\.ssh\\id_rsa"
  C) File deploy/.env.deploy.local (gitignored by .env*), lines KEY=value:
     SSH_HOST=...
     SSH_USER=root
     SSH_PASSWORD=...
     REMOTE_REPO_PATH=/opt/imentor
     GIT_REPO_URL=https://github.com/aiziyrak-coder/imentor.git
     GIT_REF=main
     IMENTOR_BACKEND_PORT=31002

CLI:
  python deploy/remote_deploy.py
  python deploy/remote_deploy.py --dry-run
  python deploy/remote_deploy.py --skip-nginx
  python deploy/remote_deploy.py --no-health
  python deploy/remote_deploy.py --ref main
  python deploy/remote_deploy.py --verbose
  python deploy/remote_deploy.py --push-then-server

Server-only (SSHsiz, repoda allaqachon klon bor):
  cd /opt/imentor && sh deploy/server-pull.sh

Do not commit passwords. Rotate any password ever pasted into chat.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path


def _import_paramiko():
    try:
        import paramiko

        return paramiko
    except ImportError:
        print("Install paramiko: pip install -r deploy/requirements-deploy.txt", file=sys.stderr)
        sys.exit(1)


def load_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.lower().startswith("export "):
            line = line[7:].strip()
        k, _, v = line.partition("=")
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def merge_env() -> dict[str, str]:
    path = Path(__file__).resolve().parent / ".env.deploy.local"
    out = load_env_file(path)
    for k, v in os.environ.items():
        if v is not None and str(v) != "":
            out[k] = v
    return out


def sh_single_quote(s: str) -> str:
    """POSIX single-quoted string literal (safe for paths and URLs)."""
    return "'" + s.replace("'", "'\"'\"'") + "'"


def preflight(cfg: dict[str, str]) -> None:
    host = cfg.get("SSH_HOST") or cfg.get("IMENTOR_SSH_HOST")
    if not (host or "").strip():
        raise SystemExit("Set SSH_HOST (or IMENTOR_SSH_HOST) in environment or deploy/.env.deploy.local")
    rp = (cfg.get("REMOTE_REPO_PATH") or "").strip()
    if rp and not rp.startswith("/"):
        raise SystemExit(f"REMOTE_REPO_PATH must be absolute (got {rp!r})")
    port_raw = (cfg.get("SSH_PORT") or "22").strip()
    try:
        p = int(port_raw)
        if not (1 <= p <= 65535):
            raise ValueError
    except ValueError:
        raise SystemExit(f"Invalid SSH_PORT: {port_raw!r}")


def ssh_connect(cfg: dict[str, str]):
    paramiko = _import_paramiko()
    host = (cfg.get("SSH_HOST") or cfg.get("IMENTOR_SSH_HOST") or "").strip()
    user = (cfg.get("SSH_USER") or cfg.get("IMENTOR_SSH_USER") or "root").strip()
    password = cfg.get("SSH_PASSWORD") or cfg.get("IMENTOR_SSH_PASSWORD")
    key_path = cfg.get("SSH_KEY_PATH") or cfg.get("IMENTOR_SSH_KEY_PATH")
    port = int((cfg.get("SSH_PORT") or "22").strip())

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    def try_load_key(path: Path):
        for KeyClass in (
            paramiko.RSAKey,
            paramiko.Ed25519Key,
            paramiko.ECDSAKey,
        ):
            try:
                return KeyClass.from_private_key_file(path)
            except Exception:
                continue
        return None

    pkey = None
    candidates: list[Path] = []
    if key_path:
        candidates.append(Path(key_path).expanduser())
    home = Path.home() / ".ssh"
    for name in ("id_ed25519", "id_rsa"):
        candidates.append(home / name)

    seen: set[str] = set()
    for cand in candidates:
        rp = str(cand.resolve())
        if rp in seen or not cand.is_file():
            continue
        seen.add(rp)
        pkey = try_load_key(cand)
        if pkey:
            break

    connect_kwargs = {
        "hostname": host,
        "port": port,
        "username": user,
        "timeout": 30,
        "banner_timeout": 30,
        "auth_timeout": 30,
    }
    if pkey:
        client.connect(**connect_kwargs, pkey=pkey)
    else:
        if not password:
            raise SystemExit(
                "Need SSH_PASSWORD or a working SSH_KEY_PATH (private key must be authorized on server)."
            )
        client.connect(**connect_kwargs, password=password)
    return client


def ssh_connect_with_retry(cfg: dict[str, str], *, attempts: int = 3, verbose: bool = False):
    last: Exception | None = None
    for i in range(attempts):
        try:
            return ssh_connect(cfg)
        except Exception as e:
            last = e
            if verbose:
                print(f"SSH connect attempt {i + 1}/{attempts} failed: {e}", file=sys.stderr)
            if i + 1 < attempts:
                time.sleep(min(8, 2 * (i + 1)))
    assert last is not None
    raise SystemExit(f"SSH connection failed after {attempts} attempts: {last}") from last


def run_git_push(repo_root: Path, git_ref: str, *, dry_run: bool, verbose: bool) -> None:
    cmd = ["git", "-C", str(repo_root), "push", "origin", git_ref]
    if dry_run:
        print("[dry-run]", " ".join(cmd))
        return
    if verbose:
        print("Local:", " ".join(cmd), file=sys.stderr)
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.stdout:
        print(r.stdout, end="")
    if r.stderr:
        print(r.stderr, end="", file=sys.stderr)
    if r.returncode != 0:
        raise SystemExit(f"git push failed with exit {r.returncode}")


def build_remote_server_pull_script(remote_path: str, git_ref: str) -> str:
    """On server: cd repo, set GIT_REF, run deploy/server-pull.sh (pull + docker + health)."""
    rp = sh_single_quote(remote_path)
    gr = sh_single_quote(git_ref)
    return f"""set -eu
cd {rp}
export GIT_REF={gr}
exec sh deploy/server-pull.sh
"""


def run(
    client,
    cmd: str,
    timeout: int = 900,
) -> tuple[int, str, str]:
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    stdout.channel.settimeout(1.0)
    stderr.channel.settimeout(1.0)
    out_chunks: list[str] = []
    err_chunks: list[str] = []
    deadline = time.time() + timeout
    while not stdout.channel.exit_status_ready():
        if time.time() > deadline:
            stdout.channel.close()
            raise SystemExit(f"Remote command timed out after {timeout}s")
        if stdout.channel.recv_ready():
            out_chunks.append(stdout.channel.recv(65536).decode("utf-8", errors="replace"))
        if stderr.channel.recv_stderr_ready():
            err_chunks.append(stderr.channel.recv_stderr(65536).decode("utf-8", errors="replace"))
        time.sleep(0.2)
    out_chunks.append(stdout.read().decode("utf-8", errors="replace"))
    err_chunks.append(stderr.read().decode("utf-8", errors="replace"))
    code = stdout.channel.recv_exit_status()
    return code, "".join(out_chunks), "".join(err_chunks)


def build_remote_deploy_script(
    *,
    remote_path: str,
    git_url: str,
    git_ref: str,
    health_port: int,
    run_health: bool,
) -> str:
    rp = sh_single_quote(remote_path)
    gu = sh_single_quote(git_url)
    gr = sh_single_quote(git_ref)
    hp = str(int(health_port))
    rh = "1" if run_health else "0"
    return f"""set -eu
REMOTE_PATH={rp}
GIT_URL={gu}
GIT_REF={gr}
HEALTH_PORT={hp}
RUN_HEALTH={rh}

echo "== Preconditions =="
command -v docker >/dev/null 2>&1 || {{ echo "ERROR: docker not found on server" >&2; exit 1; }}
docker compose version >/dev/null 2>&1 || {{ echo "ERROR: docker compose (v2) not found" >&2; exit 1; }}

if [ ! -d "$REMOTE_PATH/.git" ]; then
  mkdir -p "$(dirname "$REMOTE_PATH")"
  git clone "$GIT_URL" "$REMOTE_PATH"
fi
cd "$REMOTE_PATH"
git config --global --add safe.directory "$REMOTE_PATH" 2>/dev/null || true
git fetch origin
git checkout "$GIT_REF" 2>/dev/null || git checkout -b "$GIT_REF"
git pull --ff-only origin "$GIT_REF"

if [ ! -f deploy/.env.production ]; then
  echo "ERROR: create deploy/.env.production on server (copy from deploy/.env.production.example)" >&2
  exit 1
fi

echo "== Docker compose =="
docker compose -f docker-compose.prod.yml --env-file deploy/.env.production up --scale backend=2 -d --build
docker compose -f docker-compose.prod.yml --env-file deploy/.env.production ps

if [ "$RUN_HEALTH" = "1" ]; then
  echo "== Backend health (127.0.0.1:$HEALTH_PORT/api/health/) =="
  ok=0
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -sfS --max-time 12 "http://127.0.0.1:$HEALTH_PORT/api/health/" >/dev/null; then
      echo "OK: backend responded"
      ok=1
      break
    fi
    echo "  waiting ($i/10)..."
    sleep 4
  done
  if [ "$ok" != "1" ]; then
    echo "ERROR: backend health check failed after deploy (port $HEALTH_PORT)." >&2
    echo "Hint: check IMENTOR_BACKEND_PORT in deploy/.env.production and docker compose ps." >&2
    exit 1
  fi
fi
"""


def build_nginx_install_script() -> str:
    return r"""set -e
test -f /tmp/imentor.nginx.conf
cp /tmp/imentor.nginx.conf /etc/nginx/sites-available/imentor
ln -sf /etc/nginx/sites-available/imentor /etc/nginx/sites-enabled/imentor
nginx -t
systemctl reload nginx
echo "nginx reloaded for imentor"
"""


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="SSH deploy imentor")
    parser.add_argument("--dry-run", action="store_true", help="Only print remote commands")
    parser.add_argument("--skip-nginx", action="store_true", help="Do not upload/reload nginx config")
    parser.add_argument(
        "--no-health",
        action="store_true",
        help="Skip post-deploy curl to backend /api/health/ on the server",
    )
    parser.add_argument(
        "--ref",
        default=None,
        metavar="BRANCH",
        help="Git branch to deploy (default: GIT_REF env or main)",
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Print SSH target and retry noise")
    parser.add_argument(
        "--push-then-server",
        action="store_true",
        help="Run git push origin REF locally, then SSH: sh deploy/server-pull.sh on the server (no nginx upload)",
    )
    parser.add_argument(
        "--bootstrap",
        action="store_true",
        help="First-time server setup: install docker/nginx, clone repo, .env.production, SSL",
    )
    args = parser.parse_args()

    cfg = merge_env()
    preflight(cfg)

    repo_root = Path(__file__).resolve().parents[1]
    nginx_ssl = repo_root / "deploy" / "nginx" / "imentor-ssl.conf.example"
    nginx_local = repo_root / "deploy" / "nginx" / "imentor.conf.example"

    remote_path = (cfg.get("REMOTE_REPO_PATH") or "/opt/imentor").strip()
    git_url = (cfg.get("GIT_REPO_URL") or "https://github.com/aiziyrak-coder/imentor.git").strip()
    git_ref = (args.ref or cfg.get("GIT_REF") or cfg.get("REMOTE_GIT_REF") or "main").strip()

    openai_key = (cfg.get("OPENAI_API_KEY") or cfg.get("DEEPSEEK_API_KEY") or "").strip()

    if args.bootstrap:
        bootstrap_script = f"""set -eu
export DEBIAN_FRONTEND=noninteractive
export OPENAI_API_KEY={sh_single_quote(openai_key)}
export REMOTE_REPO_PATH={sh_single_quote(remote_path)}
export GIT_REPO_URL={sh_single_quote(git_url)}
export GIT_REF={sh_single_quote(git_ref)}
if [ -f deploy/server-bootstrap.sh ]; then
  cd {sh_single_quote(remote_path)} 2>/dev/null || true
  if [ -f deploy/server-bootstrap.sh ]; then
    exec sh deploy/server-bootstrap.sh
  fi
fi
# Bootstrap before repo exists — inline minimal setup then clone
apt-get update -qq
apt-get install -y -qq git curl nginx certbot python3-certbot-nginx 2>/dev/null || true
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker nginx 2>/dev/null || true
if [ ! -d {sh_single_quote(remote_path)}/.git ]; then
  mkdir -p "$(dirname {sh_single_quote(remote_path)})"
  git clone {sh_single_quote(git_url)} {sh_single_quote(remote_path)}
fi
cd {sh_single_quote(remote_path)}
git fetch origin && git checkout {sh_single_quote(git_ref)} 2>/dev/null || git checkout -b {sh_single_quote(git_ref)}
git pull --ff-only origin {sh_single_quote(git_ref)} 2>/dev/null || true
export OPENAI_API_KEY={sh_single_quote(openai_key)}
exec sh deploy/server-bootstrap.sh
"""
        if args.dry_run:
            print("--- bootstrap ---")
            print(bootstrap_script)
            return
        host = (cfg.get("SSH_HOST") or cfg.get("IMENTOR_SSH_HOST") or "").strip()
        user = (cfg.get("SSH_USER") or cfg.get("IMENTOR_SSH_USER") or "root").strip()
        port = (cfg.get("SSH_PORT") or "22").strip()
        if args.verbose:
            print(f"SSH bootstrap {user}@{host}:{port}", file=sys.stderr)
        client = ssh_connect_with_retry(cfg, attempts=3, verbose=args.verbose)
        try:
            code, out, err = run(client, bootstrap_script, timeout=3600)
            print(out)
            if err:
                print(err, file=sys.stderr)
            if code != 0:
                raise SystemExit(f"Bootstrap failed with exit {code}")
        finally:
            client.close()
        print("Bootstrap done.")
        return

    if args.push_then_server:
        pull_remote = build_remote_server_pull_script(remote_path, git_ref)
        if args.dry_run:
            run_git_push(repo_root, git_ref, dry_run=True, verbose=args.verbose)
            print("--- remote server-pull ---")
            print(pull_remote)
            return
        run_git_push(repo_root, git_ref, dry_run=False, verbose=args.verbose)
        host = (cfg.get("SSH_HOST") or cfg.get("IMENTOR_SSH_HOST") or "").strip()
        user = (cfg.get("SSH_USER") or cfg.get("IMENTOR_SSH_USER") or "root").strip()
        port = (cfg.get("SSH_PORT") or "22").strip()
        if args.verbose:
            print(f"SSH {user}@{host}:{port} -> {remote_path} (server-pull, ref={git_ref})", file=sys.stderr)
        client = ssh_connect_with_retry(cfg, attempts=3, verbose=args.verbose)
        try:
            code, out, err = run(client, pull_remote, timeout=2400)
            print(out)
            if err:
                print(err, file=sys.stderr)
            if code != 0:
                raise SystemExit(f"Remote server-pull failed with exit {code}")
        finally:
            client.close()
        print("Done: git push + server pull/restart.")
        return

    try:
        health_port = int((cfg.get("IMENTOR_BACKEND_PORT") or "31002").strip())
    except ValueError:
        raise SystemExit("Invalid IMENTOR_BACKEND_PORT in env or .env.deploy.local")
    if not (1 <= health_port <= 65535):
        raise SystemExit("IMENTOR_BACKEND_PORT out of range")

    remote_script = build_remote_deploy_script(
        remote_path=remote_path,
        git_url=git_url,
        git_ref=git_ref,
        health_port=health_port,
        run_health=not args.no_health,
    )
    nginx_install = build_nginx_install_script()

    if args.dry_run:
        print("--- remote deploy script ---")
        print(remote_script)
        print("--- nginx ---")
        print(nginx_install)
        return

    if not args.skip_nginx and not nginx_local.is_file():
        raise SystemExit(f"Missing {nginx_local} (use --skip-nginx to omit nginx step)")
    nginx_upload = nginx_ssl if nginx_ssl.is_file() else nginx_local

    host = (cfg.get("SSH_HOST") or cfg.get("IMENTOR_SSH_HOST") or "").strip()
    user = (cfg.get("SSH_USER") or cfg.get("IMENTOR_SSH_USER") or "root").strip()
    port = (cfg.get("SSH_PORT") or "22").strip()
    if args.verbose:
        print(f"SSH {user}@{host}:{port} -> {remote_path} (ref={git_ref})", file=sys.stderr)

    client = ssh_connect_with_retry(cfg, attempts=3, verbose=args.verbose)
    try:
        if not args.skip_nginx:
            sftp = client.open_sftp()
            try:
                sftp.put(str(nginx_upload), "/tmp/imentor.nginx.conf")
            finally:
                sftp.close()

        code, out, err = run(client, remote_script, timeout=2400)
        print(out)
        if err:
            print(err, file=sys.stderr)
        if code != 0:
            raise SystemExit(f"Deploy script failed with exit {code}")

        if not args.skip_nginx:
            code, out, err = run(client, nginx_install, timeout=120)
            print(out)
            if err:
                print(err, file=sys.stderr)
            if code != 0:
                print(
                    "Warning: nginx reload failed (maybe path differs). Fix SSH user=root or adjust sudo.",
                    file=sys.stderr,
                )
    finally:
        client.close()

    print("Done. Open https://imentor.uz after DNS + SSL (certbot) if needed.")


if __name__ == "__main__":
    main()
