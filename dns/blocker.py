#!/usr/bin/env python3
"""ReklámStop – helyi DNS-blokkoló és hosts-generátor.

Csak a Python szabványos könyvtárát használja, nincs pip-telepítés.

Parancsok
---------
  hosts                     hosts fájl írása a listából (alap: dist/hosts.txt)
  serve                     helyi DNS-szerver indítása (alap port: 5335)
  check pelda.hu            megmondja, hogy egy domain blokkolt-e

Példák
------
  python3 dns/blocker.py hosts --out dist/hosts.txt
  sudo python3 dns/blocker.py serve --port 53 --upstream 1.1.1.1 --verbose
  python3 dns/blocker.py check doubleclick.net
"""

from __future__ import annotations

import argparse
import os
import socket
import socketserver
import struct
import sys
import threading
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_LIST = os.path.join(BASE_DIR, "dist", "domains.txt")
DEFAULT_OUT = os.path.join(BASE_DIR, "dist", "hosts.txt")

QTYPE_A = 1
QTYPE_AAAA = 28
QTYPE_NAMES = {1: "A", 28: "AAAA", 5: "CNAME", 15: "MX", 16: "TXT", 65: "HTTPS"}


# --------------------------------------------------------------------------- #
# lista betöltése                                                              #
# --------------------------------------------------------------------------- #

def parse_line(line: str) -> str | None:
    """Egy sorból domain: támogat hosts, ||domain^ és sima domain alakot."""
    line = line.strip()
    if not line or line.startswith("#") or line.startswith("!"):
        return None
    # hosts formátum: "0.0.0.0 pelda.hu"
    parts = line.split()
    if len(parts) >= 2 and parts[0] in ("0.0.0.0", "127.0.0.1", "::1"):
        candidate = parts[1]
    else:
        candidate = parts[0]
    candidate = candidate.strip().lower()
    if candidate.startswith("||"):
        candidate = candidate[2:]
    candidate = candidate.split("^")[0].split("/")[0].strip("*.")
    if not candidate or "." not in candidate:
        return None
    if not all(part and all(c.isalnum() or c in "-_" for c in part) for part in candidate.split(".")):
        return None
    return candidate


def load_domains(paths: list[str]) -> set[str]:
    domains: set[str] = set()
    for path in paths:
        if not os.path.exists(path):
            print(f"  ! hiányzó lista, kihagyva: {path}", file=sys.stderr)
            continue
        with open(path, encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                domain = parse_line(line)
                if domain:
                    domains.add(domain)
    return domains


def is_blocked(domain: str, blocked: set[str]) -> bool:
    """A domain vagy bármely szülő-domainje szerepel-e a listán."""
    if not domain:
        return False
    domain = domain.lower().rstrip(".")
    while True:
        if domain in blocked:
            return True
        dot = domain.find(".")
        if dot == -1:
            return False
        domain = domain[dot + 1:]


# --------------------------------------------------------------------------- #
# hosts                                                                       #
# --------------------------------------------------------------------------- #

def cmd_hosts(args: argparse.Namespace) -> int:
    domains = load_domains(args.list)
    if not domains:
        print("Nem találtam domaint. Futtasd előbb: npm run build", file=sys.stderr)
        return 1

    sorted_domains = sorted(domains)
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        "# ReklámStop – generált hosts fájl",
        f"# Generálva: {stamp}  ({len(sorted_domains)} domain)",
        "#",
        "127.0.0.1 localhost",
        "::1 localhost",
        "",
    ]
    lines += [f"0.0.0.0 {d}" for d in sorted_domains]

    out = args.out
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")

    print(f"✓ {out}  ({len(sorted_domains)} domain)")
    print()
    print("Telepítés:")
    print("  Linux/macOS:  sudo cp dist/hosts.txt /etc/hosts")
    print("  Windows:      C:\\Windows\\System32\\drivers\\etc\\hosts (rendszergazdaként)")
    print("  Visszaállítás: mentsd el előre az eredeti hosts fájlt!")
    return 0


# --------------------------------------------------------------------------- #
# DNS szerver                                                                 #
# --------------------------------------------------------------------------- #

def read_name(data: bytes, offset: int) -> tuple[str, int]:
    """DNS név kiolvasása (a kérdés-szekcióban nincs tömörítés)."""
    labels = []
    pos = offset
    while True:
        if pos >= len(data):
            raise ValueError("csonka DNS üzenet")
        length = data[pos]
        pos += 1
        if length == 0:
            break
        if length & 0xC0:
            raise ValueError("tömörített név a kérdésben")
        labels.append(data[pos:pos + length].decode("latin-1"))
        pos += length
        if pos > len(data):
            raise ValueError("csonka DNS üzenet")
    return ".".join(labels).lower(), pos


def build_block_response(query: bytes, qtype: int) -> bytes:
    """0.0.0.0 / :: válasz a blokkolt névre."""
    qid = query[:2]
    flags = struct.pack(">H", 0x8180)  # QR=1, RD=1, RA=1, RCODE=0
    # a kérdés-szekció a 12. bájttól az első nulla hosszú címke + 4 bájt végéig tart
    _, pos = read_name(query, 12)
    question_end = pos + 4
    question = query[12:question_end]

    if qtype == QTYPE_A:
        rdata = b"\x00\x00\x00\x00"
    elif qtype == QTYPE_AAAA:
        rdata = b"\x00" * 16
    else:
        # egyéb típusra üres válasz (NODATA)
        header = qid + flags + struct.pack(">HHHH", 1, 0, 0, 0)
        return header + question

    header = qid + flags + struct.pack(">HHHH", 1, 1, 0, 0)
    answer = (
        b"\xc0\x0c"                      # névmutató a kérdésre
        + struct.pack(">HHIH", qtype, 1, 60, len(rdata))
        + rdata
    )
    return header + question + answer


class Stats:
    def __init__(self) -> None:
        self.blocked = 0
        self.allowed = 0
        self.errors = 0
        self.started = time.time()
        self.top: dict[str, int] = {}
        self.lock = threading.Lock()

    def hit(self, domain: str) -> None:
        with self.lock:
            self.blocked += 1
            self.top[domain] = self.top.get(domain, 0) + 1


class DNSHandler(socketserver.BaseRequestHandler):
    blocked: set[str] = set()
    upstream: str = "1.1.1.1"
    upstream_port: int = 53
    timeout: float = 3.0
    verbose: bool = False
    stats: Stats

    def handle(self) -> None:  # noqa: D401
        data, sock = self.request
        try:
            if len(data) < 12:
                return
            domain, pos = read_name(data, 12)
            qtype = struct.unpack(">H", data[pos:pos + 2])[0]
        except Exception:
            self.stats.errors += 1
            return

        if is_blocked(domain, self.blocked):
            self.stats.hit(domain)
            if self.verbose:
                print(f"  ✕ {domain}  ({QTYPE_NAMES.get(qtype, qtype)})")
            sock.sendto(build_block_response(data, qtype), self.client_address)
            return

        self.stats.allowed += 1
        if self.verbose:
            print(f"  → {domain}  ({QTYPE_NAMES.get(qtype, qtype)})")
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as out:
                out.settimeout(self.timeout)
                out.sendto(data, (self.upstream, self.upstream_port))
                response, _ = out.recvfrom(4096)
            sock.sendto(response, self.client_address)
        except Exception:
            self.stats.errors += 1
            if self.verbose:
                print(f"  ! továbbítás nem sikerült: {domain}", file=sys.stderr)


class ThreadingUDPServer(socketserver.ThreadingUDPServer):
    allow_reuse_address = True
    daemon_threads = True


def cmd_serve(args: argparse.Namespace) -> int:
    blocked = load_domains(args.list)
    if not blocked:
        print("Nem találtam domaint. Futtasd előbb: npm run build", file=sys.stderr)
        return 1

    stats = Stats()
    DNSHandler.blocked = blocked
    DNSHandler.upstream = args.upstream
    DNSHandler.upstream_port = args.upstream_port
    DNSHandler.timeout = args.timeout
    DNSHandler.verbose = args.verbose
    DNSHandler.stats = stats

    try:
        server = ThreadingUDPServer((args.host, args.port), DNSHandler)
    except PermissionError:
        print(
            f"Nem sikerült a {args.port}-es portot megnyitni (az 53-as porthoz root jog kell).\n"
            f"Próbáld magasabb porttal, pl.: --port 5335",
            file=sys.stderr,
        )
        return 1
    except OSError as err:
        print(f"Nem sikerült elindítani a szervert: {err}", file=sys.stderr)
        return 1

    print(f"ReklámStop DNS-blokkoló fut: {args.host}:{args.port}  (UDP)")
    print(f"  blokkolt domain: {len(blocked)}")
    print(f"  upstream:        {args.upstream}:{args.upstream_port}")
    print("  leállítás: Ctrl+C")
    print()

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        while True:
            time.sleep(1)
            if not args.quiet:
                elapsed = int(time.time() - stats.started)
                print(
                    f"\r  blokkolt: {stats.blocked}   átengedett: {stats.allowed}   "
                    f"hiba: {stats.errors}   fut: {elapsed // 60}:{elapsed % 60:02d}   ",
                    end="",
                    flush=True,
                )
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()
        if stats.top:
            print("\n\nLeggyakoribb blokkolt domainek:")
            for domain, count in sorted(stats.top.items(), key=lambda kv: -kv[1])[:10]:
                print(f"  {count:6d}  {domain}")
        print(f"\nÖsszesen blokkolva: {stats.blocked}, átengedve: {stats.allowed}")
    return 0


# --------------------------------------------------------------------------- #
# check                                                                       #
# --------------------------------------------------------------------------- #

def cmd_check(args: argparse.Namespace) -> int:
    blocked = load_domains(args.list)
    result = 1
    for domain in args.domains:
        domain = domain.strip().lower()
        if is_blocked(domain, blocked):
            print(f"  ✕ {domain} – BLOKKOLVA")
            result = 0
        else:
            print(f"  ✓ {domain} – átengedve")
    return result


# --------------------------------------------------------------------------- #
# CLI                                                                         #
# --------------------------------------------------------------------------- #

def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="ReklámStop – helyi DNS-blokkoló és hosts-generátor",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    default_lists = [DEFAULT_LIST]

    p_hosts = sub.add_parser("hosts", help="hosts fájl generálása")
    p_hosts.add_argument("--list", nargs="+", default=default_lists, help="domain lista fájl(ok)")
    p_hosts.add_argument("--out", default=DEFAULT_OUT, help="kimeneti fájl")
    p_hosts.set_defaults(func=cmd_hosts)

    p_serve = sub.add_parser("serve", help="helyi DNS-szerver indítása")
    p_serve.add_argument("--list", nargs="+", default=default_lists, help="domain lista fájl(ok)")
    p_serve.add_argument("--host", default="0.0.0.0", help="figyelt cím (alap: 0.0.0.0)")
    p_serve.add_argument("--port", type=int, default=5335, help="UDP port (alap: 5335, rendszerhez: 53)")
    p_serve.add_argument("--upstream", default="1.1.1.1", help="továbbító DNS (alap: 1.1.1.1)")
    p_serve.add_argument("--upstream-port", type=int, default=53)
    p_serve.add_argument("--timeout", type=float, default=3.0)
    p_serve.add_argument("--verbose", action="store_true", help="minden kérés kiírása")
    p_serve.add_argument("--quiet", action="store_true", help="nincs élő számláló")
    p_serve.set_defaults(func=cmd_serve)

    p_check = sub.add_parser("check", help="domain(ek) ellenőrzése a listán")
    p_check.add_argument("domains", nargs="+")
    p_check.add_argument("--list", nargs="+", default=default_lists)
    p_check.set_defaults(func=cmd_check)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
