(() => {
  "use strict";
  const getClient = () => window.WEDNESDAY_SUPABASE_CLIENT || null;
  async function userFor(db) {
    const result = await db.auth.getUser();
    if (result.error) throw result.error;
    if (!result.data.user) throw new Error("Sign in before syncing.");
    return result.data.user;
  }
  async function mergeRows(db, user, table, localRows, encode, decode) {
    const result = await db.from(table).select("*").eq("user_id", user.id);
    if (result.error) throw result.error;
    const rows = new Map((result.data || []).map(row => [String(row.id), decode(row)]));
    (localRows || []).forEach(row => rows.set(String(row.id), row));
    const merged = [...rows.values()];
    if (merged.length) {
      const write = await db.from(table).upsert(merged.map(row => ({...encode(row), user_id:user.id})), {onConflict:"id"});
      if (write.error) throw write.error;
    }
    return merged;
  }
  async function syncClients(local) {
    const db=getClient(); if(!db) return local || [];
    const user=await userFor(db);
    return mergeRows(db,user,"clients",local,
      x=>({id:x.id,name:x.name,contact:x.contact||null,company:x.company||null,phone:x.phone||null,email:x.email||null,service:x.service||null,status:x.status||"New",notes:x.notes||null,created_at:x.createdAt||new Date().toISOString()}),
      x=>({id:x.id,name:x.name,contact:x.contact||"",company:x.company||"",phone:x.phone||"",email:x.email||"",service:x.service||"",status:x.status||"New",notes:x.notes||"",createdAt:x.created_at}));
  }
  async function syncHub(state) {
    const db=getClient(); if(!db) return state;
    const user=await userFor(db);
    const results=await Promise.all([
      mergeRows(db,user,"business_opportunities",state.deals,
        x=>({id:x.id,business_name:x.business,contact_name:x.contact||null,service:x.service,market:x.market,estimated_value:Number(x.value)||0,stage:x.stage,follow_up_date:x.followup||null,notes:x.notes||null,created_at:x.createdAt||new Date().toISOString()}),
        x=>({id:x.id,business:x.business_name,contact:x.contact_name||"",service:x.service,market:x.market,value:Number(x.estimated_value)||0,stage:x.stage,followup:x.follow_up_date||"",notes:x.notes||"",createdAt:x.created_at})),
      mergeRows(db,user,"business_transactions",state.money,
        x=>({id:x.id,label:x.label,kind:x.kind,payment_state:x.state,amount:Number(x.amount)||0,transaction_date:x.date||new Date().toISOString().slice(0,10)}),
        x=>({id:x.id,label:x.label,kind:x.kind,state:x.payment_state,amount:Number(x.amount)||0,date:x.transaction_date})),
      mergeRows(db,user,"outreach_approvals",state.approvals,
        x=>({id:x.id,business_name:x.business,service:x.service||"",channel:x.channel||"",message:x.message,status:x.status||"Awaiting your approval",contacted_at:x.contactedAt||null,created_at:x.createdAt||new Date().toISOString()}),
        x=>({id:x.id,business:x.business_name,service:x.service,channel:x.channel,message:x.message,status:x.status,contactedAt:x.contacted_at,createdAt:x.created_at}))
    ]);
    return {...state,deals:results[0],money:results[1],approvals:results[2]};
  }
  window.WEDNESDAY_CLOUD_SYNC={syncClients,syncHub,isConnected:()=>!!getClient()};
  window.addEventListener("wednesday-cloud-ready",async()=>{
    try {
      const local=JSON.parse(localStorage.getItem("wednesday_clients")||"[]");
      const merged=await syncClients(local);
      localStorage.setItem("wednesday_clients",JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent("wednesday-clients-synced",{detail:merged}));
    } catch(error) { console.warn("CRM cloud sync:",error.message); }
  });
  document.addEventListener("DOMContentLoaded",()=>{
    const db=getClient(); if(!db) return;
    db.auth.onAuthStateChange((event,session)=>{
      if(session && ["SIGNED_IN","INITIAL_SESSION","TOKEN_REFRESHED"].includes(event)) {
        setTimeout(()=>window.dispatchEvent(new Event("wednesday-cloud-ready")),0);
      }
    });
  });
})();
