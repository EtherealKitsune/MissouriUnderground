Missouri Underground

Offline mapping and archival workstation for documenting locations, research, timelines, and supporting evidence.

Built for:

abandoned places
field surveys
historical research
utility/drain exploration
long-term archive keeping

Everything stays local on your machine.

No accounts.
No cloud sync.
No subscriptions.

Part GIS tool, part dossier archive, part vibe-coded experiment.

Features
Offline maps using MBTiles
Dossier-style archive system
Timeline / chronology tracking
Research and supporting evidence organization
Portable .moarch archive sharing
Local media storage
Hero/reference image system

Archive linking using references like:

{MO-IND-00021}
Backup system
Offline-first workflow
Offline First

Missouri Underground is designed to work fully offline after setup.

Your:

maps
media
archives
exports
backups

all stay on your own machine.

.moarch

.moarch files are portable archive packages.

You can:

export a dossier
send it to someone else
import it into another workstation

Packages include:

archive information
timeline data
selected media
provenance information

while leaving out:

temporary files
UI state
unnecessary cache data
Offline Maps

Missouri Underground uses local .mbtiles basemaps for fully offline mapping.

Install a basemap through:

Map → Import .mbtiles…

Imported maps are stored locally under:

archive/maps/

Recommended Midwest/OpenStreetMap basemap sources:

MapTiler Midwest Dataset
OpenMapTiles

After importing a basemap once, the workstation restores it automatically on startup.

No online tile servers are required after setup.

Archive Structure

Default archive location:

Documents/MissouriArchive/archive/

Structure:

archive/
├─ database.sqlite
├─ media/
├─ maps/
├─ exports/
├─ backups/
Quick Start

Install dependencies:

npm install

Run development build:

npm run dev

Package the app:

npm run package
Usage
Action	How
Create dossier	Right-click map or press C
Open dossier	Click archive or map pin
Add media	Drag files into dossier
Export archive	File → Export Curated Archive Package
Import archive	File → Import .moarch
Install map	Map → Import .mbtiles…
Create backup	File → Create Backup
Tech Stack
Electron
React
TypeScript
SQLite
MapLibre GL
MBTiles
Builds

Current builds:

Windows installer
Portable Windows build

Linux support is planned.

License

GPL-3.0

You are free to:

use
modify
study
redistribute

the software under the GNU GPL v3 license.

Notes

Missouri Underground is an independently developed offline archival workstation focused on local ownership and long-term field documentation.

No telemetry.
No cloud sync.
No account system.

Just maps, archives, and local files.
