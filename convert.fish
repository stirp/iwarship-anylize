#!/usr/bin/fish
mkdir -p temp
./download.sh $argv[1] $argv[2]
./convertSingle.fish 船体
./convertSingle.fish 反潜武器
./convertSingle.fish 弹道穿深
./convertSingle.fish 防空
./convertSingle.fish 飞机
./convertSingle.fish 副炮
./convertSingle.fish 火炮
./convertSingle.fish 空袭
./convertSingle.fish 消耗品
./convertSingle.fish 鱼雷
rm -rf temp