"""Genera un PDF sintetico dal testo a righe/celle di una fixture (AR-M17).

    python3 scripts/visura-pdf-fixture.py tests/fixtures/visure/srl-due-soci-pf.txt tests/fixtures/visure/srl-due-soci-pf.pdf

Serve al giro Playwright (ui-m17.mjs): un PDF testuale con lo stesso layout a
colonne delle visure InfoCamere (etichetta a x=24, valori a x=149...), così che
`estraiTestoPdf` + `leggiVisura` producano lo stesso risultato della fixture.
Non è una visura vera e non va confusa con una.
"""
import sys
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

src, dst = sys.argv[1], sys.argv[2]
c = canvas.Canvas(dst, pagesize=A4)
c.setFont('Helvetica', 8)
y = 800
X = [24, 149, 312, 437, 520]
for raw in open(src, encoding='utf-8').read().split('\n'):
    if raw.strip() == '\f':
        c.showPage(); c.setFont('Helvetica', 8); y = 800; continue
    if not raw.strip():
        continue
    celle = raw.split('\t')
    continua = celle[0] == ''
    if continua:
        celle = celle[1:]
    x0 = 1 if continua else 0
    for k, cella in enumerate(celle):
        if not cella:
            continue
        c.drawString(X[min(x0 + k, len(X) - 1)], y, cella)
    y -= 11
    if y < 40:
        c.showPage(); c.setFont('Helvetica', 8); y = 800
c.save()
print('scritto', dst)
