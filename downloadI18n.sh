#!/bin/bash

curl -s https://iwarship.net/wowsdb/index | grep I18N | grep zh-cn | grep -o '\"{.*}\"' | jq 'fromjson' > preset/i18n.json
