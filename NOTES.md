# Co jsem nestihl nebo vědomě vynechal

## Mimo řez

- Napojení na Mailship (retrack) a WMS (předávací protokol): data jsou ze souborů, dopravce zastupují uložené stránky.
- Samotné zakládání reklamací, ani jako konceptů: výstup je rozhodnutí nanečisto.
- Plánovaný běh, upozornění, vypínač a nasazení — jen v návrhu (DESIGN.md).

## Známá omezení

- Shoda nejnovějšího `createdAt` u reklamací klienta s různými reportéry: vybere se první v pořadí souboru; pravidlo zatím není určeno.
- Datum bez sekund nebo bez časového posunu (např. `2026-10-20T10:00+02:00`) vede k ruční kontrole (`MISSING_STATUS_DATE`), ne k odhadu.
- ParcelNord „Doručeno příjemci, podepsal: …“ se uzná jako `DELIVERED` bez ohledu na jméno; přísnější varianta je možná po dohodě s oddělením.

## Nalezeno a opraveno

- Parsery nesrovnávaly datum události s okamžikem stažení stránky: ParcelNord by doručení s budoucím datem uznal jako `DELIVERED`. Nalezeno upravenou stránkou při experimentu; opraveno jedním pravidlem pro všechny čtyři dopravce (datum z budoucnosti → `UNKNOWN`) s testy (podrobně `EXPERIMENT_LLM.md`).

## Vědomě vynecháno

- Jazykový model v rozhodování: pravidla a parsery stačí na strukturovaný vstup. Experiment s modely a jeho omezení (hostované modely, prompt psaný po prohlédnutí stránek, bez doučení) — viz `EXPERIMENT_LLM.md`.
- Nezávislé měření parserů: 20 stránek jsem viděl při vývoji, výsledek je regrese (`EVALUATION.md`).
- Kontrola, že stránka obsahuje číslo právě této zásilky: chránila by před `DELIVERED` z cizí stránky; v podkladech název souboru odpovídá číslu zásilky.
- Knihovna pro CSV: oba soubory CSV se čtou krátkým vlastním kódem.

Směr dalšího vývoje — viz `DALSI_KROKY.md`.
