# Co jsem nestihl nebo vědomě vynechal

## Mimo řez

- **Napojení na Mailship (retrack) a WMS (předávací protokol).** Přístupy do systémů zadání nedává, proto jsou data ze souborů a dopravce zastupují uložené stránky. Čtení stránky je oddělené rozhraním `TrackingSource` (`src/tracking/trackingSource.ts`); napojení na živý zdroj znamená novou implementaci tohoto rozhraní, rozhodovací logika se nemění.
- **Samotné zakládání reklamací, ani jako konceptů.** Výstup je rozhodnutí nanečisto (`reports/rozhodnuti.md`). Zakládání konceptů je až druhá fáze nasazení (DESIGN.md, sekce 4) a vyžaduje odpovědi z QUESTIONS.md (viditelnost konceptu, mazání zamítnutých).
- **Plánovaný běh, upozornění, vypínač a nasazení** — jen v návrhu (DESIGN.md). Řez se spouští ručně (`npm run decide`) s pevným okamžikem běhu kvůli opakovatelnosti.

## Známá omezení

- **Shoda nejnovějšího `createdAt`** u reklamací klienta s různými reportéry: vybere se první v pořadí souboru; pravidlo zatím není určeno. V podkladech se nevyskytuje.
- **Datum bez sekund nebo bez časového posunu** (např. `2026-10-20T10:00+02:00`) vede k ruční kontrole (`MISSING_STATUS_DATE`), ne k odhadu: chybný počet dní ve stavu by mohl reklamaci založit předčasně.
- **ParcelNord „Doručeno příjemci, podepsal: …“** se uzná jako `DELIVERED` bez ohledu na jméno, protože dopravce výslovně uvádí doručení příjemci. Přísnější varianta (např. jen jméno, ne „soused“) je možná po dohodě s oddělením.
- **Jedna zásilka na objednávku.** Export má u objednávky jedno číslo zásilky; objednávku rozdělenou do více zásilek řez neumí (otázka pro vývoj).
- **Data na stránkách dopravců se čtou jako pražský čas.** Stránky časové pásmo neuvádějí; u dopravců z jiného pásma by bylo nutné to ověřit.

## Nalezeno a opraveno

- **Datum z budoucnosti.** Parsery nesrovnávaly datum události s okamžikem stažení stránky: ParcelNord by doručení s budoucím datem uznal jako `DELIVERED`, tedy nejdražší chybou. Nalezeno upravenou stránkou při experimentu; opraveno jedním pravidlem pro všechny čtyři dopravce (datum události nebo aktualizace po okamžiku stažení → `UNKNOWN`) s testy. Rozhodnutí ani měření na dodaných stránkách se nezměnila (podrobně `EXPERIMENT_LLM.md`).

## Vědomě vynecháno

- **Jazykový model v rozhodování.** Pravidla a parsery stačí na strukturovaný vstup a směr jejich chyby lze řídit. Model jsem změřil v experimentu: jako pomocník u nepoznané stránky je použitelný, rozhodovat nesmí. Omezení experimentu (hostované modely, prompt psaný po prohlédnutí stránek, bez doučení) — viz `EXPERIMENT_LLM.md`.
- **Nezávislé měření parserů.** 20 stránek jsem viděl při vývoji, výsledek 20 z 20 je proto regrese, ne odhad přesnosti v provozu (`EVALUATION.md`). Nezávislé měření: nové stránky ve stínovém provozu.
- **Kontrola, že stránka patří právě této zásilce** (číslo zásilky na stránce). Chránila by před `DELIVERED` z cizí stránky; v podkladech název souboru odpovídá číslu zásilky, proto jsem ji nepřidával. V provozu s živým zdrojem ji doporučuji.
- **Knihovna pro CSV.** Oba soubory CSV (`reporters.csv`, `labels.csv`) se čtou krátkým vlastním kódem s testy; další závislost by nic nepřinesla.

Směr dalšího vývoje — viz `DALSI_KROKY.md`.
