#!/bin/bash

curl -s https://iwarship.net/wowsdb/index | grep "var shipName =" | grep -o '\"{.*}\"' | jq 'fromjson | with_entries(.key |= ascii_downcase)' > preset/name.json
