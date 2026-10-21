import json
S=["牡羊座","牡牛座","双子座","蟹座","獅子座","乙女座","天秤座","蠍座","射手座","山羊座","水瓶座","魚座"]
FIXED={1,4,7,10}   # 不動宮：牡牛・獅子・蠍・水瓶（想いが続く）
WATER={3,7,11}     # 水の星座：牡羊=0 起点で 蟹3 蠍7 魚11（情が深い）
asp={6:7.0,0:6.0,4:5.0,3:4.0,5:3.0,2:2.0,1:1.0}  # 180,0,120,90,150,60,30 度
rows=[]
for w in range(12):
  for m in range(12):
    d=min((w-m)%12,(m-w)%12)
    sc=asp[d]+0.6*((w in FIXED)+(m in FIXED))+0.4*((w in WATER)+(m in WATER))+0.01*((w*7+m*5)%11)
    rows.append((sc,S[w],S[m],d))
rows.sort(key=lambda r:-r[0])
top=rows[:48]
json.dump([[r[1],r[2]] for r in top],open('top48.json','w'),ensure_ascii=False)
for i,r in enumerate(top,1): print(i,r[1],r[2],r[3]*30,'度',round(r[0],2))
