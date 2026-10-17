"""シーンごとのナレーション音声を作り、尺に合わせて配置する。
usage: python3 narrate.py in.json out.json out.wav voice speed
voice: Kokoro の声（例 jf_alpha）、または VOICEVOX のスタイルID（例 vv:14 ＝冥鳴ひまり）"""
import sys,json,numpy as np,soundfile as sf,os
D=os.path.dirname(os.path.abspath(__file__))
_k=_vv=None
def speak(text,voice,speed):
    global _k,_vv
    if voice.startswith('vv:'):   # VOICEVOX（自然な抑揚。クレジット表記が必要）
        import io
        from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile
        V=os.environ.get('VV_DIR',os.path.join(D,'voicevox'))
        if _vv is None:
            ort=Onnxruntime.load_once(filename=os.path.join(V,'onnxruntime','libvoicevox_onnxruntime.so.1.17.3'))
            _vv=Synthesizer(ort,OpenJtalk(os.path.join(V,'open_jtalk_dic_utf_8-1.11')))
            for f in sorted(os.listdir(os.path.join(V,'vvms'))):
                with VoiceModelFile.open(os.path.join(V,'vvms',f)) as m: _vv.load_voice_model(m)
        sid=int(voice[3:]);q=_vv.create_audio_query(text,sid)
        q.speed_scale=speed;q.pitch_scale=-0.02;q.intonation_scale=1.15
        q.pre_phoneme_length=0.05;q.post_phoneme_length=0.05
        a,sr=sf.read(io.BytesIO(_vv.synthesis(q,sid)),dtype='float32')
        return a,sr
    if _k is None:
        from misaki import ja
        from kokoro_onnx import Kokoro
        _k=(ja.JAG2P(version='pyopenjtalk'),Kokoro(os.path.join(D,"kokoro-v1.0.onnx"),os.path.join(D,"voices-v1.0.bin")))
    ph,_=_k[0](text); ph=ph[:len(ph)//2]   # misaki pyopenjtalk returns phonemes+pitch concatenated
    a,sr=_k[1].create(ph,voice=voice,speed=speed,lang='ja',is_phonemes=True)
    return a,sr
cin,cout,wout,voice,speed=sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4],float(sys.argv[5])
cfg=json.load(open(cin))
SR=24000;lead=0.35;tail=0.9
t=0.0;clips=[]
for s in cfg['scenes']:
    dur0=s['b']-s['a']
    if s.get('say'):
        ld,tl=s.get('lead',lead),s.get('tail',tail)   # per-scene overrides
        a,sr=speak(s['say'],voice,s.get('speed',speed));assert sr==SR
        need=ld+len(a)/SR+tl
        clips.append((t+ld,a))
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
