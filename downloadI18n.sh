#!/bin/bash

curl -s https://iwarship.net/wowsdb/index | grep I18N | grep zh-cn | grep -o '\"{.*}\"' | jq 'fromjson | with_entries(.key |= ascii_downcase)' > preset/i18n.json
sed -i "s/DOCK_CONSUME_TITLE_//Ig" preset/i18n.json
