# Návrh: automatické zakládání reklamací na uvízlé zásilky

Kandidát vzniká, protože objednávka je dlouho v jednom stavu: A — zabaleno, čeká na dopravce (≥ 2 dny); B — dopravce převzal (≥ 14 dní). Příčinou je skutečný problém (zásilka nebyla předána nebo se ztratila), nebo zastaralý stav v Mailshipu. **Dlouhý pobyt ve stavu je proto důvod k ověření, ne důkaz nedoručení.** V podkladech jsou tři takové objednávky (120105, 120117, 120124): dopravce doručení potvrdil, Mailship stále drží `carrier_picked_up`.

## Jak poběží automatizace každé ráno

1. Naplánovaná úloha načte objednávky a reklamace z Mailshipu a vratky z WMS.
2. Pravidla A/B vyřadí, co reklamaci mít nemá (okno, vyloučený způsob dopravy, existující reklamace, vratka), a určí reportéra.
3. Jen u zbylých kandidátů ověření u dopravce: retrack, záložně tracking stránka.
4. Report se třemi skupinami `CREATE` / `NEEDS_REVIEW` / `DO_NOT_CREATE` a kódy důvodů; později zakládání. Log, upozornění a vypínač *(návrh, v řezu není)*.

V řezu: `npm run decide` nad soubory, pevný okamžik běhu 2. 11. 2026 07:30 (Praha), aby byl výsledek opakovatelný.

## 1. Které části řeší pravidla a které jazykový model, a proč?

**Rozhodování řeší pravidla. Jazykový model patří jen ke čtení změněné stránky a jeho výstup jde vždy k člověku.**

| Část | Řeší | Proč |
|---|---|---|
| Definice A/B, dny ve stavu, vyloučené způsoby, existující reklamace, vratka, reportér | **pravidla** | Strukturovaný vstup, pevné podmínky („nikdo při tom nic neposuzuje“). Testovatelné a vysvětlitelné. |
| Stav z tracking stránky známého dopravce | **pravidla — parser pro každého dopravce** | Stálá struktura, ale s pastmi: u Doručta je stav jen barvou kroku v SVG, u Expeda je slovo „Doručeno“ i v reklamě, cookie liště a FAQ. Hlavně potřebuji řídit **směr chyby** (viz 3). |
| Změněná stránka známého dopravce | **jazykový model** *(návrh, v řezu není)* | Tady je vstup opravdu nestrukturovaný: parser stránku nepozná. Model navrhne stav s citací → `NEEDS_REVIEW` s doporučením, nikdy uzavřené `DELIVERED`. |

Model v provozu: pojistka pro nepoznanou stránku, detektor rozbitého parseru, denní porovnání s parserem na vzorku. Nový dopravce = plánovaný parser s testy.

Experiment s 6 otevřenými modely: předem stanovený práh nesplnil žádný model — model ani parser neznaly okamžik kontroly a uznaly doručení s budoucím datem. S okamžikem kontroly v promptu (dodatečný běh) budoucí datum gpt-oss 120B rozpoznal, Llama 3.3 70B ne; kontrola data proto patří do kódu (v parserech už je). Model by běžel lokálně u Mailstepu (stránky obsahují jména a adresy). **V rozhodování v řezu model nepoužívám, cena jednoho vyhodnocení je tedy 0.**

## 2. Jak ověřím, že zásilka opravdu nebyla doručená, a odkud tu informaci vezmu?

**Pravdu o doručení má dopravce. U B ji beru z retracku, a když je výsledek nejistý, z původního textu dopravce.**

- **B:** retrack z Mailshipu je první volba (levný, strukturovaný). Pokud ale jde přes stejné mapování stavů, může zopakovat chybu, kvůli které tři doručené objednávky stále drží `carrier_picked_up`. Při `UNKNOWN` nebo nesouladu proto rozhoduje tracking stránka.
- **A:** sken převzetí u dopravce; případně předávací protokol skladu, pokud ho WMS eviduje (ověřit). V řezu: jakýkoli stav `IN_TRANSIT` na stránce zpochybňuje „nevyzvednuto“ → `CARRIER_PICKUP_CONFIRMED`, ruční kontrola.

Předpoklad: stránka patří této zásilce a je aktuální; kód kontroluje jen datum z budoucnosti (NOTES.md).

## 3. Co se stane, když se ověření splete, a co, když nebude k dispozici?

**Chyby nemají stejnou cenu, proto je návrh nesymetrický: při pochybnosti ruční kontrola, ne „doručeno“.**

| Chyba | Důsledek | Ochrana |
|---|---|---|
| **Falešné „doručeno“** | Reklamace se nezaloží; ztracená zásilka může zmizet z reportu bez povšimnutí. **Nejdražší.** | Bílý seznam formulací doručení příjemci. Zápor, jiná osoba („Převzal: soused“) i neznámá věta → `UNKNOWN` → ruční kontrola. |
| **Zbytečná reklamace** | Reportér je kontakt klienta, reklamaci tedy pravděpodobně vidí e-shop; spor s dopravcem. | Sporné případy (soused, zásilka na výdejním místě s platnou úložní dobou) → `NEEDS_REVIEW`, ne `CREATE`. |
| **Špatný reportér** | Informace jde jinému kontaktu či klientovi. | Matice má přednost, reportér se nehádá; bez kontaktu → `NO_REPORTER`. |
| **Zbytečná ruční kontrola** | Levnější, ale ne zadarmo: případy se hromadí. | Podíl `NEEDS_REVIEW` je metrika (viz 5). |

Hraniční případy pravidel (časové pásmo, změna času, `updatedAt`) hlídají testy.

**Když ověření není k dispozici** (chybí dopravce, číslo zásilky, stránka nebo parser): `NEEDS_REVIEW` s `TRACKING_UNAVAILABLE`, nikdy tichý `CREATE` ani vynechání. Chybí-li nebo je poškozený vstupní export, běh skončí chybou a report nevznikne.

*Návrh, v řezu není:* upozornění při skokovém nárůstu `UNKNOWN` nebo `TRACKING_UNAVAILABLE` u jednoho dopravce, obvykle změněná stránka (nepoznanou strukturu parser hlásí jako `UNKNOWN` bez citace).

**Opakovaný běh je bezpečný:** existující reklamace v jakémkoli stavu (i koncept) založení blokuje; v ostrém provozu se kontrola zopakuje těsně před založením.

## 4. Jak to nasadím, aby první týdny nikomu neublížily?

1. **Stínový provoz, alespoň jeden měsíční cyklus** (jeden z reportů se dnes reviduje měsíčně). Nic se nezakládá; referent porovná ranní report se svou prací a každý nesoulad se rozebere.
2. **Zakládání konceptů.** Pro `CREATE` vznikne koncept, referent ho potvrdí (ověřit, že koncept klient nevidí). Zamítnutý koncept je nutné smazat, jinak by blokoval další běhy (blokuje každá existující reklamace, i uzavřená).
3. **Přímé zakládání** jen pro kategorie, které ve stínovém provozu neměly nesoulad (např. B + zásilka v přepravě); `NEEDS_REVIEW` zůstává lidem.

Jak se systém zlepšuje z rozhodnutí referenta (databáze případů, opravy parserů, učení modelu) — viz `DALSI_KROKY.md`.

## 5. Podle čeho poznám, že to funguje?

- Referent žádnou navrženou reklamaci nezruší; **zmeškané případy** (referent založil, automatizace ne): cíl 0, každý se rozebere.
- **Falešná `DELIVERED`** ve vzorku ručně ověřených stránek: cíl 0. Jediný nález zastaví přechod do další fáze.
- Podíl `NEEDS_REVIEW` a čas referenta; podíl `UNKNOWN` a `TRACKING_UNAVAILABLE` po dopravcích (nárůst = změna stránky); nesoulady s Mailshipem jdou do vývoje.

## Co je postaveno a co ne

Logika A/B a parsery čtyř dopravců s testy (5 `CREATE` / 12 `NEEDS_REVIEW` / 15 `DO_NOT_CREATE` z 32 objednávek; měření 20 z 20 je regrese); zbytek viz README a NOTES.md.
