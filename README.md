# Case study Mailstep — automatické zakládání reklamací

## Spuštění

```bash
npm ci
npm run all      # typecheck + testy + rozhodnutí + měření
```

Jednotlivě: `npm test`, `npm run decide`, `npm run eval`.
Požadavky: Node.js `^20.19.0 || >=22.12.0`. Bez sítě, bez databáze.

`npm run decide` vypíše rozhodnutí pro všechny objednávky a nesoulady s Mailshipem na stdout a uloží je do `reports/rozhodnuti.md`.
Výsledek: 5 CREATE / 12 NEEDS_REVIEW / 15 DO_NOT_CREATE z 32 objednávek.
Bez parametru `--now` používá pevný okamžik 2. 11. 2026 07:30 (Praha); `npm run decide -- --now now` použije aktuální čas a výsledek pak závisí na dni spuštění.
Vlastní okamžik lze zadat například `npm run decide -- --now 2026-11-03T07:30:00+01:00`.
Přímé spuštění `npx tsx src/cli/decide.ts` píše pouze na stdout; soubor vzniká jen při `--out <cesta>`, vstupní adresář lze změnit pomocí `--data <cesta>` (výchozí `data`, relativně ke kořeni projektu).

`npm run eval` změří čtení 20 tracking stránek proti referenčním stavům a vypíše report na stdout i do `reports/mereni.md`; vysvětlení výsledků a omezení je v [EVALUATION.md](EVALUATION.md).
Přímé spuštění `npx tsx src/cli/evaluate.ts` píše jen na stdout; `--data` a `--out` fungují stejně jako u `decide`; `--now` určuje okamžik kontroly dat událostí na uložených stránkách.
`npm run all` provede kontrolu typů, testy, rozhodnutí i měření; při výchozím okamžiku běhu jsou oba reporty opakovatelné.

## Experiment s jazykovými modely

`npm run llm:eval` vyhodnotí uložené odpovědi bez sítě a bez `.env`; je součástí `npm run all`.
Sběr přes `npm run llm:collect` vyžaduje klíč v `.env` podle `.env.example` a používá placené API; existující odpovědi se nepřepisují.
Čísla jsou v [reports/llm-experiment.md](reports/llm-experiment.md); výklad výsledků je v [EXPERIMENT_LLM.md](EXPERIMENT_LLM.md).

Prompt v2 (`--prompt v2`) přidává pouze okamžik kontroly 3. 11. 2026 07:30 (Europe/Prague); sada je pevná: gpt-oss 120B a Llama 3.3 70B, vstup H, 26 stránek, 3 běhy. Odpovědi jsou oddělené v `experiments/llm/responses-v2/`; v1 se nemění. Okamžik stažení experimentální sady se liší od okamžiku rozhodování 2. 11. 2026 07:30.
Sekundární analýza v1 bez PN55100901 zachovává počet dovolených chyb (0 falešných DELIVERED, ≥ 72/75 validních, ≥ 54/60 správně původních, ≥ 3/5 užitečných, ≥ 23/25 stabilních). Obě doplnění vznikla po prvním vyhodnocení a nejsou nezávislým ověřením.

## Co je v repozitáři

| Soubor / složka | Obsah |
|---|---|
| `DESIGN.md` | Návrh (část 1) |
| `EXPERIMENT_LLM.md` | Experiment s jazykovými modely: výsledek a závěr |
| `DALSI_KROKY.md` | Směr dalšího vývoje — nápady nad rámec zadání |
| `src/` | Rozhodovací logika a čtení tracking stránek |
| `test/` | Testy |
| `data/` | Podklady od Mailstepu (beze změn) |
| `reports/` | Opakovatelné výstupní reporty rozhodnutí a měření |
| `experiments/llm/` | Kód experimentu, upravené stránky a uložené odpovědi modelů |
| `EVALUATION.md` | Výsledek měření nad tracking stránkami |
| `QUESTIONS.md` | Otázky pro reklamační oddělení a vývoj Mailshipu |
| `NOTES.md` | Co jsem nestihl nebo vědomě vynechal |

## Jak číst kód

- [src/decision/decide.ts](src/decision/decide.ts) spojuje pravidla, tracking a výsledné rozhodnutí pro každou objednávku.
- [src/layer1/rules.ts](src/layer1/rules.ts) vybírá kandidáty A/B, sbírá důvody a určuje, zda ověřit tracking.
- [src/layer2/trackingCheck.ts](src/layer2/trackingCheck.ts) převádí dostupnost a stav dopravce na důvody pro A nebo B.
- [src/tracking/parsers/](src/tracking/parsers/) obsahuje čtyři parsery se známými formulacemi a kontrolou dat událostí.
- [src/domain/types.ts](src/domain/types.ts) definuje společné typy, kódy důvodů a prioritu výsledků.

## Výklad nejasností

- Datum události nebo poslední aktualizace na stránce pozdější než okamžik stažení stránky (v řezu = okamžik běhu) → `UNKNOWN` (stránka není spolehlivá); lhůty (úložní doba, vyzvednutí do) se nekontrolují, stránka bez data se posuzuje jako dosud.
- Dny ve stavu se počítají od `packedAt` (A) / `shippedAt` (B) jako kalendářní dny v Europe/Prague; `updatedAt` se pro výpočet nepoužívá, protože se mění při jakékoli úpravě objednávky.
- Okamžik běhu je pevně 2. 11. 2026 07:30 (Praha), aby byl výsledek opakovatelný.
- Existující reklamace v jakémkoli stavu (i `closed`) a s jakýmkoli důvodem brání založení další.
- Vratka ve WMS v jakémkoli stavu brání založení (zadání: „i ve stavu Připraveno“).
- Reportér: matice má přednost; jinak poslední podle `createdAt` reklamace klienta bez ohledu na její stav a důvod; bez kontaktu následuje ruční kontrola (`NO_REPORTER`).
- Přesná kopie řádku v exportu se zpracuje jednou; rozdílné řádky se stejným `orderId` znamenají ruční kontrolu (`CONFLICTING_RECORDS`, s výčtem rozdílných polí) bez dalších pravidel a bez ověření trackingu.
- Chybějící `orderNumber` znamená ruční kontrolu (`MISSING_ORDER_NUMBER`): reklamace a vratky jsou navázané na číslo objednávky.
- Chybějící klíč v exportu se chová stejně jako `null`; prázdné `orderNumber` (i po odstranění okolních mezer) znamená chybějící číslo; bez neprázdného `orderId` nebo `status` se načítání zastaví s číslem záznamu.
- Při porovnávání čísel objednávek se u objednávek, reklamací i vratek odstraní okolní mezery; označení ve výsledku používá neprázdné oříznuté číslo objednávky, jinak číslo zásilky, jinak `orderId`.
- Chybějící nebo neplatné datum přechodu do stavu znamená ruční kontrolu (`MISSING_STATUS_DATE`).
- Chybějící `shippingMethod` znamená ruční kontrolu (`MISSING_SHIPPING_METHOD`): nelze ověřit vyloučený způsob dopravy.
- Chybějící `carrier` objednávku z pravidel A/B nevylučuje; dopravce se nehádá podle `shippingMethod`.
- Výsledek je jeden ze tří: `CREATE` / `DO_NOT_CREATE` / `NEEDS_REVIEW`, s uvedením zjištěných důvodů; priorita je `DO_NOT_CREATE > NEEDS_REVIEW > CREATE`.
- Golden test (`test/layer1.golden.test.ts`) je regresní: hlídá shodu s rozhodnutími v návrhu, není důkazem správnosti.
- Tracking čte samostatný pravidlový parser pro každého ze čtyř dopravců, bez jazykového modelu a jen z prvku se stavem; neznámý nebo nejednoznačný stav vrací `UNKNOWN`; u Doručta je stav jen barvou kroku v SVG, u Expeda je slovo „Doručeno“ i v reklamě a cookie liště.
- Stav `DELIVERED` se uzná jen tehdy, když celá zpráva odpovídá známé formulaci doručení příjemci; jakákoli jiná formulace doručení (zápor, jiná osoba, doplněk mimo povolený vzor) vede na `UNKNOWN` a ruční kontrolu; chybná `DELIVERED` by skryla ztracenou zásilku, chybná `UNKNOWN` stojí jen ruční kontrolu.
- U Kurýra Vltava a ParcelNordu se ostatní fráze (přeprava, návrat, výdejní místo) hledají pouze s hranicí slova na obou stranách podle Unicode písmen.
- U ParcelNordu se vybírá událost s nejvyšším datem a časem, ne podle pořadí řádků; nečitelná data, více tabulek nebo více událostí se shodným nejnovějším časem znamenají nejednoznačnost (`UNKNOWN`).
- `labels.csv` se v kódu rozhodování ani v parserech nečte; měření i regresní test používají společný načítač v `src/eval/`, který zpracuje všech pět sloupců včetně čárek a zdvojených uvozovek v citovaných polích.
- Test 20 tracking stránek je pouze regresní: stránky byly prohlédnuty při tvorbě parserů, nejde tedy o nezávislé měření.
- „Převzal: soused“ nepotvrzuje doručení příjemci: stav je `UNKNOWN` a následuje ruční kontrola (`TRACKING_UNKNOWN`).
- Stránka `DELIVERED` znamená reklamaci nezakládat a označit nesoulad s Mailshipem.
- Tracking nedostupný kvůli chybějícímu dopravci, číslu zásilky či stránce nebo dopravci bez parseru znamená ruční kontrolu (`TRACKING_UNAVAILABLE`); u nepodporovaného dopravce je v důvodu uvedeno jeho jméno.
- Definice A: jakýkoli stav `IN_TRANSIT` na stránce dopravce (včetně „Podáno“) zpochybňuje „nevyzvednuto“ a vyžaduje ruční kontrolu (`CARRIER_PICKUP_CONFIRMED`).
- Definice B: zásilka čekající na výdejním místě s platnou úložní dobou vyžaduje ruční kontrolu (`AT_PICKUP_POINT_STORAGE_ACTIVE`); úložní doba platí včetně posledního dne podle pražského data, po uplynutí nebo bez data se postupuje podle pravidel.
- Sledování se provádí i u případů `NEEDS_REVIEW` z první vrstvy, ale ne při důvodu `DO_NOT_CREATE` ani při konfliktu záznamů; důvody první vrstvy zůstávají před důvody trackingu.
- Experiment s jazykovými modely: pokus s odpovědí HTTP 429 (omezení počtu požadavků u poskytovatele) se nezapočítává do limitu 3 pokusů na slot, nejvýše však 10 pokusů celkem; ostatní chyby (časový limit, chyba sítě, chybná odpověď modelu) se počítají jako dosud. Pravidlo bylo upřesněno během sběru, před vyhodnocením.
- Slot se samými odpověďmi HTTP 429 je chybějící údaj kvůli omezení poskytovatele, nikoli `NO_ANSWER` modelu, i po vyčerpání 10 pokusů; práh příslušné dvojice nelze vyhodnotit (`nedostatek dat`), dílčí výsledky se zobrazují.
- Výstup je pouze rozhodnutí v režimu nanečisto: `CREATE` znamená „založili bychom“, žádná reklamace se skutečně nezakládá.
