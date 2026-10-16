async function startApp(){
await initializeStorage();
$('asof').value=iso(new Date());
$('asof').onchange=render;
$('today').onclick=()=>{$('asof').value=iso(new Date());render()};
$('q').oninput=render;
$('q').onkeydown=e=>{
  if(e.key==='Enter'){
    const m=db.members.find(x=>x.id.toLowerCase()===$('q').value.trim().toLowerCase());
    if(m){openMember(m.id);$('q').value='';render()}
  }
};
$('add').onclick=()=>{
  $('n').value='';$('p').value='';$('st').value=iso(new Date());$('paid').checked=true;
  $('addDlg').showModal();$('n').focus();
};
$('cancelNew').onclick=()=>$('addDlg').close();
$('saveNew').onclick=async()=>{
  const name=$('n').value.trim();if(!name){$('n').focus();return}
  const plan=$('pl').value,start=$('st').value||iso(new Date());
  let id;
  try{
    id=generateMemberId();
  }catch(e){
    alert(e.message);
    return;
  }
  const m={id,name,phone:$('p').value.trim(),plan,start,through:through(start,plan),paid:$('paid').checked};
  db.members.push(m);
  const saved=m.paid
    ?await recordSale(m,plan,{plan,start,through:m.through,paid:false},m)
    :await save();
  if(!saved){
    db.members.pop();
    return;
  }
  $('addDlg').close();$('q').value='';render();openMember(m.id);
};
$('export').onclick=()=>{
  const l=document.createElement('a');l.download='gym-backup-'+iso(new Date())+'.txt';
  l.href=URL.createObjectURL(new Blob([JSON.stringify({version:2,members:db.members,next:db.next,sales},null,1)],{type:'text/plain'}));l.click();
  setTimeout(()=>URL.revokeObjectURL(l.href),0);
};
$('importBtn').onclick=()=>$('importFile').click();
$('importFile').onchange=e=>{
  const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=async()=>{
    try{
      const backup=JSON.parse(r.result);
      const data=validateBackup(backup);
      const hasSales=Object.prototype.hasOwnProperty.call(backup,'sales');
      const description=data.members.members.length+' members and '+data.sales.length+' sales records'+(hasSales?'':' (this is an older member-only backup)');
      if(confirm('Replace the current members and sales with '+description+'?')){
        await replaceAllData(data.members,data.sales);
        render();
      }
    }catch(x){alert('Could not restore backup: '+x.message)}
  };
  r.readAsText(f);e.target.value='';
};
render();

const revenueDlg=$('revenueDlg'),revenueAuth=$('revenueAuth'),revenueReport=$('revenueReport');
let revenueUnlocked=false;

function updateRevenueAuth(){
  let hasPin;
  try{
    hasPin=Boolean(localStorage.getItem(PIN_KEY));
  }catch(e){
    $('revenueAuthError').textContent='Could not access browser storage: '+e.message;
    $('revenueAuthError').hidden=false;
    return;
  }
  $('revenueAuthMessage').textContent=hasPin
    ?'Enter your admin PIN to view sales.'
    :'Create an admin PIN for this browser. Use the PIN you selected and confirm it below.';
  $('confirmPinField').hidden=hasPin;
  $('adminLogin').textContent=hasPin?'View revenue':'Set PIN and continue';
  $('adminPin').value='';$('confirmPin').value='';$('revenueAuthError').hidden=true;
}

async function digestPin(pin){
  if(!crypto.subtle)throw new Error('Secure PIN hashing is unavailable. Open this app on localhost or HTTPS.');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}

function setRevenueUnlocked(unlocked){
  revenueUnlocked=unlocked;
  revenueAuth.hidden=unlocked;
  revenueReport.hidden=!unlocked;
  if(unlocked)renderRevenue();
}

function revenueBounds(range){
  const today=parse(iso(new Date())),start=new Date(today),end=new Date(today);
  if(range==='week'){
    start.setDate(start.getDate()-((start.getDay()+6)%7));
    end.setDate(start.getDate()+6);
  }else if(range==='month'){
    start.setDate(1);
    end.setMonth(start.getMonth()+1,0);
  }else if(range==='year'){
    start.setMonth(0,1);
    end.setMonth(11,31);
  }
  return{from:iso(start),to:iso(end)};
}

function renderRevenue(){
  if(!revenueUnlocked)return;
  const {from,to}=revenueBounds($('revenueRange').value);
  const records=sales.filter(sale=>sale&&typeof sale.paidAt==='string'&&sale.paidAt>=from&&sale.paidAt<=to&&Number.isFinite(Number(sale.amount)));
  const total=records.reduce((sum,sale)=>sum+Number(sale.amount),0);
  $('revenueTotal').textContent=formatMoney(total);
  $('revenueCount').textContent=String(records.length);
  $('revenueAverage').textContent=formatMoney(records.length?total/records.length:0);
  const body=$('salesRows');body.replaceChildren();
  records.slice().sort((a,b)=>b.paidAt.localeCompare(a.paidAt)).forEach(sale=>{
    const row=document.createElement('tr');
    const date=document.createElement('td'),member=document.createElement('td'),purchase=document.createElement('td'),amount=document.createElement('td');
    date.textContent=fmt(sale.paidAt);
    member.textContent=(sale.memberName||'Unknown member')+' · '+(sale.memberId||'');
    purchase.textContent=PLAN[sale.plan]||sale.plan||'Purchase';
    amount.textContent=formatMoney(Number(sale.amount));
    row.append(date,member,purchase,amount);body.append(row);
  });
  $('salesEmpty').hidden=records.length>0;
}

$('revenue').onclick=()=>{
  updateRevenueAuth();
  setRevenueUnlocked(false);
  revenueDlg.showModal();
  $('adminPin').focus();
};
$('closeRevenue').onclick=()=>revenueDlg.close();
$('adminLogin').onclick=async()=>{
  const pin=$('adminPin').value,error=$('revenueAuthError');
  error.hidden=true;
  let stored;
  try{
    stored=localStorage.getItem(PIN_KEY);
  }catch(e){
    error.textContent='Could not access browser storage: '+e.message;
    error.hidden=false;return;
  }
  if(!/^\d{4,12}$/.test(pin)){
    error.textContent='Enter a PIN containing 4 to 12 digits.';
    error.hidden=false;return;
  }
  try{
    const digest=await digestPin(pin);
    if(stored){
      if(digest!==stored){
        error.textContent='Incorrect PIN. Try again.';
        error.hidden=false;return;
      }
    }else{
      if(pin!==$('confirmPin').value){
        error.textContent='The PIN entries do not match.';
        error.hidden=false;return;
      }
      localStorage.setItem(PIN_KEY,digest);
    }
    setRevenueUnlocked(true);
  }catch(e){
    error.textContent='Could not verify or save the PIN: '+e.message;
    error.hidden=false;
  }
};
$('adminPin').onkeydown=e=>{if(e.key==='Enter')$('adminLogin').click()};
$('confirmPin').onkeydown=e=>{if(e.key==='Enter')$('adminLogin').click()};
$('adminLogout').onclick=()=>{setRevenueUnlocked(false);updateRevenueAuth()};
$('revenueRange').onchange=renderRevenue;
revenueDlg.addEventListener('close',()=>{setRevenueUnlocked(false);updateRevenueAuth()});

let scanStream=null,scanTimer=0,scanBusy=false,scanGeneration=0,lastScannedCode='';
const scanDlg=$('scanDlg'),scanVideo=$('scanVideo'),scanStatus=$('scanStatus');
const cameraSelect=$('cameraSelect');
const scanCanvas=document.createElement('canvas');
const scanContext=scanCanvas.getContext('2d',{willReadFrequently:true});

function stopQrScan(){
  scanGeneration++;
  clearTimeout(scanTimer);
  scanTimer=0;
  scanBusy=false;
  if(scanStream){
    scanStream.getTracks().forEach(track=>track.stop());
    scanStream=null;
  }
  scanVideo.srcObject=null;
}

function cameraName(device,index){
  const label=device.label.trim();
  if(/\b(back|rear|environment)\b/i.test(label))return 'Back camera';
  if(/\b(front|user|facetime)\b/i.test(label))return 'Front camera';
  return label||'Camera '+(index+1);
}

async function updateCameraList(preferredId){
  const devices=await navigator.mediaDevices.enumerateDevices();
  const cameras=devices.filter(device=>device.kind==='videoinput');
  const currentId=preferredId||scanStream?.getVideoTracks()[0]?.getSettings().deviceId;
  cameraSelect.replaceChildren();
  cameras.forEach((device,index)=>{
    const option=document.createElement('option');
    option.value=device.deviceId;
    option.textContent=cameraName(device,index);
    cameraSelect.append(option);
  });
  cameraSelect.disabled=cameras.length===0;
  if(cameras.length){
    const selected=cameras.find(device=>device.deviceId===currentId)
      ||cameras.find(device=>/\b(back|rear|environment)\b/i.test(device.label))
      ||cameras[0];
    cameraSelect.value=selected.deviceId;
  }
  return cameras;
}

async function connectCamera(deviceId,generation){
  const video=deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:'environment'}};
  const stream=await navigator.mediaDevices.getUserMedia({video,audio:false});
  if(generation!==scanGeneration||!scanDlg.open){
    stream.getTracks().forEach(track=>track.stop());
    return;
  }
  scanStream=stream;
  scanVideo.srcObject=stream;
  await scanVideo.play();
  const cameras=await updateCameraList(deviceId);
  if(generation!==scanGeneration||!scanDlg.open)return;
  cameraSelect.hidden=cameras.length<2;
  scanStatus.textContent='Camera is ready. Point it at a member QR code.';
  scheduleQrScan();
}

function scheduleQrScan(){
  if(!scanStream||!scanDlg.open)return;
  scanTimer=setTimeout(scanFrame,80);
}

function scanFrame(){
  if(!scanStream||!scanDlg.open||scanBusy)return;
  if(scanVideo.readyState< HTMLMediaElement.HAVE_CURRENT_DATA){
    scheduleQrScan();
    return;
  }
  scanBusy=true;
  const generation=scanGeneration;
  try{
    const scale=Math.min(1,800/scanVideo.videoWidth);
    scanCanvas.width=Math.round(scanVideo.videoWidth*scale);
    scanCanvas.height=Math.round(scanVideo.videoHeight*scale);
    scanContext.drawImage(scanVideo,0,0,scanCanvas.width,scanCanvas.height);
    const image=scanContext.getImageData(0,0,scanCanvas.width,scanCanvas.height);
    const code=jsQR(image.data,image.width,image.height,{inversionAttempts:'dontInvert'});
    if(code){
      const memberCode=code.data.trim();
      const member=db.members.find(item=>item.id.toLowerCase()===memberCode.toLowerCase());
      if(member){
        stopQrScan();
        scanDlg.close();
        openMember(member.id);
        return;
      }
      if(memberCode!==lastScannedCode){
        lastScannedCode=memberCode;
        scanStatus.textContent='Scanned '+memberCode+', but no matching member was found on this device. Check that this browser has the latest member data.';
      }
    }
  }catch(error){
    if(generation!==scanGeneration||!scanDlg.open)return;
    stopQrScan();
    scanStatus.textContent='QR scanning stopped: '+error.message;
    return;
  }finally{
    scanBusy=false;
  }
  scheduleQrScan();
}

async function startQrScan(){
  stopQrScan();
  scanDlg.showModal();
  const generation=scanGeneration;
  lastScannedCode='';
  cameraSelect.hidden=true;
  cameraSelect.disabled=true;
  cameraSelect.replaceChildren();
  scanStatus.textContent='Starting camera…';
  const isLocalhost=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  if(location.protocol!=='https:'&&!isLocalhost){
    scanStatus.textContent='Camera access requires a secure page. Open this app using HTTPS or localhost, not a file:// link.';
    return;
  }
  if(!navigator.mediaDevices?.getUserMedia){
    scanStatus.textContent='This browser cannot access a camera. Try an up-to-date version of Chrome or Edge.';
    return;
  }
  try{
    await connectCamera('',generation);
  }catch(error){
    stopQrScan();
    if(error.name==='NotAllowedError'){
      scanStatus.textContent='Camera permission was denied. Allow camera access in your browser settings, then try again.';
    }else if(error.name==='NotFoundError'){
      scanStatus.textContent='No camera was found. Connect a webcam or search for the member ID.';
    }else if(error.name==='NotReadableError'){
      scanStatus.textContent='The camera is already in use by another app. Close that app and try again.';
    }else{
      scanStatus.textContent='Could not start the camera: '+error.message;
    }
  }
}

cameraSelect.onchange=async()=>{
  const deviceId=cameraSelect.value;
  if(!deviceId||!scanDlg.open)return;
  stopQrScan();
  const generation=scanGeneration;
  scanStatus.textContent='Switching camera…';
  cameraSelect.disabled=true;
  try{
    await connectCamera(deviceId,generation);
  }catch(error){
    if(generation!==scanGeneration||!scanDlg.open)return;
    scanStatus.textContent='Could not switch camera: '+error.message;
  }finally{
    if(generation===scanGeneration)cameraSelect.disabled=false;
  }
};

$('scan').onclick=startQrScan;
$('closeScan').onclick=()=>scanDlg.close();
scanDlg.addEventListener('close',stopQrScan);
}

startApp().catch(error=>{
  console.error('Could not initialize the gym members app.',error);
  $('empty').hidden=false;
  $('empty').textContent='Could not open the browser database: '+error.message+' Your saved data has not been changed.';
  alert('Could not open the browser database: '+error.message+' Your saved data has not been changed.');
});
