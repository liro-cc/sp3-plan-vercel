#!/usr/bin/env python3
"""Full scraper - fetches entire timetable + substitutions from SP3 school website."""
import json
import re
import sys
from pathlib import Path
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

sys.stdout.reconfigure(encoding="utf-8")

DATA_FILE = Path(__file__).parent / "data.json"
INDEX_URL = "https://sp3.czerwionka-leszczyny.pl/szkola/plan_lekcji/lista.html"
PLAN_BASE = "https://sp3.czerwionka-leszczyny.pl/szkola/plan_lekcji/"
ZASTEPSTWA_URL = "https://sp3.czerwionka-leszczyny.pl/dla-uczniow/zastepstwa"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def clean(s):
    return re.sub(r"\s+", " ", s or "").strip()


def fetch(url):
    r = requests.get(url, headers=HEADERS, timeout=15)
    r.raise_for_status()
    r.encoding = r.apparent_encoding or "utf-8"
    return r.text


def scrape_index(html):
    soup = BeautifulSoup(html, "lxml")
    classes, teachers, rooms = [], [], []
    for a in soup.find_all("a", href=True):
        href = a.get("href", "")
        name = clean(a.get_text())
        if not name or not href:
            continue
        url = PLAN_BASE + href
        filename = href.split("/")[-1]
        if filename.startswith("o"):
            classes.append({"name": name, "url": url, "title": name, "lessons": []})
        elif filename.startswith("n"):
            teachers.append({"name": name, "url": url, "title": name, "lessons": []})
        elif filename.startswith("s"):
            rooms.append({"name": name, "url": url, "title": name, "lessons": []})
    return classes, teachers, rooms


def scrape_plan(html):
    soup = BeautifulSoup(html, "lxml")
    lessons = []
    table = soup.find("table", class_="tabela") or soup.find("table")
    if not table:
        return lessons

    for row in table.find_all("tr"):
        nr_cell = row.find("td", class_="nr")
        g_cell = row.find("td", class_="g")
        if not nr_cell or not g_cell:
            continue

        lesson_nr = clean(nr_cell.get_text())
        time_text = clean(g_cell.get_text())

        day_cells = row.find_all("td", class_="l")
        days = []
        for cell in day_cells[:5]:
            p = cell.find("span", class_="p")
            n = cell.find("a", class_="n")
            s = cell.find("a", class_="s")
            days.append({
                "subject": clean(p.get_text()) if p else "",
                "teacher": clean(n.get_text()) if n else "",
                "room": clean(s.get_text()) if s else "",
                "group": "",
            })
        while len(days) < 5:
            days.append({"subject": "", "teacher": "", "room": "", "group": ""})

        lessons.append({
            "lesson_nr": lesson_nr,
            "time": time_text,
            "days": days,
        })

    return lessons


def scrape_substitutions(html):
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


def scrape_plan_list(plan_list, label):
    total = len(plan_list)
    for i, plan in enumerate(plan_list):
        print(f"  [{i+1}/{total}] {label}: {plan['name']}")
        try:
            html = fetch(plan["url"])
            plan["lessons"] = scrape_plan(html)
        except Exception as e:
            print(f"    ERROR: {e}")


def main():
    print("=== SP3 Full Timetable Scraper ===")

    print("\n[1/3] Fetching index...")
    classes, teachers, rooms = scrape_index(fetch(INDEX_URL))
    print(f"  {len(classes)} classes, {len(teachers)} teachers, {len(rooms)} rooms")

    print("\n[2/3] Scraping plans...")
    scrape_plan_list(classes, "class")
    scrape_plan_list(teachers, "teacher")
    scrape_plan_list(rooms, "room")

    print("\n[3/3] Fetching substitutions...")
    try:
        subs = scrape_substitutions(fetch(ZASTEPSTWA_URL))
        print(f"  {len(subs['substitutions'])} substitutions")
    except Exception as e:
        print(f"  ERROR: {e}")
        subs = {"substitutions": []}

    data = {
        "source": INDEX_URL,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "classes": classes,
        "teachers": teachers,
        "rooms": rooms,
        "substitutions": subs,
    }

    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDone! {len(classes)} classes, {len(teachers)} teachers, {len(rooms)} rooms")
    print(f"File: {DATA_FILE.stat().st_size // 1024}KB, Updated: {data['updated_at']}")


if __name__ == "__main__":
    main()
