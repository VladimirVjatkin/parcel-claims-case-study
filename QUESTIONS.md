# Otázky k upřesnění

## Reklamační oddělení

- Brání založení i uzavřená reklamace, případně reklamace s jiným důvodem (např. `damaged`)? Zatím předpokládáme, že ano.
- Znamená „Převzal soused“ doručení příjemci, a kdo takový případ prověřuje?
- Zakládáte reklamaci z důvodu ztráty i u zásilky, která čeká na výdejním místě s platnou úložní dobou?
- Ověřujete u definice A tracking, nebo reklamaci zakládáte rovnou bez něj?

## Vývoj Mailshipu

- Proč Mailship ponechává stav `carrier_picked_up` poté, co dopravce potvrdil doručení příjemci?
- Máte nebo plánujete interní server pro jazykové modely, který by sloužil více úlohám? Pokud ano, jaký model na něm běží?
- Smí obsah tracking stránek (jména, adresy příjemců) opustit infrastrukturu Mailstepu? Předpokládám, že ne, proto navrhuji lokální model.
