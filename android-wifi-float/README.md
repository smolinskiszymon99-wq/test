# Wi‑Fi Float – pływający przycisk Wi‑Fi na Androida

Aplikacja na tablet/telefon (Android 8+), która:

1. pokazuje **okrągły przycisk Wi‑Fi zawsze na wierzchu** innych aplikacji,
2. pozwala **przeciągać** go po ekranie,
3. **włącza / wyłącza Wi‑Fi** po tapnięciu,
4. **uruchamia się sama po restarcie** tabletu (jeśli była włączona).

## Instalacja

1. Zbuduj APK albo pobierz artefakt z Actions (workflow `build-wifi-float.yml`).
2. Zainstaluj na tablecie (`adb install -r WifiFloat.apk` albo otwórz plik).
3. Otwórz **Wi‑Fi Float** → nadaj uprawnienie **„Wyświetlanie nad innymi aplikacjami”**.
4. (Zalecane) wyłącz optymalizację baterii dla aplikacji.
5. Dotknij **Włącz pływający przycisk**.

## Uprawnienia przez ADB (Android 10+)

Od Androida 10 zwykłe aplikacje **nie mogą** swobodnie przełączać Wi‑Fi.
Aplikacja próbuje kilku sposobów; najskuteczniejszy bez roota to nadanie
`WRITE_SECURE_SETTINGS` przez ADB:

```bash
# Overlay (zamiast klikania w ustawieniach)
adb shell appops set pl.tablet.wififloat SYSTEM_ALERT_WINDOW allow

# Przełączanie Wi-Fi na Android 10+ (działa na wielu tabletach / ROM-ach)
adb shell pm grant pl.tablet.wififloat android.permission.WRITE_SECURE_SETTINGS

# Żeby system nie uśpił usługi po restarcie
adb shell dumpsys deviceidle whitelist +pl.tablet.wififloat
```

Jeśli mimo to system zablokuje przełączenie, przycisk otworzy **panel Wi‑Fi**
systemu – jeden dodatkowy tap i Wi‑Fi się zmienia.

Na Androidzie 8–9 przełączanie działa bez ADB (`CHANGE_WIFI_STATE`).

## Budowanie

JDK 17+, Android SDK (platform 34):

```bash
cd android-wifi-float
./gradlew assembleRelease
# wynik: app/build/outputs/apk/release/app-release.apk
```

Albo otwórz katalog `android-wifi-float/` w Android Studio.

## Jak działa

| Plik | Rola |
|------|------|
| `FloatingWifiService` | Usługa pierwszoplanowa + overlay `TYPE_APPLICATION_OVERLAY` |
| `WifiController` | Przełączanie Wi‑Fi (WifiManager → Secure Settings → `svc wifi` → panel) |
| `BootReceiver` | Autostart po `BOOT_COMPLETED` / aktualizacji aplikacji |
| `MainActivity` | Włącz/wyłącz, uprawnienia, komendy ADB |

Przycisk zapamiętuje pozycję na ekranie. Zatrzymanie: z aplikacji, z powiadomienia
albo przyciskiem **Wyłącz pływający przycisk**.
