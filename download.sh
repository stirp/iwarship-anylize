#!/bin/bash
curl 'https://iwarship.net/wowsdb/data/get-ship-data/torpedoes?ptMode=true' -H "cookie: $1" -H "user-agent: $2" > temp/鱼雷.json
curl 'https://iwarship.net/wowsdb/data/get-ship-data/aircraft?ptMode=true'  -H "cookie: $1" -H "user-agent: $2"  > temp/飞机.json
curl 'https://iwarship.net/wowsdb/data/get-ship-data/hull?ptMode=true'  -H "cookie: $1" -H "user-agent: $2"  > temp/船体.json
curl 'https://iwarship.net/wowsdb/data/get-ship-data/penetration?ptMode=true'  -H "cookie: $1" -H "user-agent: $2"  > temp/弹道穿深.json
curl 'https://iwarship.net/wowsdb/data/get-ship-data/artillery?ptMode=true'  -H "cookie: $1" -H "user-agent: $2"  > temp/火炮.json
curl 'https://iwarship.net/wowsdb/data/get-ship-data/atba?ptMode=true'  -H "cookie: $1" -H "user-agent: $2"  > temp/副炮.json
curl 'https://iwarship.net/wowsdb/data/get-ship-data/airDefense?ptMode=true'  -H "cookie: $1" -H "user-agent: $2"  > temp/防空.json
curl 'https://iwarship.net/wowsdb/data/get-ship-data/ability?ptMode=true'  -H "cookie: $1" -H "user-agent: $2"  > temp/消耗品.json
curl 'https://iwarship.net/wowsdb/data/get-ship-data/asw?ptMode=true'  -H "cookie: $1" -H "user-agent: $2"  > temp/反潜武器.json
curl 'https://iwarship.net/wowsdb/data/get-ship-data/airSupport?ptMode=true'  -H "cookie: $1" -H "user-agent: $2"  > temp/空袭.json