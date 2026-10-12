// Konfiguracja galerii.
// Uzupełnij poniższe wartości i wgraj plik do repozytorium – GitHub Pages
// wyświetli zdjęcia bez żadnego serwera.

window.GALLERY_CONFIG = {
  // Tytuł wyświetlany w nagłówku strony.
  title: "Galeria zdjęć",
  subtitle: "Zdjęcia ładowane bezpośrednio z Google Drive",

  // ID lub pełny link do folderu Google Drive udostępnionego jako
  // „Każdy, kto ma link może wyświetlać”.
  // Przykład: "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz"
  folderId: "",

  // Klucz API z Google Cloud Console z włączonym „Google Drive API”.
  // Zalecane: ogranicz klucz do Drive API oraz do domeny Twojej strony
  // (np. https://TWOJ-LOGIN.github.io/*), bo klucz jest widoczny w kodzie strony.
  apiKey: "",

  // Czy pokazywać zdjęcia również z podfolderów (wymaga apiKey).
  includeSubfolders: true,

  // Ile zdjęć pobierać na jedną stronę (maks. 1000).
  pageSize: 60,

  // TRYB BEZ KLUCZA API: ręczna lista plików. Jeśli nie podasz apiKey,
  // galeria wyświetli zdjęcia z tej listy. Każdy plik musi być udostępniony
  // publicznie („Każdy, kto ma link”). Możesz podać ID pliku lub pełny link.
  // Przykład:
  // files: [
  //   { id: "1XyZ...", name: "Wakacje 2024" },
  //   "https://drive.google.com/file/d/1AbC.../view",
  // ],
  files: [],
};
