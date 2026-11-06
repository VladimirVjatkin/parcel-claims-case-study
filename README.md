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

*Doplňuje se průběžně.*
