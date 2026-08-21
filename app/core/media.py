from __future__ import annotations

from pathlib import Path

from .security import allowed_object_key, esc


def media_url(key: object, public_base_url: str = "") -> str:
    object_key = allowed_object_key(key)
    if not object_key:
        return ""
    base = public_base_url.rstrip("/")
    if base:
        return f"{base}/{object_key}"
    return f"/media/{object_key}"


def image_tag(key: object, alt: str, css_class: str, public_base_url: str = "", lang: str = "zh") -> str:
    object_key = allowed_object_key(key)
    if not object_key:
        return avatar_fallback_tag(alt, css_class, lang)
    if not public_base_url and local_media_missing(object_key):
        return avatar_fallback_tag(alt, css_class, lang)
    url = media_url(object_key, public_base_url)
    label = name_avatar_label(alt, lang)
    cjk = "1" if is_cjk_label(label) else "0"
    long_label = "1" if len(label) > 1 else "0"
    return f'<img class="{esc(css_class)}" src="{esc(url)}" alt="{esc(alt)}" data-avatar-label="{esc(label)}" data-avatar-cjk="{cjk}" data-avatar-long="{long_label}" loading="lazy" decoding="async">'


def avatar_fallback_tag(name: str, css_class: str, lang: str = "zh") -> str:
    label = name_avatar_label(name, lang)
    classes = ["avatar-fallback"]
    if is_cjk_label(label):
        classes.append("avatar-fallback-cjk")
    if len(label) > 1:
        classes.append("avatar-fallback-long")
    class_text = " ".join([css_class, *classes])
    return f'<div class="{esc(class_text)}" aria-label="{esc(name or "无照片")}">{esc(label)}</div>'


def is_cjk_label(value: str) -> bool:
    return any("\u4e00" <= char <= "\u9fff" for char in value)


def local_media_missing(object_key: str) -> bool:
    roots = [Path("media"), Path("public") / "media"]
    existing_roots = [root for root in roots if root.exists()]
    if not existing_roots:
        return False
    return not any((root / object_key).is_file() for root in existing_roots)


def name_avatar_label(name: str, lang: str = "zh") -> str:
    text = str(name or "").strip()
    if not text:
        return "?"
    if lang != "en" and any("\u4e00" <= char <= "\u9fff" for char in text):
        return chinese_surname(text)
    normalized = text.replace("_", " ").replace("-", " ")
    if "," in normalized:
        surname = normalized.split(",", 1)[0].strip()
        return english_surname_label(surname)
    parts = [part.strip(" .;:()[]{}") for part in normalized.split() if part.strip(" .;:()[]{}")]
    if parts:
        return english_surname_label(parts[-1])
    return english_surname_label(text)


def english_surname_label(surname: str) -> str:
    text = "".join(char for char in surname if char.isalnum())
    if not text:
        return "?"
    return text if len(text) <= 10 else text[:1].upper()


def chinese_surname(name: str) -> str:
    text = "".join(char for char in name if "\u4e00" <= char <= "\u9fff")
    if not text:
        return "?"
    compound_surnames = {
        "欧阳", "太史", "端木", "上官", "司马", "东方", "独孤", "南宫", "万俟", "闻人",
        "夏侯", "诸葛", "尉迟", "公羊", "赫连", "澹台", "皇甫", "宗政", "濮阳", "公冶",
        "太叔", "申屠", "公孙", "慕容", "仲孙", "钟离", "长孙", "宇文", "司徒", "鲜于",
        "司空", "闾丘", "子车", "亓官", "司寇", "巫马", "公西", "颛孙", "壤驷", "公良",
        "漆雕", "乐正", "宰父", "谷梁", "拓跋", "夹谷", "轩辕", "令狐", "段干", "百里",
        "呼延", "东郭", "南门", "羊舌", "微生", "公户", "公玉", "公仪", "梁丘", "公仲",
        "公上", "公门", "公山", "公坚", "左丘", "公伯", "西门", "公祖", "第五", "公乘",
    }
    return text[:2] if text[:2] in compound_surnames else text[:1]
