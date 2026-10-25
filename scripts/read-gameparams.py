"""按区域和舰船筛选 GameParams，通过 JSONL 向 Node 传递选中记录。"""

import argparse
import io
import json
import pickle
import sys
import zlib
from pathlib import Path


class ParamObject:
    """仅保存 Pickle 对象状态，不加载游戏代码。"""


class ParamReader(pickle.Unpickler):
    """限制可还原的类，拒绝任意函数和模块调用。"""

    def find_class(self, module, name):
        if module == "GameParams" and name in ("GPData", "TypeInfo"):
            return ParamObject
        raise pickle.UnpicklingError(f"Unsupported pickle global: {module}.{name}")


def fields(value):
    """读取对象状态或普通字典。"""
    return vars(value) if isinstance(value, ParamObject) else value


def normalize(value):
    """仅转换已选中记录，保留零值与复合键。"""
    value = fields(value)
    if isinstance(value, dict):
        return {str(key): normalize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [normalize(item) for item in value]
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def emit(value):
    """输出一条协议记录。"""
    print(
        json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")),
        flush=True,
    )


def load_data(path):
    """读取原始 JSON 或反转字节后以 zlib 解压的 Pickle。"""
    limit = 512 * 1024 * 1024
    if path.stat().st_size > limit:
        raise ValueError(
            "Input exceeds 512 MiB; use GameParams.data or a single-region JSON"
        )
    if path.suffix.lower() == ".json":
        with path.open(encoding="utf-8") as stream:
            return json.load(stream)
    decoder = zlib.decompressobj()
    payload = decoder.decompress(path.read_bytes()[::-1], limit + 1)
    if len(payload) > limit or not decoder.eof:
        raise ValueError("Invalid or oversized GameParams compressed payload")
    return ParamReader(io.BytesIO(payload), encoding="latin1").load()


def region_groups(root):
    """兼容命名区域字典以及旧式单区域参数列表。"""
    if isinstance(root, (list, tuple)) and root:
        root = root[0]
    if not isinstance(root, dict) or not root:
        raise ValueError("GameParams root must be a non-empty dictionary")
    if any(
        isinstance(fields(value), dict) and "typeinfo" in fields(value)
        for value in root.values()
    ):
        return {"DEFAULT": root}
    groups = {
        str(key).upper() or "DEFAULT": value
        for key, value in root.items()
        if isinstance(value, dict)
    }
    if not groups:
        raise ValueError("No GameParams regions found")
    return groups


COMPONENTS = {
    "hull": ("Hull", "Engine"),
    "artillery": ("Artillery",),
    "atba": ("ATBA",),
    "torpedoes": ("Torpedoes", "SubTorpedoes"),
    "airDefense": ("AirDefense", "AirDefence", "AirDedense"),
    "aircraft": ("FlightControl", "AirArmament"),
    "airSupport": ("AirSupport",),
    "asw": ("DepthCharge", "DepthChargeGuns", "DepthCharges", "ASW", "AirSupport"),
    "pingerGun": ("Pinger", "PingerGun"),
    "specials": ("Specials", "Specials1", "Specials2", "Specials3", "Innate"),
    "ability": ("Abilities",),
}
ENTITY_TYPES = {
    "aircraft": "Aircraft",
    "ability": "Ability",
    "projectiles": "Projectile",
    "crew": "Crew",
    "modernizations": "Modernization",
}


def references(value, params, wanted, found):
    """收集实体及消耗品的具体配置，仅沿所选配置追踪飞机和弹药。"""
    value = fields(value)
    if (
        isinstance(value, (list, tuple))
        and len(value) == 2
        and all(isinstance(item, str) for item in value)
    ):
        name, config = value
        target = fields(params.get(name, {}))
        if (
            isinstance(target, dict)
            and fields(target.get("typeinfo", {})).get("type") == "Ability"
            and "Ability" in wanted
        ):
            if config not in target:
                raise ValueError(f"Unknown ability configuration: {name}/{config}")
            selected = found.setdefault(
                name,
                {
                    key: target[key]
                    for key in ("index", "name", "id", "level", "group", "typeinfo")
                    if key in target
                },
            )
            if config not in selected:
                selected[config] = target[config]
                references(target[config], params, wanted, found)
            return
    if isinstance(value, str) and value in params:
        target = fields(params[value])
        if (
            isinstance(target, dict)
            and fields(target.get("typeinfo", {})).get("type") in wanted
            and found.get(value) is not target
        ):
            # 未指定配置的实体引用仍表示完整实体；先登记，避免循环引用。
            found[value] = target
            references(target, params, wanted, found)
    elif isinstance(value, dict):
        for child in value.values():
            references(child, params, wanted, found)
    elif isinstance(value, (list, tuple)):
        for child in value:
            references(child, params, wanted, found)


def air_support_category(component, params):
    """通过飞机所带弹药区分普通空袭与反潜空袭，不按舰名推断。"""
    for name in fields(component).get("ammoList", []):
        aircraft = fields(params.get(name, {}))
        if not isinstance(aircraft, dict):
            continue
        bomb = fields(params.get(aircraft.get("bombName", ""), {}))
        if (
            isinstance(bomb, dict)
            and str(bomb.get("ammoType", "")).lower() == "depthcharge"
        ):
            return "asw"
    return "airSupport"


def main():
    """先筛选区域和实体，再逐条序列化；不生成全量中间 JSON。"""
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument("--regions", required=True)
    parser.add_argument("--ships", default="[]")
    parser.add_argument("--categories", required=True)
    args = parser.parse_args()
    groups = region_groups(load_data(args.path))
    regions = json.loads(args.regions)
    if regions == ["ALL"]:
        regions = list(groups)
    missing = set(regions) - groups.keys()
    if missing:
        raise ValueError(
            f"Unknown regions: {sorted(missing)}; available: {list(groups)}"
        )
    queries = [query.casefold() for query in json.loads(args.ships)]
    categories = json.loads(args.categories)
    wanted = {kind for category, kind in ENTITY_TYPES.items() if category in categories}
    # 飞机实体可能再引用弹药；只为明确选择的类别输出。
    traversal_types = wanted | {"Aircraft", "Gun", "Ability", "Projectile"}
    emit({"event": "regions", "regions": regions})
    for region in regions:
        params = groups[region]
        ships = []
        related = {}
        for key, raw in params.items():
            record = fields(raw)
            if (
                not isinstance(record, dict)
                or fields(record.get("typeinfo", {})).get("type") != "Ship"
            ):
                continue
            values = [
                str(record.get(field, "")).casefold()
                for field in ("index", "name", "id")
            ]
            if queries and not any(
                query in value for query in queries for value in values
            ):
                continue
            ships.append((key, record))
            if queries and wanted:
                references(record, params, traversal_types, related)
        if queries and not ships:
            raise ValueError(f"No matching ships in {region}")
        for key, record in ships:
            selected = {
                field: record[field]
                for field in ("index", "name", "id", "level", "group", "typeinfo")
                if field in record
            }
            component_kinds = {}
            for field, value in record.items():
                suffix = field.split("_")[1] if "_" in field else field
                if suffix == "AirSupport":
                    component_kinds[field] = air_support_category(value, params)
                include = (
                    any(
                        suffix in COMPONENTS.get(category, ())
                        for category in categories
                    )
                    or (
                        "armor" in categories
                        and "_" in field
                        and isinstance(fields(value), dict)
                    )
                    or (field == "ShipAbilities" and "ability" in categories)
                    or (field == "Specials" and "specials" in categories)
                )
                if include:
                    selected[field] = value
            emit(
                {
                    "event": "record",
                    "region": region,
                    "kind": "Ship",
                    "key": key,
                    "componentKinds": component_kinds,
                    "data": normalize(selected),
                }
            )
        for key, raw in params.items():
            record = fields(raw)
            if not isinstance(record, dict):
                continue
            kind = fields(record.get("typeinfo", {})).get("type")
            if kind in wanted and (not queries or key in related):
                emit(
                    {
                        "event": "record",
                        "region": region,
                        "kind": kind,
                        "key": key,
                        "data": normalize(related[key] if queries else record),
                    }
                )
        emit({"event": "end", "region": region})


if __name__ == "__main__":
    try:
        main()
    except (
        ValueError,
        OSError,
        pickle.UnpicklingError,
        EOFError,
        zlib.error,
        TypeError,
        RecursionError,
    ) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
