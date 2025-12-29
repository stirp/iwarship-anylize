#!/usr/bin/fish
echo ""
echo "正在处理"$argv[1]
# set -l fish_trace on
set i 0
set name $argv[1]
set inputJson "temp/""$name"".json"
set mappingJson "mapping/""$name""mapping.json"
set outputJson "temp/""$name""Flat.json"
set outputCsv "$name""Flat.csv"
set nameFile "preset/name.json"
set i18nFile "preset/i18n.json"

set mapping (jq -r '"{" + (to_entries | map("\"" + .key + "\":" + .value) | join(",")) + "}"' $mappingJson)
function printProgressPlus
    set i (math $i + $argv[1])
    if  test $i -lt 100
        printf "[%-50s] %.2f%% \r" (perl -E "say\".\" x "(math $i/2)) "$i"
    else
        printf "[%-50s] %.0f%% " (perl -E "say\".\" x 50") "$i"
    end
end

printProgressPlus 0

jq 'map('$mapping')' $inputJson > $outputJson
printProgressPlus 10

set lines (jq -r '.[].index' $inputJson)
set lineSize (count $lines)
for lineName in $lines
    #set tempName (jq -r ".$lineName.zh" $nameFile)
    set tempName (jq -r "."(echo $lineName | tr A-Z a-z)".zh" $nameFile)
    if test $tempName != null
        sed -i  "s/$lineName/"$tempName"/g" $outputJson
    end
    printProgressPlus (math "1/$lineSize * 40")
end

set i18nLines (jq -r 'map(.i18nkey|values) | add| values | unique | map(select(. != null)) | .[]' $outputJson)
set i18nLineSize (count $i18nLines)
for i18nkey in $i18nLines
    set lowerI18nKey (echo $i18nkey | tr A-Z a-z)
    sed -i  "s|$i18nkey|"(jq -r ".$lowerI18nKey | gsub(\"\n\";\" \")" $i18nFile)"|g" $outputJson
    printProgressPlus (math "1/$i18nLineSize * 40")
end
if test $i18nLineSize -eq 0
    printProgressPlus 40
end

printf '\xEF\xBB\xBF' > $outputCsv

echo (for line in (jq 'keys_unsorted[] ' $mappingJson)
        if test $line != "\"i18nkey\""
            printf $line,
        end
    end) >> $outputCsv
set csvMapping (echo (for line in (jq 'keys_unsorted[] ' $mappingJson)
                        if test $line != "\"i18nkey\""
                            printf .$line,
                        end
                    end))

set csvMapping (string sub -l (math (string length $csvMapping)" - 1") $csvMapping)

jq -r '.[] | ['$csvMapping'] | @csv' $outputJson >> $outputCsv

function replace
    sed -i "s/"$argv[1]"/"$argv[2]"/g" $argv[3]
end

replace "\"demoWithoutStats\"" "\"测试\"" $outputCsv
replace "\"demoWithStats\"" "\"测试\"" $outputCsv
replace "\"earlyAccess\"" "\"抢先体验\"" $outputCsv
printProgressPlus 1
replace "\"specialUnsellable\"" "\"不可出售\"" $outputCsv
replace "\"special\"" "\"加值\"" $outputCsv
replace "\"start\"" "\"初始\"" $outputCsv
printProgressPlus 1
replace "\"superShip\"" "\"超战\"" $outputCsv
replace "\"ultimate\"" "\"特种\"" $outputCsv
replace "\"upgradeableExclusive\"" "\"全局研发\"" $outputCsv
printProgressPlus 1
replace "\"upgradeableUltimate\"" "\"全局特种\"" $outputCsv
replace "\"upgradeable\"" "\"研发\"" $outputCsv
replace "\"Battleship\"" "\"战列舰\"" $outputCsv
printProgressPlus 1
replace "\"Destroyer\"" "\"驱逐舰\"" $outputCsv
replace "\"Cruiser\"" "\"巡洋舰\"" $outputCsv
replace "\"AirCarrier\"" "\"航空母舰\"" $outputCsv
replace "\"Submarine\"" "\"潜艇\"" $outputCsv
printProgressPlus 1
replace "\"Commonwealth\"" "\"英联邦\"" $outputCsv
replace "\"Europe\"" "\"欧洲\"" $outputCsv
printProgressPlus 1
replace "\"France\"" "\"法国\"" $outputCsv
replace "\"Germany\"" "\"德国\"" $outputCsv
replace "\"Italy\"" "\"意大利\"" $outputCsv
replace "\"Spain\"" "\"西班牙\"" $outputCsv
printProgressPlus 1
replace "\"Japan\"" "\"日本\"" $outputCsv
replace "\"Netherlands\"" "\"荷兰\"" $outputCsv
replace "\"Russia\"" "\"苏联\"" $outputCsv
printProgressPlus 1
replace "\"United_Kingdom\"" "\"英国\"" $outputCsv
replace "\"USA\"" "\"美国\"" $outputCsv
replace "\"Pan_Asia\"" "\"泛亚\"" $outputCsv
printProgressPlus 1
replace "\"Pan_America\"" "\"泛美洲\"" $outputCsv
replace "\"diveBomber\"" "\"俯冲轰炸机\"" $outputCsv
replace "\"torpedoBomber\"" "\"鱼雷机\"" $outputCsv
replace "\"skipBomber\"" "\"跳弹轰炸机\"" $outputCsv
replace "\"fighter\"" "\"战斗机\"" $outputCsv
printProgressPlus 1
