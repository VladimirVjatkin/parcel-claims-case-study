# Otázky k upřesnění

## Reklamační oddělení

- Brání založení i uzavřená reklamace, případně reklamace s jiným důvodem (např. `damaged`)? Zatím předpokládám, že ano.
- Znamená „Převzal soused“ doručení příjemci, a kdo takový případ prověřuje?
- Zakládáte reklamaci z důvodu ztráty i u zásilky, která čeká na výdejním místě s platnou úložní dobou?
- Ověřujete u definice A tracking, nebo reklamaci zakládáte rovnou bez něj?
- Vidí klient (reportér) reklamaci založenou jako koncept? Chodí mu o ní upozornění?
- Kdo smaže zamítnutý koncept? Jinak by blokoval další běhy; podle mého výkladu blokuje i uzavřená reklamace.
- Byli by referenti ochotni u ruční kontroly vybrat důvod rozhodnutí z krátkého seznamu a potvrdit, odkud informaci mají?

## Vývoj Mailshipu

- Proč Mailship ponechává stav `carrier_picked_up` poté, co dopravce potvrdil doručení příjemci?
- Proč export obsahuje duplicitní řádky (MS-2026-120101) a prázdné `orderNumber`, `carrier` nebo `trackingNumber`? Je to chyba exportu, nebo běžný stav dat?
- Máte nebo plánujete interní server pro jazykové modely, který by sloužil více úlohám? Pokud ano, jaký model na něm běží?
- Smí obsah tracking stránek (jména, adresy příjemců) opustit infrastrukturu Mailstepu? Předpokládám, že ne, proto navrhuji lokální model.
- Eviduje WMS předávací protokol (sken převzetí zásilky dopravcem)? Pokud ano, jak se k němu dostanu?
