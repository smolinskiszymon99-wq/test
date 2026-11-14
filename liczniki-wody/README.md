# Liczniki wody – rozkład zużycia

Statyczna aplikacja webowa (HTML + CSS + JS) do rozłożenia zużycia z **trzech liczników wody** na poszczególne dni między datą początkową a końcową. Działa w przeglądarce, bez serwera — gotowa pod **GitHub Pages**.

## Adres po wdrożeniu

Po merge do `main` i deployu Pages:

`https://smolinskiszymon99-wq.github.io/test/liczniki-wody/`

## Funkcje

- Stany początkowe i końcowe trzech liczników + zakres dat
- Opcjonalny **limit maksymalnego zużycia licznika 2** na dzień
- Realistyczny, **niesztywny** rozkład:
  - weekendy zwykle wyżej (szczególnie soboty),
  - święta polskie z szerokim zakresem (cicho albo rodzinne spotkanie),
  - lekki wzrost latem,
  - losowy współczynnik tygodniowy — ta sama sobota nie ma zawsze +X%
- Zużycie dnia = suma przyrostów trzech liczników (`dzień następny − ten dzień`)
- Podział dnia na liczniki **w miarę proporcjonalny**, ale nie idealnie
- Kliknięcie wiersza podświetla go
- **Historia** ostatnich wyliczeń w `localStorage`
- Ponowne losowanie i eksport CSV

## Lokalne uruchomienie

```bash
cd liczniki-wody
python3 -m http.server 8080
# http://localhost:8080
```

## Skąd biorą się wagi dni

Orientacyjne środki wag oparte m.in. na:

- badaniach smart-meter: weekend w gospodarstwach ok. **10–21%** wyżej niż dni robocze,
- polskich analizach sieci (Białystok, Toruń, Olecko): niedziele/święta często niżej w skali miasta, ale w domu bywa odwrotnie przy gościach,
- typowym szczycie sobotnim w gospodarstwach (pranie, sprzątanie).

Każdy dzień dostaje losowy rozrzut wokół tych środków oraz osobny „charakter tygodnia”, więc wynik nie jest szablonem procentowym.
