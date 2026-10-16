# Wi‑Fi Float – pływający przycisk Wi‑Fi na Androida

Aplikacja na tablet/telefon (Android 8+), która:

1. pokazuje **okrągły przycisk Wi‑Fi zawsze na wierzchu** innych aplikacji,
2. pozwala **przeciągać** go po ekranie,
3. **włącza / wyłącza Wi‑Fi** po tapnięciu,
4. **uruchamia się sama po restarcie** tabletu (jeśli była włączona).

## Jak to działa z Wi‑Fi (jak MacroDroid Helper)

Od Androida 10 Google blokuje `WifiManager.setWifiEnabled()` **tylko** dla aplikacji
z `targetSdk ≥ 29`. MacroDroid Helper omija to, budując APK ze starym SDK.

Ta aplikacja robi to samo: `targetSdk = 28`, więc na realme / ColorOS przełączanie
Wi‑Fi działa **bez** `pm grant WRITE_SECURE_SETTINGS` (które na realme i tak pada
z `GRANT_RUNTIME_PERMISSIONS`).

## Instalacja

1. Pobierz `WifiFloat.apk` z [Releases](../../releases) albo z artefaktu Actions.
2. Zainstaluj (`adb install -r WifiFloat.apk` albo otwórz plik na tablecie).
3. Otwórz **Wi‑Fi Float** → nadaj **„Wyświetlanie nad innymi aplikacjami”**.
4. (Zalecane) wyłącz optymalizację baterii.
5. Dotknij **Włącz pływający przycisk**.

### Opcjonalne ADB

```bash
adb shell appops set pl.tablet.wififloat SYSTEM_ALERT_WINDOW allow
adb shell dumpsys deviceidle whitelist +pl.tablet.wififloat
```

## Budowanie

JDK 17+, Android SDK (platform 34):

```bash
cd android-wifi-float
./gradlew assembleRelease
# wynik: app/build/outputs/apk/release/app-release.apk
```

## Jak działa (kod)

| Plik | Rola |
|------|------|
| `FloatingWifiService` | Usługa pierwszoplanowa + overlay |
| `WifiController` | `WifiManager.setWifiEnabled` (dzięki targetSdk 28) |
| `BootReceiver` | Autostart po restarcie / aktualizacji |
| `MainActivity` | Włącz/wyłącz, uprawnienia |

**Uwaga:** na części ROM-ów Android 14+ system może pokazać dodatkowe potwierdzenie
przy zmianie Wi‑Fi (ograniczenie ColorOS). Na większości tabletów realme z działającym
MacroDroid Helper ten sam mechanizm powinien przejść bez pytania.
