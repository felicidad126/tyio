"""Bundel prototipe menjadi satu berkas HTML: redesain-npr.html.

Jalankan dari folder redesain-npr:  npm run bundel
Parcel membangun ke dist/, lalu CSS dan JS di-inline ke satu berkas supaya
bisa dibuka langsung di browser (atau dipublikasikan sebagai artifact).
Link Google Fonts dipertahankan.
"""
import os
import re
import subprocess

AKAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(AKAR)
for d in ("dist", ".parcel-cache"):
    subprocess.run(["rm", "-rf", d], check=True)
subprocess.run(["npx", "parcel", "build", "index.html", "--dist-dir", "dist", "--no-source-maps"], check=True,
               stdout=subprocess.DEVNULL)

html = open("dist/index.html", encoding="utf-8").read()
gaya = "".join("<style>" + open(os.path.join("dist", f), encoding="utf-8").read() + "</style>"
               for f in re.findall(r"<link rel=stylesheet href=/([^ >]+\.css)>", html))
skrip = "".join('<script type="module">' + open(os.path.join("dist", f), encoding="utf-8").read().replace("</script", "<\\/script") + "</script>"
                for f in re.findall(r"<script type=module src=/([^ >]+\.js)></script>", html))
huruf = "".join(re.findall(r'<link rel=preconnect[^>]*>|<link rel=stylesheet href="https://fonts[^>]*>', html))
assert gaya and skrip, "CSS/JS hasil Parcel tidak ditemukan"

with open("redesain-npr.html", "w", encoding="utf-8") as f:
    f.write('<meta charset="utf-8">\n<title>Redesain NPR</title>\n' + huruf + "\n" + gaya + '\n<div id="root"></div>\n' + skrip + "\n")
print("bundel ok → redesain-npr.html")
