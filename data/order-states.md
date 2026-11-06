# Stavy objednávky

Objednávka v Mailshipu prochází (zjednodušeně) těmito stavy:

| Stav | Význam |
| --- | --- |
| `waiting_for_carrier` | zabaleno, čeká na převzetí dopravcem |
| `carrier_picked_up` | dopravce zásilku převzal |
| `delivered` | dopravce potvrdil doručení |
| `returning` | zásilka se vrací do skladu |

Export v `orders.json` obsahuje objednávky, které byly ve stavu `waiting_for_carrier` nebo
`carrier_picked_up` v posledních týdnech; některé se od té doby posunuly dál.

## Časové údaje na objednávce

| Pole | Kdy se nastavuje |
| --- | --- |
| `createdAt` | objednávka přišla z e-shopu |
| `packedAt` | objednávka přešla do stavu `waiting_for_carrier` |
| `shippedAt` | objednávka přešla do stavu `carrier_picked_up` |
| `updatedAt` | poslední změna čehokoli na objednávce, včetně poznámky nebo adresy |

Časy jsou ve formátu ISO 8601 s posunem vůči UTC.

## Počítání dnů

Reklamační oddělení počítá dny v kalendáři, jak je vidí v Praze: zásilka převzatá v pondělí
je ve středu dva dny ve stavu, bez ohledu na hodinu.

## Okamžik běhu

Pro účely úlohy předpokládejte, že automatizace běží **2. 11. 2026 v 07:30 pražského času**.

## Reklamace a vratky

`complaints.json` obsahuje reklamace všech stavů (`draft`, `open`, `closed`) včetně historie,
ze které se bere reportér. `returns.json` jsou vratky z WMS.
