# DNS-blokkoló és hosts generátor

Ugyanaz a szűrőlista (`dist/domains.txt`), mint amit a böngésző-kiegészítő használ –
csak itt nem a böngészőben, hanem az egész gépen (vagy a teljes otthoni hálózaton).

Csak a Python szabványos könyvtárára épül, nincs `pip install`.

## 1. hosts fájl (a legegyszerűbb)

```bash
npm run build                     # frissíti a dist/domains.txt listát
python3 dns/blocker.py hosts      # -> dist/hosts.txt
```

Telepítés:

| Rendszer | Útvonal |
| --- | --- |
| Linux / macOS | `/etc/hosts` |
| Windows | `C:\Windows\System32\drivers\etc\hosts` |

```bash
# Linux/macOS – előbb mentsd el az eredetit!
sudo cp /etc/hosts /etc/hosts.backup
sudo cp dist/hosts.txt /etc/hosts
sudo systemctl restart NetworkManager   # vagy: sudo dscacheutil -flushcache (macOS)
```

**Előny:** minden programra hat, nulla telepítés, azonnal visszavonható.
**Hátrány:** a hosts fájl soronként egy domain, nagy listánál lassabb lehet, és a
böngésző beépített DoH-ja (DNS over HTTPS) megkerülheti – ilyenkor kapcsold ki a
böngészőben a „Secure DNS” opciót.

## 2. Helyi DNS-szerver (okosabb)

```bash
python3 dns/blocker.py serve --port 5335 --verbose
```

Ezután állítsd be a gép (vagy a router) DNS-ét `127.0.0.1:5335`-re, illetve a
router esetében a gép helyi IP-címére. A blokkolt nevekre `0.0.0.0` / `::`
választ ad, minden mást továbbít az upstream DNS-hez.

```bash
# rendszerszintű használat (53-as port, root kell)
sudo python3 dns/blocker.py serve --port 53 --upstream 1.1.1.1
```

Kapcsolók:

| Kapcsoló | Jelentés |
| --- | --- |
| `--list a.txt b.txt` | több lista egyszerre (saját lista is) |
| `--upstream 9.9.9.9` | továbbító DNS |
| `--port 53` | rendszerszintű használathoz |
| `--verbose` | minden kérés kiírása |
| `--quiet` | nincs élő számláló |

Kilépéskor kiírja a 10 leggyakoribb blokkolt domaint.

## 3. Ellenőrzés

```bash
python3 dns/blocker.py check doubleclick.net telex.hu
#   ✕ doubleclick.net – BLOKKOLVA
#   ✓ telex.hu – átengedve
```

## Saját lista hozzáadása

A listák sima szöveges fájlok, soronként egy domain. A `hosts`, a `||domain^` és
a sima domain alak is működik, a `#`-tel kezdődő sor komment:

```
# saját lista
reklam.pelda.hu
0.0.0.0 tracking.pelda.hu
||ads.pelda.hu^
```

```bash
python3 dns/blocker.py hosts --list dist/domains.txt sajat-lista.txt --out dist/hosts.txt
```

## Windows megjegyzés

A `serve` mód UDP-n figyel, a Windows tűzfal első indításkor rákérdez – engedélyezd
a privát hálózaton. A hosts fájlhoz rendszergazdai jogosultság kell.
