const KEY='gymMembers.v1', SALES_KEY='gymSales.v1', PIN_KEY='gymAdminPin.v1';
const DATABASE_NAME='gymMembersDatabase', DATABASE_VERSION=1, DATA_STORE='appData';
const PLAN={session:'Single session','15':'15 days','30':'1 month',promo:'1 month + free jersey'};
const PRICE={session:50,'15':250,'30':500,promo:650};
let db={members:[],next:1}, filt='expired';
let sales=[];
let storageDb=null,storageReady=false;
const $=id=>document.getElementById(id);

function requestResult(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction){
  return new Promise((resolve,reject)=>{
    transaction.oncomplete=resolve;
    transaction.onerror=()=>reject(transaction.error||new Error('IndexedDB transaction failed.'));
    transaction.onabort=()=>reject(transaction.error||new Error('IndexedDB transaction was aborted.'));
  });
}

function readLegacyValue(key,fallback){
  const raw=localStorage.getItem(key);
  if(raw===null)return fallback;
  try{
    return JSON.parse(raw);
  }catch(e){
    throw new Error('Could not read existing browser data from '+key+': '+e.message);
  }
}

async function initializeStorage(){
  if(!('indexedDB'in window))throw new Error('IndexedDB is unavailable in this browser.');
  const openRequest=indexedDB.open(DATABASE_NAME,DATABASE_VERSION);
  openRequest.onupgradeneeded=()=>{
    if(!openRequest.result.objectStoreNames.contains(DATA_STORE)){
      openRequest.result.createObjectStore(DATA_STORE,{keyPath:'key'});
    }
  };
  storageDb=await requestResult(openRequest);
  storageDb.onversionchange=()=>storageDb.close();

  const readTransaction=storageDb.transaction(DATA_STORE,'readonly');
  const store=readTransaction.objectStore(DATA_STORE);
  const [savedMembers,savedSales]=await Promise.all([
    requestResult(store.get('members')),
    requestResult(store.get('sales'))
  ]);
  await transactionDone(readTransaction);

  let legacyMembers=null,legacySales=null;
  if(!savedMembers||!savedSales){
    legacyMembers=readLegacyValue(KEY,null);
    legacySales=readLegacyValue(SALES_KEY,null);
  }
  db=savedMembers?.value||legacyMembers||{members:[],next:1};
  sales=savedSales?.value||legacySales||[];
  if(!db||!Array.isArray(db.members))throw new Error('Saved member data is invalid. Your existing data has been left unchanged.');
  if(!Array.isArray(sales))throw new Error('Saved sales data is invalid. Your existing data has been left unchanged.');
  sales=sales.filter(sale=>sale&&typeof sale==='object'&&typeof sale.memberId==='string'&&typeof sale.memberName==='string'&&typeof sale.plan==='string'&&typeof sale.paidAt==='string'&&Number.isFinite(Number(sale.amount)));
  if(!savedMembers||!savedSales)await persistData();
  if(!savedMembers&&legacyMembers!==null)localStorage.removeItem(KEY);
  if(!savedSales&&legacySales!==null)localStorage.removeItem(SALES_KEY);
  storageReady=true;
}

async function persistData(){
  if(!storageReady&&!storageDb)throw new Error('Browser storage has not finished initializing.');
  const transaction=storageDb.transaction(DATA_STORE,'readwrite');
  const done=transactionDone(transaction);
  const store=transaction.objectStore(DATA_STORE);
  store.put({key:'members',value:db});
  store.put({key:'sales',value:sales});
  await done;
}

async function replaceAllData(nextMembers,nextSales){
  const transaction=storageDb.transaction(DATA_STORE,'readwrite');
  const done=transactionDone(transaction);
  const store=transaction.objectStore(DATA_STORE);
  store.put({key:'members',value:nextMembers});
  store.put({key:'sales',value:nextSales});
  await done;
  db=nextMembers;
  sales=nextSales;
}

function validateBackup(data){
  if(!data||!Array.isArray(data.members))throw new Error('Backup must contain a members list.');
  if(data.sales!==undefined&&!Array.isArray(data.sales))throw new Error('Backup sales data must be a list.');
  const validSales=(data.sales||[]).filter(sale=>sale&&typeof sale==='object'&&typeof sale.memberId==='string'&&typeof sale.memberName==='string'&&typeof sale.plan==='string'&&typeof sale.paidAt==='string'&&Number.isFinite(Number(sale.amount)));
  if(validSales.length!==(data.sales||[]).length)throw new Error('Backup contains an invalid sales record.');
  return{
    members:{members:data.members,next:data.next||data.members.length+1},
    sales:validSales
  };
}

async function save(){
  try{
    await persistData();
    return true;
  }catch(e){
    alert('Could not save member data in IndexedDB. Your previous saved data has been kept.');
    console.error('Could not save member data.',e);
    return false;
  }
}

async function saveSales(){
  try{
    await persistData();
    return true;
  }catch(e){
    alert('Could not save sales data in IndexedDB. Your previous saved data has been kept.');
    console.error('Could not save sales data.',e);
    return false;
  }
}

async function recordSale(member,plan,before,after){
  if(!Object.prototype.hasOwnProperty.call(PRICE,plan)){
    alert('That purchase type has no configured price.');
    return false;
  }
  const sale={id:Date.now()+'-'+Math.random().toString(36).slice(2),memberId:member.id,memberName:member.name,plan,amount:PRICE[plan],paidAt:iso(new Date()),before,after};
  sales.push(sale);
  if(!await saveSales()){
    sales.pop();
    return false;
  }
  return true;
}

function generateMemberId(){
  const usedIds=new Set(db.members.map(member=>member.id));
  const random=new Uint16Array(1);
  for(let attempt=0;attempt<100;attempt++){
    crypto.getRandomValues(random);
    if(random[0]>=60000)continue;
    const id='GYM-'+String(random[0]%10000).padStart(4,'0');
    if(!usedIds.has(id))return id;
  }
  throw new Error('Could not generate a unique member code. Try again.');
}

const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const formatMoney=amount=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(amount);
const parse=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const fmt=s=>parse(s).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});

function through(start,plan){
  const d=parse(start);
  if(plan==='session')return iso(d);
  if(plan==='promo')plan='30';
  if(plan==='15'){d.setDate(d.getDate()+14);return iso(d)}
  const last=new Date(d.getFullYear(),d.getMonth()+2,0).getDate();
  const e=new Date(d.getFullYear(),d.getMonth()+1,1);e.setDate(Math.min(d.getDate(),last));
  e.setDate(e.getDate()-1);return iso(e)
}

function stat(m,asOf){
  if(!m.paid)return{k:'unpaid',t:'Not paid'};
  const left=Math.round((parse(m.through)-parse(asOf))/864e5);
  const u=n=>n+(Math.abs(n)===1?' day':' days');
  if(left<0)return{k:'expired',t:'Expired '+u(-left)+' ago'};
  if(left<=3)return{k:'soon',t:left?'Ends in '+u(left):'Ends today'};
  return{k:'active',t:u(left)+' left'};
}
