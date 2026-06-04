#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI Deploy 命令行工具（Python 单文件版，仅标准库）。
与 Go 版 ai-deploy 行为对齐：login / submit / status，含 -exclude。
建议 Python 3.5+；推荐 3.6+。
"""
from __future__ import print_function

import argparse
import io
import json
import os
import subprocess
import sys
import threading
import uuid
import zipfile

try:
    from http.server import BaseHTTPRequestHandler, HTTPServer
except ImportError:
    BaseHTTPRequestHandler = None  # pragma: no cover
    HTTPServer = None

try:
    from urllib.parse import parse_qs, urlparse
    from urllib.request import Request, urlopen
except ImportError:
    sys.stderr.write("错误: 需要 Python 3\n")
    sys.exit(1)

DEFAULT_SERVER = "https://ai-deploy.feiyu.com"

EXCLUDE_LIST = (
    ".git",
    ".cursor",
    "node_modules",
    "bin",
    ".ai-deploy",
    "__pycache__",
    ".DS_Store",
    ".env",
)


def _config_path():
    home = os.path.expanduser("~")
    return os.path.join(home, ".ai-deploy", "config.json")


def load_config():
    path = _config_path()
    try:
        with io.open(path, "r", encoding="utf-8") as f:
            return json.loads(f.read())
    except Exception:
        return None


def save_config(cfg):
    path = _config_path()
    d = os.path.dirname(path)
    if not os.path.isdir(d):
        os.makedirs(d, 0o755)
    data = json.dumps(cfg, indent=2, ensure_ascii=False, sort_keys=False)
    with io.open(path, "w", encoding="utf-8") as f:
        f.write(data)
    try:
        os.chmod(path, 0o600)
    except Exception:
        pass


def get_server(flag_server):
    if flag_server:
        return flag_server.rstrip("/")
    env = os.environ.get("AI_DEPLOY_SERVER", "").strip()
    if env:
        return env.rstrip("/")
    cfg = load_config()
    if cfg and cfg.get("server"):
        return str(cfg["server"]).rstrip("/")
    return DEFAULT_SERVER


def require_login():
    cfg = load_config()
    if not cfg or not cfg.get("token"):
        raise RuntimeError("请先执行 ai-deploy login 进行登录")
    return cfg


def open_browser(url):
    if sys.platform == "darwin":
        cmd = ["open", url]
    elif sys.platform.startswith("linux"):
        cmd = ["xdg-open", url]
    elif sys.platform == "win32":
        cmd = ["cmd", "/c", "start", "", url]
    else:
        raise RuntimeError("不支持的操作系统: " + sys.platform)
    subprocess.Popen(cmd, close_fds=(sys.platform != "win32"))


def _should_exclude(name, merged):
    for ex in merged:
        if name == ex:
            return True
    return False


def pack_zip(dirpath, extra_exclude):
    merged = list(EXCLUDE_LIST)
    for e in extra_exclude or []:
        e = (e or "").strip()
        if e:
            merged.append(e)

    dirpath = os.path.abspath(dirpath)
    buf = io.BytesIO()
    zf = zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, allowZip64=True)
    sep = os.sep

    try:
        for root, dirs, files in os.walk(dirpath, topdown=True):
            rel_root = os.path.relpath(root, dirpath)
            if rel_root == ".":
                rel_root = ""

            pruned = []
            for d in dirs:
                full = os.path.join(root, d)
                rel = os.path.relpath(full, dirpath)
                parts = rel.replace("\\", sep).split(sep, 1)
                if _should_exclude(parts[0], merged) or _should_exclude(d, merged):
                    continue
                pruned.append(d)
            dirs[:] = pruned

            for fn in files:
                full = os.path.join(root, fn)
                rel = os.path.relpath(full, dirpath)
                if rel == ".":
                    continue
                parts = rel.replace("\\", sep).split(sep, 1)
                if _should_exclude(parts[0], merged) or _should_exclude(fn, merged):
                    continue
                arc = rel.replace("\\", "/")
                zf.write(full, arc)
    finally:
        zf.close()

    return buf.getvalue()


def _read_body(resp):
    body = resp.read()
    if not isinstance(body, bytes):
        body = body.encode("utf-8") if body else b""
    return body


def http_get_json(url, headers=None):
    req = Request(url, headers=headers or {})
    resp = urlopen(req)
    try:
        code = resp.getcode()
        body = _read_body(resp)
        return code, body
    finally:
        resp.close()


def http_post_multipart(url, field_name, filename, file_bytes, headers=None):
    boundary = "----WebKitFormBoundary" + uuid.uuid4().hex
    crlf = b"\r\n"
    disp = ('Content-Disposition: form-data; name="%s"; filename="%s"' % (field_name, filename)).encode("utf-8")
    pre = (
        b"--" + boundary.encode("ascii") + crlf + disp + crlf
        + b"Content-Type: application/zip" + crlf + crlf
    )
    post = crlf + b"--" + boundary.encode("ascii") + b"--" + crlf
    body = pre + file_bytes + post
    h = dict(headers or {})
    h["Content-Type"] = "multipart/form-data; boundary=" + boundary
    req = Request(url, data=body, headers=h)
    resp = urlopen(req)
    try:
        code = resp.getcode()
        rb = _read_body(resp)
        return code, rb
    finally:
        resp.close()


def get_user_me(server, token):
    url = server + "/api/me"
    code, body = http_get_json(url, {"Authorization": "Bearer " + token})
    if code != 200:
        raise RuntimeError("获取用户信息失败: " + body.decode("utf-8", errors="replace"))
    return json.loads(body.decode("utf-8"))


def do_login(server_url):
    if HTTPServer is None or BaseHTTPRequestHandler is None:
        raise RuntimeError("当前 Python 缺少 http.server，无法完成登录")

    token_holder = [None]
    err_holder = [None]
    done = threading.Event()
    httpd_holder = [None]

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            return

        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path != "/callback":
                self.send_response(404)
                self.end_headers()
                return
            qs = parse_qs(parsed.query)
            vals = qs.get("token") or []
            token = vals[0] if vals else ""
            if not token:
                err_holder[0] = RuntimeError("回调中未收到 token")
                html = (
                    "<html><body><h2>登录失败</h2>"
                    "<p>未收到 token，请重试。</p></body></html>"
                )
            else:
                token_holder[0] = token
                html = (
                    "<html><body><h2>登录成功！</h2>"
                    "<p>您可以关闭此窗口。</p></body></html>"
                )
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html.encode("utf-8"))
            done.set()
            h = httpd_holder[0]
            if h is not None:
                threading.Thread(target=h.shutdown).start()

    httpd = HTTPServer(("127.0.0.1", 0), Handler)
    httpd_holder[0] = httpd
    port = httpd.server_address[1]

    t = threading.Thread(target=httpd.serve_forever)
    t.daemon = True
    t.start()

    cli_login_url = "%s/auth/cli-login?port=%d" % (server_url, port)
    print("正在打开浏览器进行 SSO 授权登录...")
    try:
        open_browser(cli_login_url)
    except Exception as ex:
        print("无法自动打开浏览器: %s" % ex)
        print("请手动访问以下地址:")
        print(cli_login_url)

    if not done.wait(300):
        try:
            httpd.shutdown()
        except Exception:
            pass
        raise RuntimeError("登录超时，请重试")

    if err_holder[0] is not None:
        raise RuntimeError("登录过程出错: %s" % err_holder[0])

    token = token_holder[0]
    if not token:
        raise RuntimeError("登录过程出错: 未收到 token")

    try:
        httpd.server_close()
    except Exception:
        pass

    me = get_user_me(server_url, token)
    cfg = {
        "server": server_url,
        "token": token,
        "username": me.get("username") or "",
        "name": me.get("name") or "",
        "base26_id": me.get("base26_id") or "",
    }
    save_config(cfg)
    print("✓ 登录成功")
    print("  用户: %s" % cfg["username"])
    if cfg.get("base26_id"):
        print("  域名: http://%s.ai-deploy.feiyu.com" % cfg["base26_id"])


def do_submit(dir_arg, extra_exclude):
    cfg = require_login()
    server = str(cfg.get("server") or DEFAULT_SERVER).rstrip("/")

    if dir_arg:
        target = os.path.abspath(dir_arg)
        if not os.path.isdir(target):
            raise RuntimeError("目录不存在或不是目录: %s" % target)
    else:
        target = os.getcwd()

    print("正在打包项目文件（%s）..." % target)
    zip_data = pack_zip(target, extra_exclude)
    max_sz = 100 * 1024 * 1024  # 100MB
    if len(zip_data) > max_sz:
        mb = float(len(zip_data)) / (1024 * 1024)
        raise RuntimeError("打包文件过大（%.1fMB），超过 100MB 限制" % mb)

    print("正在上传...")
    code, body = http_post_multipart(
        server + "/api/upload",
        "file",
        "project.zip",
        zip_data,
        {"Authorization": "Bearer " + cfg.get("token", "")},
    )
    if code == 401:
        raise RuntimeError("登录已过期，请重新执行 ai-deploy login")
    if code != 200:
        try:
            err_obj = json.loads(body.decode("utf-8"))
            err_msg = err_obj.get("error") or body.decode("utf-8", errors="replace")
        except Exception:
            err_msg = body.decode("utf-8", errors="replace")
        raise RuntimeError("上传失败: %s" % err_msg)

    upload = json.loads(body.decode("utf-8"))
    print("✓ 上传成功！")
    print("  版本号: %s" % upload.get("version", ""))
    print("  预览地址: %s" % upload.get("url", ""))


def _fmt_time(s):
    if not s:
        return s
    s = str(s)
    try:
        from datetime import datetime

        if hasattr(datetime, "fromisoformat"):
            fixed = s.replace("Z", "+00:00") if len(s) > 10 and s.endswith("Z") else s
            dt = datetime.fromisoformat(fixed)
        else:
            dt = datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S")
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return s


def do_status():
    cfg = require_login()
    server = str(cfg.get("server") or DEFAULT_SERVER).rstrip("/")
    code, body = http_get_json(
        server + "/api/versions",
        {"Authorization": "Bearer " + cfg.get("token", "")},
    )
    if code == 401:
        raise RuntimeError("登录已过期，请重新执行 ai-deploy login")
    if code != 200:
        raise RuntimeError("获取版本列表失败: " + body.decode("utf-8", errors="replace"))

    data = json.loads(body.decode("utf-8"))
    versions = data.get("versions") or []

    print("用户: %s" % cfg.get("username", ""))
    bid = cfg.get("base26_id") or ""
    if bid:
        print("域名: http://%s.ai-deploy.feiyu.com" % bid)
    print("")
    if not versions:
        print("暂无部署版本")
        return

    print("版本列表:")
    for i, v in enumerate(versions):
        tag = " (latest)" if i == 0 else ""
        ver = v.get("version", "")
        created = _fmt_time(v.get("created_at", ""))
        print("  %s%s  %s" % (ver, tag, created))


def print_usage():
    print(
        """AI Deploy - 一键部署工具

用法:
  ai-deploy.py <命令> [参数]

可用命令:
  login    登录到部署服务器
  submit   打包并上传项目到部署服务器
  status   查看部署状态和版本历史

使用 "ai-deploy.py <命令> -h" 查看命令详情"""
    )


def main():
    argv = sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help", "help"):
        print_usage()
        return 0

    cmd = argv[0]
    rest = argv[1:]

    if cmd == "login":
        p = argparse.ArgumentParser(prog="ai-deploy.py login", add_help=True)
        p.add_argument(
            "-server",
            default="",
            help="服务器地址（默认同 Go 版，可用 AI_DEPLOY_SERVER 覆盖）",
        )
        args = p.parse_args(rest)
        try:
            do_login(get_server(args.server))
        except Exception as ex:
            sys.stderr.write("错误: %s\n" % ex)
            return 1
        return 0

    if cmd == "submit":
        p = argparse.ArgumentParser(prog="ai-deploy.py submit", add_help=True)
        p.add_argument(
            "-exclude",
            action="append",
            default=None,
            metavar="NAME",
            help="打包时额外排除的顶层目录名或文件名（可重复指定）",
        )
        p.add_argument(
            "directory",
            nargs="?",
            default="",
            help="要打包上传的项目目录（默认当前目录）",
        )
        args = p.parse_args(rest)
        ex = args.exclude if args.exclude is not None else []
        try:
            do_submit(args.directory, ex)
        except Exception as ex:
            sys.stderr.write("错误: %s\n" % ex)
            return 1
        return 0

    if cmd == "status":
        p = argparse.ArgumentParser(prog="ai-deploy.py status", add_help=True)
        p.parse_args(rest)
        try:
            do_status()
        except Exception as ex:
            sys.stderr.write("错误: %s\n" % ex)
            return 1
        return 0

    sys.stderr.write("未知命令: %s\n\n" % cmd)
    print_usage()
    return 1


if __name__ == "__main__":
    sys.exit(main() or 0)
