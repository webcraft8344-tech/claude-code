"""シーンごとのナレーション音声を作り、尺に合わせて配置する。
usage: python3 narrate.py in.json out.json out.wav voice speed"""
import sys,json,numpy as np,soundfile as sf,os
from misaki import ja
from kokoro_onnx import Kokoro
D=os.path.dirname(os.path.abspath(__file__))
g2p=ja.JAG2P(version='pyopenjtalk')
k=Kokoro(os.path.join(D,"kokoro-v1.0.onnx"),os.path.join(D,"voices-v1.0.bin"))
def speak(text,voice,speed):
    ph,_=g2p(text); ph=ph[:len(ph)//2]
    a,sr=k.create(ph,voice=voice,speed=speed,lang='ja',is_phonemes=True)
    return a,sr
cin,cout,wout,voice,speed=sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4],float(sys.argv[5])
cfg=json.load(open(cin))
SR=24000;lead=0.35;tail=0.9
t=0.0;clips=[]
for s in cfg['scenes']:
    dur0=s['b']-s['a']
    if s.get('say'):
        a,sr=speak(s['say'],voice,speed);assert sr==SR
        need=lead+len(a)/SR+tail
        clips.append((t+lead,a))
    else: need=dur0
    d=max(dur0,need)
    s['a'],s['b']=round(t,2),round(t+d,2);t+=d
cfg['duration']=round(t+0.3,2)
out=np.zeros(int((t+0.5)*SR),dtype=np.float32)
for st,a in clips:
    i=int(st*SR);out[i:i+len(a)]+=a
out=out/max(1e-6,np.abs(out).max())*0.89
sf.write(wout,out,SR)
cfg['audio']=os.path.abspath(wout)
json.dump(cfg,open(cout,'w'),ensure_ascii=False)
print('duration',cfg['duration'])
