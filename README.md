# Case study Mailstep — automatické zakládání reklamací

> Rozpracováno. Struktura dokumentu se doplňuje průběžně.

## Spuštění

```bash
npm ci
npm run all      # typecheck + testy + rozhodnutí + měření
```

Jednotlivě: `npm test`, `npm run decide`, `npm run eval`.
Požadavky: Node.js `^20.19.0 || >=22.12.0`. Bez sítě, bez databáze.

## Co je v repozitáři

| Soubor / složka | Obsah |
|---|---|
| `DESIGN.md` | Návrh (část 1) |
| `src/` | Rozhodovací logika a čtení tracking stránek |
| `test/` | Testy |
| `data/` | Podklady od Mailstepu (beze změn) |
| `EVALUATION.md` | Výsledek měření nad tracking stránkami |
| `QUESTIONS.md` | Otázky pro reklamační oddělení a vývoj Mailshipu |
| `NOTES.md` | Co jsem nestihl nebo vědomě vynechal |

## Výklad nejasností

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
