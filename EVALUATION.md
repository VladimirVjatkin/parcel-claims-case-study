# Vyhodnocení čtení tracking stránek

## Co se měří

Měří se shoda čtyř pravidlových parserů s referenčními stavy v `data/tracking/labels.csv` na 20 uložených HTML stránkách. Spuštění: `npm run eval`; úplný výstup včetně matice záměn je v [reports/mereni.md](reports/mereni.md).

## Výsledek

Správně je klasifikováno **20 z 20 stránek (100 %)**, chyb je **0**. Jde o výsledek na dodaném souboru, nikoli odhad přesnosti v provozu.

## Jak číst chyby

Dopad se hodnotí podle definice B. `HIDDEN_PROBLEM` je falešné potvrzení doručení: reklamace by se nezaložila, proto jde o nejdražší chybu. `WRONG_COMPLAINT` znamená nesprávné založení nebo vynechání potřebné kontroly. `EXTRA_REVIEW` přidává ruční kontrolu a je nejlevnější. `NO_DECISION_IMPACT` je záměna RETURNING a UNKNOWN, které oba vyžadují kontrolu. U definice A vede každý stav kromě DELIVERED k ruční kontrole; i zde je nejdražší falešné DELIVERED.

## Omezení

Stránky byly prohlédnuty při vývoji parserů: jde o regresní kontrolu, ne nezávislé měření. Soubor je malý, pouze 20 stránek a 4–6 na dopravce. Bílý seznam DELIVERED při změně formulace dopravce raději vrací UNKNOWN než falešné doručení. Testy s vymyšlenými zápory a jinými příjemci ověřují směr chyby, nikoli její četnost. Omezení kontroly podepsaného příjemce a přiřazení stránky k zásilce jsou uvedena v [NOTES.md](NOTES.md).

## Co by bylo nezávislé měření

Nové stránky, které autor parserů předem neviděl. Ve stínovém provozu sledovat podíl UNKNOWN a ručně ověřovat vzorek DELIVERED; reklamace by se během ověřování skutečně nezakládaly.
