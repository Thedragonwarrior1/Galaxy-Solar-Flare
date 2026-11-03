import sys; sys.path.insert(0,'.')
from rig import Frame
from body import solve
from roster import ROSTER, ORDER
from PIL import Image
ims=[]
for cid in ORDER:
    c=ROSTER[cid]; p=c.palette()
    fr=Frame(p,110,150,52,142)
    sk=solve(c.build,c.stance); c.draw(fr,sk,p,tick=0); fr.finish()
    ims.append(fr.to_image(scale=3))
W=ims[0].width; H=ims[0].height
sheet=Image.new('RGBA',(W*len(ims),H),(70,80,120,255))
for i,im in enumerate(ims): sheet.alpha_composite(im,(i*W,0))
sheet.save(sys.argv[1])
