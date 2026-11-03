import sys; sys.path.insert(0,'.')
from rig import Frame
from body import solve
from chars import luffy
from PIL import Image
out=sys.argv[1]
poses=[]
st=dict(torso=6, aFu=62, aFl=140, aNu=18, aNl=150, fN=(-9,-2.5), fF=(9,-2.5), expr='neutral', hat=True)
poses.append(st)
poses.append(dict(st, aNu=88, aNl=90, stN=1.0, torso=14, expr='angry', fN=(-11,-2.5), fF=(11,-2.5)))
poses.append(dict(st, aNu=90, aNl=90, stN=2.6, torso=16, expr='shout'))
ims=[]
for v in ['g2','g5']:
  for ps in poses:
    p=luffy.palette(v); b=luffy.BUILD_BASE
    fr=Frame(p,160,120,60,110)
    sk=solve(b,ps); luffy.draw(fr,sk,b,p,v,tick=3); fr.finish()
    ims.append(fr.to_image(scale=4))
for ps in poses[:2]:
    p=luffy.palette('g4'); b=luffy.BUILD_G4
    fr=Frame(p,160,120,60,110)
    sk=solve(b,dict(ps,aFu=60,aFl=120,aNu=30,aNl=110)); luffy.draw(fr,sk,b,p,'g4',tick=3); fr.finish()
    ims.append(fr.to_image(scale=4))
W=ims[0].width; H=ims[0].height
sheet=Image.new('RGBA',(W*3,H*3),(70,80,120,255))
for i,im in enumerate(ims): sheet.alpha_composite(im,((i%3)*W,(i//3)*H))
sheet.save(out)
