# claude-intervals-icu

Claude + [intervals.icu](https://intervals.icu) dla kolarzy. Jeden plugin do Claude Code daje:

- **panel `/forma`** obok czatu: Fitness (CTL), Zmęczenie (ATL), Forma (TSB) w liczbach i w procentach ze strefą, ramp rate, ostatnie 7 dni, dzisiejszy trening z kalendarza i ostatnią jazdę. Odświeża się co 30 minut;
- **serwer MCP intervals.icu** ([hhopke/intervals-icu-mcp](https://github.com/hhopke/intervals-icu-mcp), wersja przypięta na 5.7.1), dzięki któremu Claude czyta aktywności, krzywe mocy, wellness i kalendarz, analizuje je i może układać treningi.

Projekt nie jest związany z intervals.icu. Każdy używa własnego klucza API, który zostaje na jego komputerze.

## Wymagania

- Claude Code (terminal, aplikacja desktop w zakładce Code albo VS Code). Panel `/forma` działa tylko w Claude Code.
- [uv](https://docs.astral.sh/uv/) (`brew install uv` albo `curl -LsSf https://astral.sh/uv/install.sh | sh`). Serwer MCP startuje przez `uvx`.
- Konto intervals.icu z wygenerowanym kluczem API.

## 1. Klucz intervals.icu

1. W intervals.icu: **Settings → Developer Settings → API Key → Generate**.
2. Athlete ID znajdziesz w adresie swojego profilu, na przykład `i123456`. Ważne: **razem z literą `i`**.
3. Utwórz plik z danymi:

```bash
mkdir -p ~/.config/intervals-icu && chmod 700 ~/.config/intervals-icu
```

```bash
printf 'INTERVALS_ICU_API_KEY=\nINTERVALS_ICU_ATHLETE_ID=\n' > ~/.config/intervals-icu/credentials.env && chmod 600 ~/.config/intervals-icu/credentials.env
```

```bash
open -e ~/.config/intervals-icu/credentials.env
```

Wpisz klucz po `INTERVALS_ICU_API_KEY=` i Athlete ID po `INTERVALS_ICU_ATHLETE_ID=`, bez cudzysłowów i spacji. Wzór jest w [`credentials.env.example`](credentials.env.example). Klucza nie wklejaj do czatu.

## 2. Instalacja

W sesji Claude Code w terminalu:

```
/plugin install intervals-form --marketplace akworob/claude-intervals-icu
```

Albo z powłoki:

```bash
claude plugin install intervals-form --marketplace akworob/claude-intervals-icu
```

Na pytanie `Add marketplace?` odpowiedz `y`, a potem wybierz zakres instalacji (Enter wybiera zakres użytkownika, czyli wszystkie sesje).

W aplikacji desktop, gdzie `/plugin` nie działa: kliknij **+** obok pola wiadomości, potem **Plugins**, **Add marketplace** z `akworob/claude-intervals-icu`, a następnie **Add plugin**.

## 3. Użycie

- `/forma` otwiera panel. Przycisk „Odśwież” pobiera dane od razu.
- W rozmowie po prostu pytaj, na przykład: „Jak wygląda moja forma i czy jestem przemęczony?”, „Porównaj moje krzywe mocy z zeszłego miesiąca”, „Ułóż plan jazd na tydzień, mam 7 h”. Claude skorzysta z serwera MCP.
- Serwer działa w trybie `INTERVALS_ICU_DELETE_MODE=safe`: Claude nie ma narzędzia do kasowania aktywności. Może za to usuwać zaplanowane wydarzenia i treningi z kalendarza, więc zapisy do konta zatwierdzaj świadomie.

## Zwykły czat Claude Desktop (bez panelu)

Serwer MCP działa też w czacie. W Claude Desktop: **Settings → Developer → Edit Config** i dopisz w `mcpServers`:

```json
"intervals-icu": {
  "command": "sh",
  "args": ["-c", "set -a; . \"$HOME/.config/intervals-icu/credentials.env\"; set +a; export INTERVALS_ICU_DELETE_MODE=safe; exec \"$HOME/.local/bin/uvx\" intervals-icu-mcp==5.7.1"]
}
```

Jeśli `uvx` jest w innym miejscu, podaj ścieżkę, którą wypisze `which uvx`. Potem zamknij i uruchom ponownie Claude Desktop.

## Gdy coś nie działa

| Objaw | Przyczyna |
|---|---|
| Panel: „Uzupełnij klucz API i Athlete ID” | Plik `~/.config/intervals-icu/credentials.env` nie istnieje albo jedna z wartości jest pusta. |
| Panel: „intervals.icu odrzuciło klucz API albo Athlete ID” | Wartości zamienione miejscami albo Athlete ID bez `i` na początku. |
| Brak narzędzi intervals.icu w rozmowie | Serwer MCP czyta plik z kluczem tylko przy starcie: uruchom nową sesję. Sprawdź też, czy `uvx` jest zainstalowany. |
| „Ostatnia jazda” pusta przy synchronizacji ze Stravy | API intervals.icu nie udostępnia szczegółów aktywności ze Stravy. Połącz Garmina albo Wahoo bezpośrednio z intervals.icu. |

## Jak liczone są strefy formy

Forma to TSB jako procent fitness (CTL). Panel stosuje do niej progi Friela: poniżej −30% wysokie ryzyko, od −30% do −10% optymalna, od −10% do +5% szara strefa, powyżej +5% świeżość. Strefa „Transition” nie jest wydzielana osobno.

## Licencja

MIT. Serwer MCP to osobny projekt [hhopke/intervals-icu-mcp](https://github.com/hhopke/intervals-icu-mcp) na licencji MIT, uruchamiany przez `uvx` z PyPI.
