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

# tryb obserwacji: sprawdza co ~1 minutę i melduje tylko NOWE terminy
python3 szukaj_terminu.py --watch --przed 2026-10-24

# jak wyżej, ale co 5 minut i tylko przez 2 godziny
python3 szukaj_terminu.py --watch --interwal 300 --czas 120

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

Workflow `.github/workflows/terminy-komunikacja.yml` sprawdza stronę **co ~1 minutę,
całą dobę**. Cron GitHuba ma minimum 5 minut i bywa opóźniony, więc workflow działa
inaczej: jedno zadanie kręci pętlę `--watch --interwal 60` przez 350 minut
(limit pojedynczego zadania to 6 h), a harmonogram `0 */6 * * *` uruchamia
kolejne zadanie co 6 godzin. W publicznym repozytorium minuty Actions są darmowe.

Konfiguracja:

1. Zainstaluj na telefonie aplikację **ntfy** i zasubskrybuj wymyślony temat
   (trudny do zgadnięcia, np. `lancut-auto-x7k2p`).
2. W repozytorium: **Settings → Secrets and variables → Actions → Secrets → New repository secret**
   – nazwa `NTFY_TOPIC`, wartość: Twój temat.
3. Zakładka **Variables → New repository variable** – `TERMIN_PRZED`, np. `2026-10-24`
   (powiadomienia tylko o terminach wcześniejszych niż ta data). Bez tej zmiennej
   dostaniesz powiadomienie o każdym nowym terminie, a także o całym stanie
   początkowym przy każdym starcie zadania (co 6 h).
   Opcjonalnie `USLUGA` = `2` dla praw jazdy.
4. Pierwsze uruchomienie: **Actions → Szukaj terminu – komunikacja Łańcut → Run workflow**.
   Potem harmonogram przejmie pałeczkę (pierwszy start z crona może nastąpić
   dopiero po wejściu workflow na gałąź `main`).

Uwagi:

- Między kolejnymi zadaniami jest przerwa ok. 10 minut (koniec pętli po 350 min +
  opóźnienie crona). Nowy termin, który pojawi się w tej przerwie, zostanie zgłoszony
  na starcie następnego zadania jako „stan początkowy”.
- GitHub wyłącza harmonogram po 60 dniach bez aktywności w repozytorium – wtedy
  wystarczy odpalić workflow ręcznie.
- Gdy już zarezerwujesz wizytę, wyłącz workflow (**Actions → … → Disable workflow**),
  żeby nie odpytywać serwera urzędu bez potrzeby.

## Jak to działa

Strona jest zbudowana na Laravel Livewire. Skrypt pobiera stronę główną,
odczytuje stan komponentu `reservation-form`, a potem wywołuje te same akcje,
które wykonuje przeglądarka po kliknięciach: `selectService(id)` → `nextStep` →
`setCalendar(miesiąc, rok)` → `updateTimeOptions("dd.mm.rrrr")`. Z odpowiedzi
odczytuje kalendarz (`isAvailable` dla każdego dnia) i listę wolnych godzin.
System udostępnia daty do 30 dni w przód – skrypt przegląda cały ten zakres.

Odstęp między sprawdzeniami ma dolny limit 60 s (plus losowy rozrzut), żeby nie
obciążać serwera urzędu.
