# Galeria zdjęć z Google Drive na GitHub Pages

Statyczna strona (HTML + CSS + JS, bez serwera), która wyświetla zdjęcia z publicznego folderu Google Drive. Działa bezpośrednio na GitHub Pages.

## Funkcje

- Lista zdjęć pobierana na żywo z folderu Google Drive (Drive API v3), wraz z podfolderami
- Responsywna siatka, leniwe ładowanie miniatur, podgląd pełnoekranowy (klawiatura, gesty na telefonie)
- Wyszukiwanie po nazwie i sortowanie (data / nazwa)
- Linki „Otwórz w Drive” i „Pobierz” przy każdym zdjęciu
- Tryb bez klucza API: ręczna lista plików w `config.js`
- Tryb jasny / ciemny zależnie od ustawień systemu

## Uruchomienie krok po kroku

### 1. Przygotuj folder na Google Drive

1. Utwórz folder na Dysku Google i wgraj do niego zdjęcia.
2. Kliknij folder prawym przyciskiem → **Udostępnij** → **Ogólny dostęp**: „Każdy, kto ma link” (rola: *Przeglądający*).
3. Skopiuj link do folderu, np. `https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz`. Fragment po `/folders/` to **ID folderu**.

### 2. Utwórz klucz API Google

1. Wejdź na [Google Cloud Console](https://console.cloud.google.com/) i utwórz (lub wybierz) projekt.
2. **APIs & Services → Library** → znajdź **Google Drive API** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Zalecane zabezpieczenie klucza (jest widoczny w kodzie strony):
   - **Application restrictions**: *Websites* → dodaj `https://TWOJ-LOGIN.github.io/*` (oraz `http://localhost:*` do testów lokalnych),
   - **API restrictions**: *Restrict key* → tylko **Google Drive API**.

Klucz API pozwala jedynie czytać metadane publicznych plików – nie daje dostępu do prywatnych danych na Twoim Dysku.

### 3. Skonfiguruj stronę

Otwórz plik `config.js` i uzupełnij:

```js
window.GALLERY_CONFIG = {
  title: "Moja galeria",
  subtitle: "Wakacje 2024",
  folderId: "1AbCdEfGhIjKlMnOpQrStUvWxYz", // ID lub pełny link do folderu
  apiKey: "AIza...",                       // klucz API z kroku 2
  includeSubfolders: true,
  pageSize: 60,
  files: [],
};
```

Alternatywnie parametry można podać w adresie URL bez edycji plików:
`https://TWOJ-LOGIN.github.io/REPO/?folder=ID_FOLDERU&key=KLUCZ_API`
(na stronie jest też przycisk **Ustawienia**, który robi to za Ciebie).

### 4. Włącz GitHub Pages

1. W repozytorium: **Settings → Pages**.
2. W sekcji **Build and deployment** ustaw **Source: GitHub Actions**.
3. Wypchnij zmiany na gałąź `main` – workflow `.github/workflows/deploy.yml` opublikuje stronę automatycznie.
4. Adres strony: `https://TWOJ-LOGIN.github.io/NAZWA-REPO/`.

Jeśli wolisz nie używać Actions, w **Settings → Pages** wybierz **Deploy from a branch** → `main` / `/ (root)`. Strona działa tak samo – to zwykłe pliki statyczne.

## Tryb bez klucza API

Jeśli nie chcesz zakładać klucza API, wyświetl konkretne pliki: udostępnij każde zdjęcie jako „Każdy, kto ma link” i wpisz je w `config.js`:

```js
files: [
  { id: "1XyZ...", name: "Zachód słońca" },
  "https://drive.google.com/file/d/1AbC.../view",
],
```

W tym trybie lista jest stała – nowe zdjęcia w folderze nie pojawią się automatycznie.

## Testowanie lokalne

```bash
python3 -m http.server 8000
# otwórz http://localhost:8000
```

## Rozwiązywanie problemów

| Komunikat | Przyczyna / rozwiązanie |
| --- | --- |
| `403 … API has not been used in project` | Włącz **Google Drive API** w Google Cloud Console. |
| `403 … requests from referer … are blocked` | Dodaj adres strony do ograniczeń klucza (Websites). |
| `404 File not found` | Folder nie jest publiczny lub ID jest błędne. |
| Miniatury się nie ładują | Pliki muszą być udostępnione publicznie (dziedziczą uprawnienia z folderu). |
| Pusta galeria | W folderze nie ma plików typu `image/*` (np. HEIC bywa oznaczany inaczej – przekonwertuj do JPG). |

## Struktura plików

```
index.html                  – struktura strony
style.css                   – wygląd
app.js                      – logika (Drive API, galeria, podgląd)
config.js                   – Twoja konfiguracja
.github/workflows/deploy.yml – publikacja na GitHub Pages
terminy-komunikacja/        – osobne narzędzie: skrypt szukający terminu w Wydziale Komunikacji w Łańcucie
android/                    – to samo jako aplikacja na Androida (APK budowany przez GitHub Actions)
```

## Inne narzędzia

- [`terminy-komunikacja/`](terminy-komunikacja/README.md) – skrypt sprawdzający wolne terminy
  rejestracji pojazdu na [komunikacja.powiatlancut.pl](https://komunikacja.powiatlancut.pl/)
  z powiadomieniami na telefon.
- [`android/`](android/README.md) – aplikacja Android, która robi to samo w tle na telefonie
  i powiadamia dźwiękiem o nowym terminie. Gotowy plik APK w zakładce **Releases**.
