const {chromium}=require(process.argv[2]+'/node_modules/playwright-core');const fs=require('fs');
(async()=>{const top=JSON.parse(fs.readFileSync('top48.json'));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1080,height:1920}});await p.goto('file://'+process.cwd()+'/page.html');await p.waitForTimeout(800);
for(let i=0;i<4;i++){await p.evaluate(([i,r])=>page(i,r),[i,top.slice(i*12,i*12+12)]);await p.waitForTimeout(200);await p.screenshot({path:`p${i}.png`});}
await p.evaluate(()=>cta());await p.waitForTimeout(200);await p.screenshot({path:'p4.png'});await b.close();})();
