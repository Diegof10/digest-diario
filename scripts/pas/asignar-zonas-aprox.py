import json,csv
d=json.load(open('deps.json'))['departamentos']
def n(s):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD',s.lower()) if unicodedata.category(c)!='Mn')
CBA_VI={'marcos juarez','union','general san martin','tercero arriba','rio segundo'}
CBA_IV={'rio cuarto','juarez celman','presidente roque saenz pena','general roca'}
SF_VI={'belgrano','caseros','iriondo','san jeronimo','san lorenzo','san martin','rosario','constitucion'}
rows=[]
for x in d:
    p=x['provincia']['id'];nm=n(x['nombre']);lat=x['centroide']['lat'];lon=x['centroide']['lon'];z=None
    if p=='14': z='VI' if nm in CBA_VI else 'IV' if nm in CBA_IV else 'III'
    elif p=='82': z='VI' if nm in SF_VI else 'VII' if nm=='general lopez' else 'V'
    elif p=='30': z='VIII'
    elif p in('18','54'): z='XV'
    elif p in('22','34'): z='II'
    elif p=='86': z='I' if lon< -64.3 else 'II'
    elif p=='90': z='I'
    elif p=='66': z='I' if lon> -65.6 else None
    elif p=='38': z='I' if lon> -65.3 else None
    elif p=='10': z='I' if lon> -65.9 else None
    elif p=='74': z='XIII'
    elif p=='42': z=None if lon< -65.3 else ('IX' if lat> -36.8 else 'XI')
    elif p=='06':
        if lat> -34.95 and lon> -58.75: z=None
        elif lon< -61.8: z='IX' if lat> -36.9 else 'XI'
        elif lat> -35.2: z='VII'
        elif lat> -37.3: z='X' if lon< -59.3 else 'XIV'
        else: z='XII'
    rows.append((x['id'],x['nombre'],p,z or ''))
w=csv.writer(open('zonas.csv','w'));w.writerow(['in1','nombre','prov','zona']);w.writerows(rows)
from collections import Counter;print(Counter(r[3] for r in rows))
