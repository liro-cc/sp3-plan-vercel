import json
import re
from pathlib import Path
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).parent.parent
app = Flask(__name__, static_folder=str(ROOT), static_url_path="")
CORS(app)

DATA_FILE = ROOT / "data.json"
ZASTEPSTWA_URL = "https://sp3.czerwionka-leszczyny.pl/dla-uczniow/zastepstwa"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def clean(s):
    return re.sub(r"\s+", " ", s or "").strip()


def load_data():
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return {"classes": [], "teachers": [], "rooms": [], "substitutions": {"substitutions": []}}


def fetch(url):
    r = requests.get(url, headers=HEADERS, timeout=8)
    r.raise_for_status()
    r.encoding = r.apparent_encoding or "utf-8"
    return r.text


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


@app.route("/api/sync", methods=["POST"])
def sync():
    try:
        sub_html = fetch(ZASTEPSTWA_URL)
        substitutions = parse_substitutions(sub_html)

        data = load_data()
        data["substitutions"] = substitutions

        from datetime import datetime, timezone
        data["updated_at"] = datetime.now(timezone.utc).isoformat()

        return jsonify({"ok": True, "data": data})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/timetable")
def timetable():
    return jsonify(load_data())


@app.route("/")
def index():
    return send_from_directory(str(ROOT), "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(str(ROOT), path)


if __name__ == "__main__":
    app.run(debug=True)
