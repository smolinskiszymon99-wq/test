# Kontrola terminali produkcyjnych

Statyczna aplikacja PWA (HTML/CSS/JS) do cotygodniowego sprawdzania terminali na hali. Działa offline, bez backendu — gotowa na **GitHub Pages**.

## Adres po wdrożeniu

`https://<user>.github.io/<repo>/kontrola-terminali/`

## Jak zapisywana jest historia tygodni

Wszystkie dane trzymane są w **`localStorage`** przeglądarki (klucz `TERMINAL_KONTROLA_V1`).

Struktura:

```json
{
  "version": 1,
  "terminals": [ { "id", "name", "location", "active", "createdAt", "deletedAt", "locationHistory" } ],
  "checks": {
    "2026-W44": { "<terminalId>": true },
    "2026-W45": {}
  },
  "theme": "system",
  "seeded": true
}
```

- Klucz tygodnia to **ISO week** (`YYYY-Www`).
- Brak wpisu w danym tygodniu = **niesprawdzony**.
- Po starcie nowego tygodnia statusy zaczynają od zera (pusty obiekt tygodnia), a poprzednie klucze w `checks` zostają.
- Zakładki **Dashboard / Terminale / Niesprawdzone** pokazują **tylko bieżący tydzień**.
- Zakładka **Historia** pokazuje **wcześniejsze tygodnie**.
- **Eksport JSON** to pełna kopia zapasowa (terminale + cała historia) do przeniesienia między urządzeniami.

## Funkcje

- Dashboard z postępem i kafelkami lokalizacji
- Terminale w accordionie lokalizacji, duże checkboxy
- Przenoszenie z historią lokalizacji
- Soft-delete + przywracanie
- Raport niesprawdzonych + kopiowanie
- Import/export JSON, motyw jasny/ciemny/system
- Service Worker (offline)

## Lokalny podgląd

```bash
cd kontrola-terminali
python3 -m http.server 8080
# http://localhost:8080
```

## Lista startowa

Przy pierwszym uruchomieniu aplikacja wczytuje seed z `js/seed.js` (~95 terminali). Duplikat `PXCEMPL-M1017` (L06 + pre-series) został zredukowany do pierwszej lokalizacji (L06 CCS HPC).
