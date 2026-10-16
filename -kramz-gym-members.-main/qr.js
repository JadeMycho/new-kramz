function drawQR(cv,m){
  const modules=createQR(m.id);
  const n=modules.length,s=8,pad=4*s,w=n*s+pad*2;
  cv.width=w;cv.height=w+44;
  const c=cv.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,cv.width,cv.height);c.fillStyle='#000';
  for(let r=0;r<n;r++)for(let k=0;k<n;k++)if(modules[r][k])c.fillRect(pad+k*s,pad+r*s,s,s);
  c.textAlign='center';c.font='600 20px sans-serif';c.fillText(m.name.slice(0,26),w/2,w+4);c.font='16px sans-serif';c.fillText(m.id,w/2,w+28);
}

function createQR(text){
  const bytes=Array.from(text,character=>character.charCodeAt(0));
  if(bytes.some(byte=>byte>127)||bytes.length>17)throw new Error('Member ID is too long to encode in a QR code.');

  const bits=[];
  const appendBits=(value,length)=>{for(let i=length-1;i>=0;i--)bits.push((value>>>i)&1)};
  appendBits(4,4);
  appendBits(bytes.length,8);
  bytes.forEach(byte=>appendBits(byte,8));
  for(let i=0;i<Math.min(4,152-bits.length);i++)bits.push(0);
  while(bits.length%8)bits.push(0);

  const data=[];
  for(let i=0;i<bits.length;i+=8)data.push(bits.slice(i,i+8).reduce((value,bit)=>(value<<1)|bit,0));
  for(let pad=0;data.length<19;pad++)data.push(pad%2?0x11:0xec);

  const multiply=(a,b)=>{
    let product=0;
    while(b){
      if(b&1)product^=a;
      a<<=1;
      if(a&0x100)a^=0x11d;
      b>>=1;
    }
    return product;
  };
  let generator=[1];
  for(let i=0;i<7;i++){
    const next=new Array(generator.length+1).fill(0);
    for(let j=0;j<generator.length;j++){
      next[j]^=generator[j];
      next[j+1]^=multiply(generator[j],1<<i);
    }
    generator=next;
  }
  const remainder=new Array(7).fill(0);
  for(const byte of data){
    const factor=byte^remainder.shift();
    remainder.push(0);
    for(let i=0;i<7;i++)remainder[i]^=multiply(generator[i+1],factor);
  }
  const codewords=data.concat(remainder);
  const matrix=Array.from({length:21},()=>new Array(21).fill(null));
  const set=(x,y,value)=>{if(x>=0&&y>=0&&x<21&&y<21)matrix[y][x]=value};

  for(const [left,top] of [[0,0],[14,0],[0,14]]){
    for(let dy=-1;dy<=7;dy++)for(let dx=-1;dx<=7;dx++){
      const x=left+dx,y=top+dy;
      if(x<0||y<0||x>=21||y>=21)continue;
      const distance=Math.max(Math.abs(dx-3),Math.abs(dy-3));
      set(x,y,distance!==2&&distance<=3);
    }
  }
  for(let i=8;i<13;i++){
    set(i,6,i%2===0);
    set(6,i,i%2===0);
  }

  const formatData=8;
  let formatRemainder=formatData<<10;
  for(let i=14;i>=10;i--)if((formatRemainder>>>i)&1)formatRemainder^=0x537<<(i-10);
  const formatBits=((formatData<<10)|formatRemainder)^0x5412;
  for(let i=0;i<=5;i++)set(8,i,((formatBits>>>i)&1)!==0);
  set(8,7,((formatBits>>>6)&1)!==0);
  set(8,8,((formatBits>>>7)&1)!==0);
  set(7,8,((formatBits>>>8)&1)!==0);
  for(let i=9;i<15;i++)set(14-i,8,((formatBits>>>i)&1)!==0);
  for(let i=0;i<8;i++)set(20-i,8,((formatBits>>>i)&1)!==0);
  for(let i=8;i<15;i++)set(8,21-15+i,((formatBits>>>i)&1)!==0);
  set(8,13,true);

  let bitIndex=0,upward=true;
  for(let right=20;right>=1;right-=2){
    if(right===6)right--;
    for(let vertical=0;vertical<21;vertical++){
      const y=upward?20-vertical:vertical;
      for(let offset=0;offset<2;offset++){
        const x=right-offset;
        if(matrix[y][x]!==null)continue;
        const byte=codewords[bitIndex>>>3]||0;
        const value=((byte>>>(7-(bitIndex&7)))&1)!==0;
        matrix[y][x]=value!==((x+y)%2===0);
        bitIndex++;
      }
    }
    upward=!upward;
  }
  return matrix;
}
