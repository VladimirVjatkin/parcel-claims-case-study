# Podklady k case study

Všechna data jsou smyšlená: klienti, dopravci, e-maily (doména `.example`), čísla zásilek i tracking stránky.
Struktura odpovídá tomu, co v Mailshipu a WMS opravdu máme.

| Soubor | Co obsahuje |
| --- | --- |
| `orders.json` | export objednávek tak, jak ho vrací Mailship |
| `complaints.json` | reklamace všech stavů, včetně historie |
| `returns.json` | vratky z WMS |
| `reporters.csv` | matice kontaktů pro velké klienty |
| `rules.yaml` | pravidla reklamačního oddělení pro obě definice |
| `order-states.md` | stavy objednávky, časové údaje, počítání dnů, okamžik běhu |
| `tracking/*.html` | uložené tracking stránky čtyř fiktivních dopravců, název souboru = číslo zásilky |
| `tracking/labels.csv` | skutečný stav ke každé stránce |

## Stavy zásilky v `labels.csv`

| Stav | Význam |
| --- | --- |
| `DELIVERED` | zásilku převzal příjemce (u výdejního místa: příjemce ji vyzvedl) |
| `IN_TRANSIT` | zásilka je u dopravce nebo čeká na výdejním místě |
| `RETURNING` | zásilka se vrací nebo už byla vrácena odesílateli |
| `UNKNOWN` | ze stránky nejde potvrdit, že ji převzal příjemce |

Tracking stránky máme jen k části objednávek. U ostatních je ověření u dopravce nedostupné.
