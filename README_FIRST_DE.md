# Helvetic Freight

Diese Version konzentriert sich auf Städte, Betriebe, Netzwerkbau, Routen und die direkte Versorgungslogistik zwischen produzierenden Städten und Zielstädten.

Depot-Funktionen wurden entfernt, damit dieser Feature-Bereich später neu gestaltet werden kann.

## Neues Fahrzeugmodell hinzufügen

Ein Fahrzeugmodell wird als eigener Eintrag in `v2/vehicle-catalog.js` angelegt. Als
Pflichtangaben benötigt jeder Eintrag **Marke** (`brand`), **Modell** (`model`),
**Klasse** (`category`) und **Nutzlast** (`load`). Für ein im Spiel nutzbares Modell
werden außerdem der eindeutige Schlüssel `id` und der Verkehrsmodus `mode` gepflegt.

Die ID ist ein kleingeschriebener ASCII-Slug. Sie darf ausschließlich die Buchstaben
`a` bis `z`, Ziffern und einzelne Bindestriche als Trenner enthalten, zum Beispiel
`mercedes-sprinter`. Der Objektschlüssel im Katalog muss exakt dieser `id` entsprechen.
Unterschiedliche Modelle erhalten auch dann unterschiedliche IDs, wenn sie derselben
Klasse angehören: Die ID wird beim Kauf als `vehicleType` gespeichert.

Optional können **Geschwindigkeit** (`speed`), **Kaufpreis** (`cost`),
**Tageskosten** (`daily`), **Kilometerkosten** (`kmCost`), **Antrieb** (`drive`),
**Beschreibung** (`desc`) und **Besonderheiten** (`features`) angegeben werden. Die
aktuelle Spiellogik erwartet für kaufbare Modelle positive Zahlen für `speed`, `cost`,
`daily` und `kmCost`.

Das Hauptasset ist verpflichtend und liegt unter
`v2/assets/vehicles/<id>.png`. Optional kann für die Darstellung auf der Karte ein
eigenes Asset unter `v2/assets/vehicles/<id>-road.png` abgelegt werden; ohne dieses
wird das Hauptasset verwendet.
