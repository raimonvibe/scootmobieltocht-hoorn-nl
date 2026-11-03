#!/usr/bin/env bash
# Downloads the road/path network around Hoorn from OpenStreetMap (Overpass API).
# Run once (or whenever you want fresher data); the output is static data in data/raw/.
# The area is fetched in tiles so a busy public Overpass server doesn't time out.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw
SERVERS=(https://overpass-api.de/api/interpreter https://overpass.kumi.systems/api/interpreter https://maps.mail.ru/osm/tools/overpass/api/interpreter)
q() { # $1 query, $2 outfile
  for s in "${SERVERS[@]}" "${SERVERS[@]}"; do
    if curl -sS --fail -m 180 -A "scootmobiel-hoorn-map/1.0" "$s" --data-urlencode "data=$1" -o "$2"; then return 0; fi
    sleep 5
  done
  return 1
}
HW="^(primary|secondary|tertiary|unclassified|residential|living_street|service|cycleway|footway|path|pedestrian|track|primary_link|secondary_link|tertiary_link|steps)$"
i=0
for lat in 52.58 52.655; do for lon in 4.96 5.08; do
  bbox="$lat,$lon,$(echo "$lat+0.075"|bc),$(echo "$lon+0.12"|bc)"
  echo "tile $i: $bbox"
  q "[out:json][timeout:170];way[highway~'$HW']($bbox);out body geom qt;" "data/raw/ways_$i.json"
  i=$((i+1))
done; done
q "[out:json][timeout:60];node[place~'^(town|village|hamlet|suburb)$'](52.58,4.96,52.73,5.20);out body qt;" data/raw/places.json
ls -lh data/raw

# Kerbs and barriers (nodes on paths) and places useful for scootmobiel riders.
BBOX="52.58,4.96,52.73,5.20"
q "[out:json][timeout:170];(node[barrier]($BBOX);node[kerb]($BBOX););out body qt;" data/raw/barriers.json
q "[out:json][timeout:170];(nwr[amenity~'^(toilets|bench|pharmacy|charging_station)$']($BBOX);nwr[shop~'^(supermarket|mobility_scooter|medical_supply)$']($BBOX););out center tags qt;" data/raw/pois.json
ls -lh data/raw
