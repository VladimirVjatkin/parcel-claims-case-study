# Měření čtení tracking stránek

Stránek: 20 · Správně: 20 · Chybně: 0 (100 %)

> Stránky byly prohlédnuty při psaní parserů, nejde tedy o nezávislé měření, ale o regresní kontrolu.

## Podle dopravce

| Dopravce | Stránek | Správně |
|---|---|---|
| Doručto | 4 | 4 |
| Expedo | 5 | 5 |
| Kurýr Vltava | 6 | 6 |
| ParcelNord | 5 | 5 |

## Matice záměn (řádky = skutečnost z labels.csv, sloupce = parser)

|  | DELIVERED | IN_TRANSIT | RETURNING | UNKNOWN |
|---|---|---|---|---|
| DELIVERED | 5 | 0 | 0 | 0 |
| IN_TRANSIT | 0 | 9 | 0 | 0 |
| RETURNING | 0 | 0 | 4 | 0 |
| UNKNOWN | 0 | 0 | 0 | 2 |

## Chyby podle dopadu na rozhodnutí

Dopad se hodnotí podle definice B; u definice A vede každý stav kromě DELIVERED k ruční kontrole, nejdražší je tedy i zde falešné DELIVERED.

| Dopad | Význam | Počet |
|---|---|---|
| HIDDEN_PROBLEM | Skrytý problém: chybné potvrzení doručení zabrání reklamaci (nejdražší chyba). | 0 |
| WRONG_COMPLAINT | Nesprávná reklamace nebo založení bez potřebné ruční kontroly. | 0 |
| EXTRA_REVIEW | Zbytečná ruční kontrola (nejlevnější chyba). | 0 |
| NO_DECISION_IMPACT | Záměna RETURNING a UNKNOWN: oba stavy vyžadují ruční kontrolu. | 0 |

## Chybné stránky

Žádné chyby.
