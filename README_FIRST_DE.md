# Helvetic Freight Clean v1.1.38 – Versorgungslogistik

## Installation

Die APK direkt über die bestehende Clean-App installieren. Die vorherige Version **nicht deinstallieren**, damit der vorhandene Spielstand erhalten bleibt.

- Version: 1.1.38
- Android versionCode: 1138
- App-Label: Helvetic Clean38
- Paket-ID: ch.helveticfreight.new122
- Update-Signatur: identisch zu den bisherigen Clean-Versionen

## Neues Versorgungssystem

### Städte bestellen, Quellen liefern

Jede Zielstadt kann pro nachgefragter Ware einen Versorgungsvertrag einrichten. Als Quelle kann eine produzierende Stadt oder ein Depot gewählt werden. Das Fahrzeug und die Transportkapazität gehören immer der Quelle; Zielstädte holen keine Ware selbst ab.

### Lieferintervalle

- täglich: Auffüllen auf einen Tagesbedarf
- wöchentlich: Auffüllen auf sieben Tagesbedarfe
- bei wöchentlicher Versorgung ist der Wochentag frei wählbar
- vorhandener Bestand und bereits geplante Eingänge werden berücksichtigt

### Produzierende Städte und Depots

- besitzen stationierte Lieferfahrzeuge
- erhalten einen rollenden Sieben-Tage-Plan
- sind für Waren- und Transportkapazität verantwortlich
- lokale Produktion für dieselbe Stadt benötigt keinen Transport

### Routenplanung

Der Planer arbeitet pro Lieferquelle und kombiniert:

- mehrere Waren für dasselbe Ziel
- mehrere Zielorte auf einer Tour
- kompatible Waren im selben Fahrzeug
- nahe Ziele bei sinnvoller Umweg- und Kapazitätsbilanz
- mehrere Touren eines Fahrzeugs am selben Tag, wenn zeitlich möglich

Fahrzeuge einer Produktionsstadt sammeln keine Ware an einer anderen Produktionsstadt ein. Jede Quelle disponiert ausschließlich ihre eigenen Waren.

### Engpässe

- Teilmengen werden ausgeliefert
- Restmengen bleiben als offene Aufträge bestehen
- bei erlaubter Ersatzquelle wird automatisch eine andere produzierende Stadt oder ein Depot gesucht
- eine Ersatzquelle wird nur verwendet, wenn Ware, Strecke und stationierte Transportkapazität verfügbar sind

## Neue Bedienbereiche

### Im Stadtfenster

- Warenversorgung pro Ware
- Quelle auswählen
- täglich oder wöchentlich
- Wochentag auswählen
- automatische Ersatzquelle aktivieren
- Bestand, Tagesbedarf, geplante Eingänge und Status sehen

### In produzierenden Städten

- Ausgehende Logistik
- stationierten Fuhrpark kaufen und verkaufen
- erste tägliche Abfahrtszeit einstellen
- rollenden Wochenplan und Touren kontrollieren

### Im Depot

- ausgehende Stadtbelieferung
- Verträge, die das Depot als Quelle verwenden
- gemeinsame Wochenplanung mit dem bestehenden Depotfuhrpark

## Speicherkompatibilität

Das neue Modell ergänzt bestehende Spielstände um:

- supplyContracts
- sourceLogistics
- hfSupplyWeekPlan
- supplySystemSchema 138

Bestehende Fabriken, Depots, Fahrzeuge, Straßen, Lagerbestände und frühere Spielsysteme bleiben erhalten. Neue Versorgungsverträge werden erst aktiv, wenn der Spieler sie einrichtet. Für einen neuen Vertrag wird die alte automatische Depotbelieferung derselben Stadt/Ware unterdrückt, damit keine Doppelbelieferung entsteht.

## Automatische Prüfungen

Geprüft wurden unter anderem:

- normaler App-Start ohne JavaScript-Fehler
- tägliche Lieferung über eine automatische Ersatzquelle
- wöchentliche Verträge mit auswählbarem Liefertag
- Kombination mehrerer Waren für dasselbe Ziel
- Mehrstopp-Tour Zürich → Sissach → Liestal → Zürich
- Fahrzeugfreigabe nach Rückkehr zur Quelle
- Teil des rollenden Sieben-Tage-Plans
- bytegenaue Übereinstimmung zwischen getesteter HTML-Datei und APK-Asset
- DEX-SHA-1 und Adler32-Prüfsumme
- APK-Signatur und Zertifikat

Ein physischer Android-Gerätetest war in der Build-Umgebung nicht möglich.
