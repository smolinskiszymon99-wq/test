#!/usr/bin/env python3
"""
Szukanie wolnych terminów w systemie rezerwacji wizyt
Wydziału Komunikacji Starostwa Powiatowego w Łańcucie
(https://komunikacja.powiatlancut.pl/).

Skrypt rozmawia bezpośrednio z backendem Livewire strony (tak jak robi to
przeglądarka), przechodzi przez kroki „wybierz usługę” -> „wybierz termin”
i zbiera wszystkie dni oraz godziny, które da się zarezerwować.

Wymaga tylko Pythona 3.8+ (bez dodatkowych bibliotek).

Przykłady:
    python3 szukaj_terminu.py                     # jednorazowe sprawdzenie
    python3 szukaj_terminu.py --watch             # sprawdzaj co minutę, powiadom o nowych terminach
    python3 szukaj_terminu.py --watch --przed 2026-10-24 --ntfy moj-tajny-temat
    python3 szukaj_terminu.py --usluga 2          # prawa jazdy zamiast rejestracji pojazdów

Skrypt NIE rezerwuje wizyty - tylko ją znajduje. Rezerwacji dokonaj ręcznie
na stronie (termin jest trzymany krótko, więc warto mieć stronę pod ręką).
"""

from __future__ import annotations

import argparse
import datetime as dt
import email.header
import html
import http.cookiejar
import json
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "https://komunikacja.powiatlancut.pl"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
TIMEOUT = 30

SERVICES = {
    1: "Rejestracja pojazdów",
    2: "Prawa jazdy",
}


class SiteError(RuntimeError):
    """Strona odpowiedziała inaczej niż się spodziewamy (zmiana układu, blokada itp.)."""


# --------------------------------------------------------------------------- #
# Klient Livewire
# --------------------------------------------------------------------------- #
class LivewireClient:
    """Minimalna implementacja protokołu Livewire v3 dla jednego komponentu."""

    def __init__(self, base_url: str = BASE_URL, verbose: bool = False):
        self.base_url = base_url.rstrip("/")
        self.verbose = verbose
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookies)
        )
        self.csrf = ""
        self.update_url = ""
        self.snapshot = ""  # surowy JSON snapshotu komponentu (string)

    # -- pomocnicze -------------------------------------------------------- #
    def _log(self, msg: str) -> None:
        if self.verbose:
            print(f"    [debug] {msg}", file=sys.stderr)

    @property
    def data(self) -> dict:
        return json.loads(self.snapshot)["data"]

    # -- start sesji ------------------------------------------------------- #
    def open_form(self) -> None:
        req = urllib.request.Request(
            self.base_url + "/",
            headers={"User-Agent": USER_AGENT, "Accept-Language": "pl"},
        )
        with self.opener.open(req, timeout=TIMEOUT) as resp:
            page = resp.read().decode("utf-8", "replace")

        m = re.search(r'name="csrf-token"\s+content="([^"]+)"', page)
        if not m:
            raise SiteError("Nie znaleziono tokenu CSRF na stronie głównej.")
        self.csrf = m.group(1)

        m = re.search(r"(livewire-[A-Za-z0-9]+)/update", page)
        if not m:
            raise SiteError("Nie znaleziono adresu endpointu Livewire.")
        self.update_url = f"{self.base_url}/{m.group(1)}/update"

        # Snapshot komponentu formularza rezerwacji.
        for m in re.finditer(r'wire:snapshot="([^"]+)"', page):
            raw = html.unescape(m.group(1))
            try:
                snap = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if snap.get("memo", {}).get("name") == "reservation-form":
                self.snapshot = raw
                break
        if not self.snapshot:
            raise SiteError("Nie znaleziono komponentu 'reservation-form' na stronie.")
        self._log(f"sesja otwarta, endpoint {self.update_url}")

    # -- wywołanie metody komponentu --------------------------------------- #
    def call(self, method: str, *params) -> dict:
        body = json.dumps(
            {
                "_token": self.csrf,
                "components": [
                    {
                        "snapshot": self.snapshot,
                        "updates": {},
                        "calls": [{"path": "", "method": method, "params": list(params)}],
                    }
                ],
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            self.update_url,
            data=body,
            headers={
                "User-Agent": USER_AGENT,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Accept-Language": "pl",
                "X-Livewire": "",
                "X-CSRF-TOKEN": self.csrf,
                "Referer": self.base_url + "/",
                "Origin": self.base_url,
            },
        )
        try:
            with self.opener.open(req, timeout=TIMEOUT) as resp:
                payload = json.loads(resp.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            raise SiteError(f"{method}: HTTP {e.code} ({e.reason})") from e

        components = payload.get("components") or []
        if not components or "snapshot" not in components[0]:
            raise SiteError(f"{method}: nieoczekiwana odpowiedź serwera.")
        self.snapshot = components[0]["snapshot"]
        self._log(f"{method}{params} -> ok")
        return components[0].get("effects") or {}


# --------------------------------------------------------------------------- #
# Logika wyszukiwania terminów
# --------------------------------------------------------------------------- #
def _unwrap(value):
    """Livewire pakuje kolekcje/daty w pary [wartość, meta]. Zwraca samą wartość."""
    if isinstance(value, list) and len(value) == 2 and isinstance(value[1], dict) and "s" in value[1]:
        return _unwrap(value[0])
    if isinstance(value, list):
        return [_unwrap(v) for v in value]
    if isinstance(value, dict):
        return {k: _unwrap(v) for k, v in value.items()}
    return value


def _parse_date(value: str) -> dt.date:
    return dt.date.fromisoformat(value[:10])


def month_range(start: dt.date, end: dt.date):
    """Kolejne (miesiąc, rok) od start do end włącznie."""
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield m, y
        m += 1
        if m == 13:
            m, y = 1, y + 1


def find_slots(service_id: int, verbose: bool = False) -> dict[dt.date, list[str]]:
    """Zwraca słownik {data: [godziny...]} z wolnymi terminami dla danej usługi."""
    client = LivewireClient(verbose=verbose)
    client.open_form()

    services = {s["id"]: s for s in _unwrap(client.data["services"])}
    if service_id not in services:
        names = ", ".join(f"{k} = {v['name']}" for k, v in services.items())
        raise SiteError(f"Usługa o id {service_id} nie istnieje. Dostępne: {names}")
    if services[service_id].get("inactive"):
        raise SiteError(f"Usługa '{services[service_id]['name']}' jest obecnie nieaktywna.")

    client.call("selectService", service_id)
    client.call("nextStep")

    data = client.data
    step = _unwrap(data["currentStep"]).get("index")
    if step != 3 or data.get("calendar") is None:
        raise SiteError("Nie udało się przejść do kroku wyboru terminu.")

    today = dt.date.today()
    limit = _parse_date(_unwrap(data["calendarLimit"]))
    result: dict[dt.date, list[str]] = {}

    first_month = True
    for month, year in month_range(today, limit):
        if not first_month:
            client.call("setCalendar", month, year)
        first_month = False

        calendar = _unwrap(client.data["calendar"]) or []
        available_days = [
            _parse_date(day["date"])
            for day in calendar
            if day.get("isAvailable") and today <= _parse_date(day["date"]) <= limit
        ]
        for day in available_days:
            client.call("updateTimeOptions", day.strftime("%d.%m.%Y"))
            hours = _unwrap(client.data.get("timeOptions")) or []
            if hours:
                result[day] = sorted(hours)

    return dict(sorted(result.items()))


# --------------------------------------------------------------------------- #
# Powiadomienia
# --------------------------------------------------------------------------- #
def _post(url: str, data: bytes, headers: dict) -> None:
    req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT, **headers})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        resp.read()


def notify(args: argparse.Namespace, title: str, message: str) -> None:
    """Wysyła powiadomienie wszystkimi skonfigurowanymi kanałami."""
    errors = []
    if args.ntfy:
        topic = args.ntfy if "://" in args.ntfy else f"https://ntfy.sh/{args.ntfy}"
        try:
            _post(
                topic,
                message.encode("utf-8"),
                {
                    # Nagłówki HTTP muszą być ASCII; ntfy rozumie kodowanie RFC 2047.
                    "Title": email.header.Header(title, "utf-8").encode(),
                    "Priority": "high",
                    "Tags": "car,calendar",
                    "Click": BASE_URL,
                },
            )
        except Exception as e:  # noqa: BLE001
            errors.append(f"ntfy: {e}")

    if args.telegram_token and args.telegram_chat:
        try:
            _post(
                f"https://api.telegram.org/bot{args.telegram_token}/sendMessage",
                urllib.parse.urlencode(
                    {"chat_id": args.telegram_chat, "text": f"{title}\n\n{message}\n{BASE_URL}"}
                ).encode(),
                {"Content-Type": "application/x-www-form-urlencoded"},
            )
        except Exception as e:  # noqa: BLE001
            errors.append(f"telegram: {e}")

    if args.webhook:
        try:
            _post(
                args.webhook,
                json.dumps({"title": title, "message": message, "url": BASE_URL}).encode(),
                {"Content-Type": "application/json"},
            )
        except Exception as e:  # noqa: BLE001
            errors.append(f"webhook: {e}")

    for err in errors:
        print(f"  ! Błąd powiadomienia - {err}", file=sys.stderr)


WEEKDAYS = ["pon", "wt", "śr", "czw", "pt", "sob", "nd"]


def format_slots(slots: dict[dt.date, list[str]], compact: bool = False) -> str:
    """Lista terminów do wypisania. W trybie compact długie listy godzin są skracane
    (przydatne w powiadomieniach na telefon)."""
    if not slots:
        return "Brak wolnych terminów."
    lines = []
    for day, hours in slots.items():
        label = f"{day.isoformat()} ({WEEKDAYS[day.weekday()]})"
        if compact and len(hours) > 6:
            lines.append(f"{label}: {len(hours)} godzin ({hours[0]}-{hours[-1]})")
        else:
            lines.append(f"{label}: {', '.join(hours)}")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Szuka wolnych terminów w Wydziale Komunikacji w Łańcucie.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("Przykłady:", 1)[1] if "Przykłady:" in __doc__ else None,
    )
    p.add_argument(
        "--usluga",
        type=int,
        default=1,
        metavar="ID",
        help="id usługi: 1 = Rejestracja pojazdów (domyślnie), 2 = Prawa jazdy",
    )
    p.add_argument(
        "--przed",
        type=dt.date.fromisoformat,
        metavar="RRRR-MM-DD",
        help="interesują mnie tylko terminy przed tą datą (np. 2026-10-24)",
    )
    p.add_argument(
        "--watch",
        action="store_true",
        help="sprawdzaj w pętli i powiadamiaj o nowych terminach",
    )
    p.add_argument(
        "--interwal",
        type=int,
        default=60,
        metavar="SEK",
        help="odstęp między sprawdzeniami w trybie --watch (domyślnie 60 s, minimum 60)",
    )
    p.add_argument(
        "--czas",
        type=int,
        metavar="MIN",
        help="zakończ tryb --watch po tylu minutach (domyślnie działa do Ctrl+C)",
    )
    p.add_argument("--ntfy", metavar="TEMAT_LUB_URL", help="powiadomienie przez ntfy.sh (aplikacja na telefon)")
    p.add_argument("--telegram-token", metavar="TOKEN", help="token bota Telegram")
    p.add_argument("--telegram-chat", metavar="CHAT_ID", help="chat_id odbiorcy w Telegramie")
    p.add_argument("--webhook", metavar="URL", help="dowolny webhook (POST z JSON-em)")
    p.add_argument("--json", action="store_true", help="wypisz wynik jako JSON (do skryptów)")
    p.add_argument("--verbose", action="store_true", help="pokazuj szczegóły komunikacji ze stroną")
    args = p.parse_args(argv)
    args.interwal = max(60, args.interwal)
    return args


def filter_slots(slots: dict[dt.date, list[str]], before: dt.date | None) -> dict[dt.date, list[str]]:
    if before is None:
        return slots
    return {d: h for d, h in slots.items() if d < before}


def check_once(args: argparse.Namespace) -> dict[dt.date, list[str]]:
    slots = find_slots(args.usluga, verbose=args.verbose)
    return filter_slots(slots, args.przed)


def main(argv=None) -> int:
    args = parse_args(argv)
    service_name = SERVICES.get(args.usluga, f"usługa #{args.usluga}")

    if not args.watch:
        try:
            slots = check_once(args)
        except (SiteError, urllib.error.URLError, OSError) as e:
            print(f"Błąd: {e}", file=sys.stderr)
            return 2
        if args.json:
            print(json.dumps({d.isoformat(): h for d, h in slots.items()}, ensure_ascii=False, indent=2))
        else:
            suffix = f" przed {args.przed}" if args.przed else ""
            print(f"{service_name} - wolne terminy{suffix}:")
            print(format_slots(slots))
        if slots:
            notify(args, f"Wolny termin: {service_name}", format_slots(slots, compact=True))
        return 0 if slots else 1

    # Tryb ciągły
    print(
        f"Obserwuję terminy: {service_name}"
        + (f", przed {args.przed}" if args.przed else "")
        + f". Sprawdzanie co ~{args.interwal} s."
        + (f" Koniec po {args.czas} min." if args.czas else " Ctrl+C aby zakończyć.")
    )
    deadline = time.monotonic() + args.czas * 60 if args.czas else None
    known: set[tuple[dt.date, str]] = set()
    first_run = True
    while True:
        stamp = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        try:
            slots = check_once(args)
        except (SiteError, urllib.error.URLError, OSError) as e:
            print(f"[{stamp}] Błąd: {e}")
            slots = None

        if slots is not None:
            current = {(d, h) for d, hours in slots.items() for h in hours}
            new = current - known
            known = current
            if new:
                new_slots: dict[dt.date, list[str]] = {}
                for d, h in sorted(new):
                    new_slots.setdefault(d, []).append(h)
                header = "STAN POCZĄTKOWY" if first_run else "NOWE TERMINY"
                print(f"[{stamp}] {header} ({len(new)} wolnych godzin):")
                print("  " + format_slots(new_slots).replace("\n", "\n  "))
                print("\a", end="", flush=True)  # dzwonek w terminalu
                notify(
                    args,
                    f"Wolny termin: {service_name}",
                    format_slots(new_slots, compact=True),
                )
            elif first_run:
                print(f"[{stamp}] Stan początkowy: brak wolnych terminów. Czekam...")
            else:
                print(f"[{stamp}] Bez zmian ({len(current)} wolnych godzin).")
            first_run = False

        # Losowy rozrzut, żeby nie obciążać serwera w stałym rytmie.
        pause = args.interwal + random.uniform(0, args.interwal * 0.2)
        if deadline is not None and time.monotonic() + pause >= deadline:
            print(f"[{stamp}] Minął zadany czas ({args.czas} min) - kończę.")
            return 0
        time.sleep(pause)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nZakończono.")
        sys.exit(0)
