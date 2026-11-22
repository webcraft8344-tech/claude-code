const {chromium}=require('playwright-core');const {spawn}=require('child_process');
const fs=require('fs');const path=require('path');
const ffmpeg=require('ffmpeg-static');
(async()=>{
  const [cfgPath,out]=process.argv.slice(2);
  const cfg=JSON.parse(fs.readFileSync(cfgPath,'utf8'));
  cfg.emblem=fs.readFileSync(cfg.emblemPath,'utf8').replace('width="1024" height="1024"','width="900" height="900"');
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  const p=await b.newPage({viewport:{width:1080,height:1920}});
  await p.goto('file://'+path.resolve('template.html'));
  await p.evaluate(c=>setup(c),cfg);
  const fps=30,N=Math.round(cfg.duration*fps);
  const ff=spawn(ffmpeg,['-y','-loglevel','error','-f','image2pipe','-framerate',String(fps),'-i','-',...(cfg.audio?['-i',cfg.audio]:['-f','lavfi','-i','anullsrc=r=44100:cl=stereo']),'-shortest','-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-preset','medium','-r',String(fps),'-c:a','aac','-movflags','+faststart',out]);
  ff.stderr.on('data',d=>process.stderr.write(d));
  for(let i=0;i<N;i++){
    await p.evaluate(t=>render(t),i/fps);
    const buf=await p.screenshot({type:'jpeg',quality:92});
    if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));
    if(i%150===0)console.log(out,i,'/',N);
  }
  ff.stdin.end();await new Promise(r=>ff.on('close',r));
  if(cfg.coverAt!==undefined){await p.evaluate(t=>render(t),cfg.coverAt);await p.screenshot({path:out.replace('.mp4','-cover.jpg'),type:'jpeg',quality:92});}
  await b.close();console.log('done',out);
})();
