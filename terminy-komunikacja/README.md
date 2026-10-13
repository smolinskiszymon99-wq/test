# Szukanie terminu w Wydziale Komunikacji w Łańcucie

Skrypt `szukaj_terminu.py` sprawdza wolne terminy wizyt w systemie rezerwacji
[komunikacja.powiatlancut.pl](https://komunikacja.powiatlancut.pl/) – domyślnie
dla usługi **Rejestracja pojazdów**. Potrafi działać w pętli i powiadamiać
(telefon, Telegram, dowolny webhook), gdy pojawi się nowy termin.

Skrypt **nie rezerwuje** wizyty – tylko ją znajduje. Rezerwacji dokonujesz
ręcznie na stronie (wymaga podania danych i potwierdzenia e-mailem w ciągu godziny).

## Wymagania

Python 3.8 lub nowszy. Żadnych dodatkowych bibliotek.

## Użycie

```bash
cd terminy-komunikacja

# jednorazowe sprawdzenie - wypisze wszystkie wolne dni i godziny (do 30 dni w przód)
python3 szukaj_terminu.py

# tylko terminy wcześniejsze niż podana data
python3 szukaj_terminu.py --przed 2026-10-24

# tryb obserwacji: sprawdza co ~3 minuty i melduje tylko NOWE terminy
python3 szukaj_terminu.py --watch --przed 2026-10-24

# prawa jazdy zamiast rejestracji pojazdów
python3 szukaj_terminu.py --usluga 2

# wynik w formacie JSON (do własnych skryptów)
python3 szukaj_terminu.py --json
```

Kod wyjścia: `0` – znaleziono terminy, `1` – brak terminów, `2` – błąd.

## Powiadomienia

| Opcja | Opis |
| --- | --- |
| `--ntfy TEMAT` | Powiadomienie push przez [ntfy.sh](https://ntfy.sh). Zainstaluj aplikację ntfy na telefonie, zasubskrybuj wymyślony (trudny do zgadnięcia) temat, np. `lancut-auto-x7k2p`, i podaj go tutaj. Bez zakładania konta. |
| `--telegram-token TOKEN --telegram-chat ID` | Wiadomość z bota Telegram ([jak założyć bota](https://core.telegram.org/bots#botfather); `chat_id` sprawdzisz np. przez bota `@userinfobot`). |
| `--webhook URL` | `POST` z JSON-em `{"title", "message", "url"}` na dowolny adres (Discord/Slack przez pośrednika, Home Assistant itd.). |

Przykład – telefon dostaje push, gdy pojawi się termin przed 24.10:

```bash
python3 szukaj_terminu.py --watch --przed 2026-10-24 --ntfy lancut-auto-x7k2p
```

W trybie `--watch` powiadomienie przychodzi przy starcie (jeśli coś jest wolne)
oraz za każdym razem, gdy pojawi się godzina, której wcześniej nie było. Terminal
dodatkowo wydaje dźwięk (`\a`).

## Automatycznie na GitHub Actions (bez włączonego komputera)

Workflow `.github/workflows/terminy-komunikacja.yml` uruchamia skrypt co 30 minut
i wysyła powiadomienie na ntfy, jeśli znajdzie terminy spełniające warunki.

1. W repozytorium: **Settings → Secrets and variables → Actions**.
2. Dodaj **secret** `NTFY_TOPIC` – nazwa Twojego tematu ntfy.
3. Opcjonalnie dodaj **variable** `TERMIN_PRZED` (np. `2026-10-24`) – bez niej
   powiadomienie przyjdzie przy każdym uruchomieniu, w którym są jakiekolwiek terminy.
4. Workflow można też odpalić ręcznie z zakładki **Actions → Szukaj terminu – komunikacja Łańcut**.

Uwaga: GitHub może opóźniać zadania z harmonogramu o kilka–kilkanaście minut i
wyłącza harmonogram po 60 dniach bez aktywności w repozytorium.

## Jak to działa

Strona jest zbudowana na Laravel Livewire. Skrypt pobiera stronę główną,
odczytuje stan komponentu `reservation-form`, a potem wywołuje te same akcje,
które wykonuje przeglądarka po kliknięciach: `selectService(id)` → `nextStep` →
`setCalendar(miesiąc, rok)` → `updateTimeOptions("dd.mm.rrrr")`. Z odpowiedzi
odczytuje kalendarz (`isAvailable` dla każdego dnia) i listę wolnych godzin.
System udostępnia daty do 30 dni w przód – skrypt przegląda cały ten zakres.

Odstęp między sprawdzeniami ma dolny limit 60 s (plus losowy rozrzut), żeby nie
obciążać serwera urzędu.
