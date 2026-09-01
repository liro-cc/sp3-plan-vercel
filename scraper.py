#!/usr/bin/env python3
"""Scrape substitutions and update data.json in-place."""
import json
import re
import sys
from pathlib import Path
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

DATA_FILE = Path(__file__).parent / "data.json"
ZASTEPSTWA_URL = "https://sp3.czerwionka-leszczyny.pl/dla-uczniow/zastepstwa"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def clean(s):
    return re.sub(r"\s+", " ", s or "").strip()


def parse_substitutions(html):
    soup = BeautifulSoup(html, "lxml")
    result = []
    tables = soup.find_all("table", class_="tabela")
    if not tables:
        tables = soup.find_all("table")

    for table in tables:
        current_date = ""
        prev = table.find_previous_sibling()
        while prev:
            if prev.name == "h1":
                raw = clean(prev.get_text())
                current_date = re.sub(r"^Zast[eę]pstwa.*?[-–]\s*", "", raw).strip()
                break
            prev = prev.find_previous_sibling()

        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 5:
                continue
            texts = [clean(c.get_text()) for c in cells]
            lesson = texts[0]
            if not lesson or not any(c.isdigit() for c in lesson):
                continue
            result.append({
                "date": current_date,
                "lesson": lesson,
                "teacher": texts[1] if len(texts) > 1 else "",
                "class": texts[2] if len(texts) > 2 else "",
                "subject": texts[3] if len(texts) > 3 else "",
                "room": texts[4] if len(texts) > 4 else "",
                "substitute": texts[5] if len(texts) > 5 else "",
                "notes": texts[6] if len(texts) > 6 else "",
            })

    return {"substitutions": result}


def main():
    print("Fetching substitutions from", ZASTEPSTWA_URL)
    r = requests.get(ZASTEPSTWA_URL, headers=HEADERS, timeout=30)
    r.raise_for_status()
    r.encoding = r.apparent_encoding or "utf-8"

    subs = parse_substitutions(r.text)
    print(f"Found {len(subs['substitutions'])} substitutions")

    if DATA_FILE.exists():
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    else:
        print("ERROR: data.json not found", file=sys.stderr)
        sys.exit(1)

    data["substitutions"] = subs
    data["updated_at"] = datetime.now(timezone.utc).isoformat()

    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Updated data.json at {data['updated_at']}")


if __name__ == "__main__":
    main()
