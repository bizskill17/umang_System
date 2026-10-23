s=open('../home/umang-home.html').read()
open('rd.html','w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="mockdb3.js"></script></head><body>\n'+s+'</body></html>')
