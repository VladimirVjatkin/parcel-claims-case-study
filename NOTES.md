# Známá omezení

- Pokud má klient více reklamací s různými reportéry a shodným nejnovějším okamžikem `createdAt`, vybere se první z nich v pořadí souboru; pravidlo pro řešení této shody zatím není určeno.
- Datum musí obsahovat sekundy a časový posun (`Z` nebo `±hh:mm`); například `2026-10-20T10:00+02:00` vede k ruční kontrole (`MISSING_STATUS_DATE`), nikoli k odhadu data.
