# Terminy Komunikacja Łańcut – aplikacja Android

Natywna aplikacja na Androida (8.0+), która sprawdza wolne terminy wizyt w
Wydziale Komunikacji Starostwa Powiatowego w Łańcucie
([komunikacja.powiatlancut.pl](https://komunikacja.powiatlancut.pl/)) i powiadamia
dźwiękiem oraz wibracją, gdy pojawi się nowy termin. To ten sam mechanizm co w
skrypcie `terminy-komunikacja/szukaj_terminu.py`, tylko w formie aplikacji.

Aplikacja **nie rezerwuje** wizyty – po powiadomieniu dotykasz „Otwórz stronę
rezerwacji” i rezerwujesz sam.

## Instalacja na telefonie

1. Wejdź w zakładkę **Releases** repozytorium na GitHubie (albo **Actions →
   „Zbuduj aplikację Android (APK)” → ostatni udany run → Artifacts**) i pobierz
   plik `TerminyKomunikacja.apk` na telefon.
2. Otwórz pobrany plik. Android zapyta o zgodę na instalację z nieznanego
   źródła (dla przeglądarki / menedżera plików) – zezwól. Play Protect może
   ostrzec, że nie zna aplikacji – wybierz „Zainstaluj mimo to”.
3. Uruchom aplikację:
   - wybierz usługę (domyślnie *Rejestracja pojazdów*),
   - opcjonalnie ustaw datę „Tylko terminy przed” – dostaniesz powiadomienie tylko
     o wcześniejszych terminach,
   - zostaw odstęp 60 s (albo zwiększ, jeśli jesteś na danych mobilnych – jedno
     sprawdzenie to ok. 0,2 MB),
   - dotknij **Start**.
4. Zgódź się na powiadomienia i na **wyłączenie optymalizacji baterii** – bez tego
   Android zatrzyma sprawdzanie kilka minut po zgaszeniu ekranu. Na Xiaomi, Huawei,
   Samsung, OnePlus itp. dodatkowo w ustawieniach systemu włącz dla aplikacji
   „Autostart” i wyłącz ograniczenia w tle (patrz [dontkillmyapp.com](https://dontkillmyapp.com/)).

Dopóki obserwacja działa, na pasku powiadomień wisi stałe powiadomienie
„Szukam terminu…” ze statusem ostatniego sprawdzenia i przyciskiem **Zatrzymaj**.
Obserwacja wznawia się sama po restarcie telefonu. Gdy zarezerwujesz wizytę,
zatrzymaj ją, żeby nie odpytywać serwera urzędu bez potrzeby.

## Jak działa

- `LivewireClient.kt` – rozmawia z backendem Livewire strony tak jak przeglądarka
  (odczyt snapshotu komponentu, wywołania `selectService`, `nextStep`,
  `setCalendar`, `updateTimeOptions`), odpowiedzi w gzip.
- `SlotFinder.kt` – przechodzi kalendarz do limitu (30 dni) i zbiera wolne godziny.
- `WatchService.kt` – usługa pierwszoplanowa z pętlą: sprawdzenie → porównanie z
  poprzednim stanem → powiadomienie o nowych godzinach → odczekanie (odstęp +
  losowy rozrzut, minimum 60 s).
- `MainActivity.kt` – ekran z ustawieniami, przyciskami Start/Zatrzymaj/Sprawdź
  teraz i ostatnim wynikiem.

## Budowanie samodzielnie

Wymagany JDK 17+ i Android SDK (platforma 34, build-tools 34.0.0), np. przez
Android Studio.

```bash
cd android
./gradlew assembleDebug
# wynik: app/build/outputs/apk/debug/app-debug.apk
```

Albo otwórz katalog `android/` w Android Studio i uruchom na telefonie
podłączonym kablem (tryb programisty → debugowanie USB).

## Aktualizacje i podpisywanie

Workflow `.github/workflows/build-android.yml` buduje APK przy każdej zmianie w
`android/` na gałęzi `main` i publikuje go w **Releases**. Domyślnie APK jest
podpisany kluczem *debug* generowanym na bieżąco, więc przy instalacji nowszej
wersji Android zażąda odinstalowania poprzedniej (ustawienia aplikacji przepadną).

Żeby aktualizacje instalowały się „po wierzchu”, dodaj własny klucz:

```bash
keytool -genkeypair -v -keystore release.jks -alias terminy -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.jks   # (na macOS: base64 -i release.jks)
```

i w repozytorium **Settings → Secrets and variables → Actions** dodaj sekrety
`KEYSTORE_BASE64` (wynik powyższego polecenia), `KEYSTORE_PASSWORD`, `KEY_ALIAS`
(`terminy`), `KEY_PASSWORD`. Lokalnie to samo osiągniesz plikiem
`android/keystore.properties` z kluczami `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`,
`KEY_ALIAS`, `KEY_PASSWORD` (plik jest w `.gitignore`).
