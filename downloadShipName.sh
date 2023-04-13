#!/bin/bash

curl -s https://iwarship.net/wowsdb/index | grep "var shipName =" | grep -o '\"{.*}\"' | jq 'fromjson' > preset/name.json
