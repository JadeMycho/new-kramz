function render(){
  const asOf=$('asof').value||iso(new Date()), q=$('q').value.trim().toLowerCase();
  const list=db.members.map(m=>({m,s:stat(m,asOf)}));
  const count=k=>list.filter(x=>x.s.k===k).length;
  const tiles=[['expired','Expired',count('expired')],['soon','Ending within 3 days',count('soon')],['active','Active',count('active')],['all','All members',list.length]];
  $('tiles').innerHTML='';
  tiles.forEach(([k,l,n])=>{
    const b=document.createElement('button');b.className='tile '+k;b.setAttribute('aria-pressed',String(filt===k&&!q));
    b.innerHTML='<span class="num">'+n+'</span>'+l;
    b.onclick=()=>{filt=k;$('q').value='';render()};$('tiles').appendChild(b);
  });
  let rows=q?list.filter(x=>(x.m.name+' '+x.m.phone+' '+x.m.id).toLowerCase().includes(q)):list.filter(x=>filt==='all'||x.s.k===filt);
  rows.sort((a,b)=>a.m.through<b.m.through?-1:1);
  const tb=$('rows');tb.innerHTML='';
  rows.forEach(({m,s})=>{
    const tr=document.createElement('tr');tr.tabIndex=0;
    const c=(t,sub)=>{const td=document.createElement('td');td.textContent=t;if(sub){const e=document.createElement('small');e.textContent=sub;td.appendChild(e)}return td};
    tr.append(c(m.name,m.id),c(m.phone||'-'),c(PLAN[m.plan]),c(fmt(m.through)));
    const st=document.createElement('td');st.innerHTML='<span class="chip '+s.k+'"></span>';st.firstChild.textContent=s.t;tr.append(st);
    tr.onclick=()=>openMember(m.id);tr.onkeydown=e=>{if(e.key==='Enter')openMember(m.id)};
    tb.appendChild(tr);
  });
  const em=$('empty');em.hidden=rows.length>0;
  em.textContent=!db.members.length?'No members yet. Select Add member to enter the first one.':q?'No member matches that search.':filt==='expired'?'No expired members on '+fmt(asOf)+'.':'No members in this group on '+fmt(asOf)+'.';
}

function openMember(id){
  const m=db.members.find(x=>x.id===id);if(!m)return;
  const asOf=$('asof').value||iso(new Date()),s=stat(m,asOf),d=$('viewDlg');
  d.innerHTML='<div class="member-heading"><div><p class="eyebrow">MEMBER PROFILE</p><h2></h2><div class="member-meta" id="meta"></div></div><button id="close" class="icon-close" aria-label="Close member details">&times;</button></div>'+
   '<div class="member-content"><section class="member-qr" aria-labelledby="qrHeading"><div class="member-panel-heading"><h3 id="qrHeading">Member QR code</h3><p id="qrHint"></p></div><canvas id="qr"></canvas><div class="member-qr-actions" id="acts"></div></section>'+
   '<section class="member-info" aria-labelledby="membershipHeading"><p class="eyebrow">MEMBERSHIP</p><h3 id="membershipHeading" class="big num"></h3><div class="member-plan" id="plan"></div><div class="renew-box"><label for="renewDate">Renewal start date</label><input type="date" id="renewDate" required><label for="rp">Record a payment</label><div class="renew-controls"><select id="rp"><option value="session">Single session · ₱50</option><option value="15">15 days · ₱250</option><option value="30">1 month · ₱500</option><option value="promo">1 month + free jersey · ₱650</option></select><button class="primary" id="renew">Record</button></div></div></section>'+
   '<section class="member-history" aria-labelledby="memberSalesHeading"><h3 id="memberSalesHeading">Payment history</h3><div id="memberSales"></div></section></div>'+
   '<div class="member-footer"><button id="del" class="danger">Delete member</button></div>';
  d.querySelector('h2').textContent=m.name;d.querySelector('.big').textContent=s.t;d.querySelector('.big').classList.add(s.k);
  $('meta').textContent=m.id+' · '+(m.phone||'No phone number');
  $('plan').textContent=PLAN[m.plan]+' · Valid through '+fmt(m.through);
  $('qrHint').textContent=m.paid?'Use this code for a quick check-in.':'Mark payment received to create a check-in code.';
  const memberSales=$('memberSales'),memberRecords=sales.filter(sale=>sale.memberId===m.id).slice().reverse();
  if(memberRecords.length){
    const table=document.createElement('table');table.className='member-sales-table';
    const head=document.createElement('thead'),headingRow=document.createElement('tr');
    ['Renewed on','Purchase','Amount',''].forEach(label=>{const cell=document.createElement('th');cell.textContent=label;headingRow.append(cell)});
    head.append(headingRow);
    const body=document.createElement('tbody');
    const latestSale=memberRecords[0];
    memberRecords.forEach(sale=>{
      const row=document.createElement('tr'),date=document.createElement('td'),purchase=document.createElement('td'),amount=document.createElement('td'),action=document.createElement('td'),undo=document.createElement('button');
      const renewedOn=sale.plan!=='session'&&typeof sale.after?.start==='string'?sale.after.start:sale.paidAt;
      date.textContent=fmt(renewedOn);purchase.textContent=PLAN[sale.plan]||sale.plan;amount.textContent=formatMoney(sale.amount);
      undo.type='button';undo.className='undo-sale';undo.textContent='Undo';
      undo.disabled=sale!==latestSale;
      if(undo.disabled)undo.title='Undo newer payment records first.';
      undo.onclick=async()=>{
        if(!confirm('Undo this '+formatMoney(sale.amount)+' payment record?'))return;
        const before=sale.before,after=sale.after;
        if(before&&after&&(!m||m.plan!==after.plan||m.start!==after.start||m.through!==after.through||m.paid!==after.paid)){
          alert('The membership has changed since this payment. The record was not undone.');
          return;
        }
        const previousSales=sales;
        sales=sales.filter(record=>record!==sale);
        if(before&&after){
          const current={plan:m.plan,start:m.start,through:m.through,paid:m.paid};
          Object.assign(m,before);
          if(!await save()){
            Object.assign(m,current);sales=previousSales;return;
          }
        }else if(!await saveSales()){
          sales=previousSales;return;
        }
        render();openMember(id);
      };
      action.append(undo);row.append(date,purchase,amount,action);body.append(row);
    });
    table.append(head,body);memberSales.append(table);
  }else{
    memberSales.textContent='No payments recorded yet.';
    memberSales.className='member-sales-empty';
  }
  const cv=$('qr'),acts=$('acts');
  if(m.paid){
    drawQR(cv,m);
    const a=document.createElement('button');a.textContent='Download QR';
    a.onclick=()=>{const l=document.createElement('a');l.download=m.id+'.png';l.href=cv.toDataURL('image/png');l.click()};
    acts.append(a);
  }else{
    cv.remove();
    const b=document.createElement('button');b.className='primary';b.textContent='Mark as paid';
    b.onclick=async()=>{
      const before={plan:m.plan,start:m.start,through:m.through,paid:m.paid};
      const after={...before,paid:true};
      m.paid=true;
      if(!await recordSale(m,m.plan,before,after)){m.paid=false;return}
      render();openMember(id);
    };
    acts.append(b);
  }
  $('rp').value=m.plan;
  const today=iso(new Date());
  let defaultStart=today;
  if(m.plan!=='session'&&m.through>=today){const next=parse(m.through);next.setDate(next.getDate()+1);defaultStart=iso(next)}
  $('renewDate').value=defaultStart;
  $('renew').onclick=async()=>{
    const p=$('rp').value,start=$('renewDate').value;
    if(!start){$('renewDate').focus();return}
    const previous={plan:m.plan,start:m.start,through:m.through,paid:m.paid};
    const noMembershipChange=p==='session'&&m.paid&&m.plan!=='session'&&m.through>=today;
    const next=noMembershipChange?previous:{plan:p,start,through:through(start,p),paid:true};
    if(noMembershipChange){
      if(!await recordSale(m,p,previous,next))return;
      render();openMember(id);return;
    }
    Object.assign(m,next);
    if(!await recordSale(m,p,previous,next)){
      Object.assign(m,previous);return;
    }
    render();openMember(id);
  };
  $('del').onclick=async()=>{
    if(!confirm('Delete '+m.name+'? Their revenue history will be retained. This cannot be undone.'))return;
    const previousMembers=db.members;
    db.members=db.members.filter(member=>member.id!==id);
    if(!await save()){
      db.members=previousMembers;return;
    }
    d.close();render();
  };
  $('close').onclick=()=>d.close();
  if(!d.open)d.showModal();
}
