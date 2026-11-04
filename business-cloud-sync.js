/* WEDNESDAY Supabase cloud sync. Browser storage remains the offline fallback. */
(() => {
  "use strict";
  const client = () => window.WEDNESDAY_SUPABASE_CLIENT || null;
  async function currentUser(db) {
    const { data, error } = await db.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error("Sign in before syncing your records.");
    return data.user;
  }
  async function syncRows(db, user, table, localRows, toDb, fromDb) {
    const tracker = "wednesday_cloud_known_" + table;
    let previouslySynced = [];
    try { previouslySynced = JSON.parse(localStorage.getItem(tracker) || "[]"); } catch (_) {}
    const localIds = new Set((localRows || []).map(row => String(row.id)));
    const removedIds = previouslySynced.filter(id => !localIds.has(String(id)));
    if (removedIds.length) {
      const { error: deleteError } = await db.from(table).delete().eq("user_id", user.id).in("id", removedIds);
      if (deleteError) throw new Error(table + " delete: " + deleteError.message);
    }
    const { data: remote, error } = await db.from(table).select("*").eq("user_id", user.id);
    if (error) throw new Error(table + ": " + error.message);
    const merged = new Map((remote || []).map(row => [String(row.id), fromDb(row)]));
    (localRows || []).forEach(row => merged.set(String(row.id), row));
    const rows = [...merged.values()];
    if (rows.length) {
      const payload = rows.map(row => ({ ...toDb(row), user_id: user.id }));
      const { error: writeError } = await db.from(table).upsert(payload, { onConflict: "id" });
      if (writeError) throw new Error(table + ": " + writeError.message);
    }
    try { localStorage.setItem(tracker, JSON.stringify(rows.map(row => String(row.id)))); } catch (_) {}
    return rows;
  }
  async function syncClients(local) {
    const db=client(); if(!db) return local || [];
    const user=await currentUser(db);
    return syncRows(db,user,"clients",local,
      x=>({id:x.id,name:x.name,contact:x.contact||null,company:x.company||null,phone:x.phone||null,email:x.email||null,service:x.service||null,status:x.status||"New",notes:x.notes||null,created_at:x.createdAt||new Date().toISOString()}),
      x=>({id:x.id,name:x.name,contact:x.contact||"",company:x.company||"",phone:x.phone||"",email:x.email||"",service:x.service||"",status:x.status||"New",notes:x.notes||"",createdAt:x.created_at}));
  }
  async function syncHub(state) {
    const db=client(); if(!db) return state;
    const user=await currentUser(db);
    const [deals,money,approvals]=await Promise.all([
      syncRows(db,user,"business_opportunities",state.deals,
        x=>({id:x.id,business_name:x.business,contact_name:x.contact||null,service:x.service,market:x.market,estimated_value:Number(x.value)||0,stage:x.stage,follow_up_date:x.followup||null,notes:x.notes||null,created_at:x.createdAt||new Date().toISOString()}),
        x=>({id:x.id,business:x.business_name,contact:x.contact_name||"",service:x.service,market:x.market,value:Number(x.estimated_value)||0,stage:x.stage,followup:x.follow_up_date||"",notes:x.notes||"",createdAt:x.created_at})),
      syncRows(db,user,"business_transactions",state.money,
        x=>({id:x.id,label:x.label,kind:x.kind,payment_state:x.state,amount:Number(x.amount)||0,transaction_date:x.date||new Date().toISOString().slice(0,10)}),
        x=>({id:x.id,label:x.label,kind:x.kind,state:x.payment_state,amount:Number(x.amount)||0,date:x.transaction_date})),
      syncRows(db,user,"outreach_approvals",state.approvals,
        x=>({id:x.id,business_name:x.business,service:x.service||"",channel:x.channel||"",message:x.message,status:x.status||"Awaiting your approval",contacted_at:x.contactedAt||null,created_at:x.createdAt||new Date().toISOString()}),
        x=>({id:x.id,business:x.business_name,service:x.service,channel:x.channel,message:x.message,status:x.status,contactedAt:x.contacted_at,createdAt:x.created_at}))
    ]);
    return {...state,deals,money,approvals};
  }
  window.WEDNESDAY_CLOUD_SYNC = { syncClients, syncHub, isConnected:()=>!!client() };
  window.addEventListener("wednesday-cloud-ready", async () => {
    try {
      const clients=JSON.parse(localStorage.getItem("wednesday_clients")||"[]");
      const merged=await syncClients(clients);
      localStorage.setItem("wednesday_clients",JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent("wednesday-clients-synced",{detail:merged}));
    } catch(error) { console.warn("WEDNESDAY CRM cloud sync:",error.message); }
  });
  document.addEventListener("DOMContentLoaded", () => {
    const db=client(); if(!db) return;
    db.auth.onAuthStateChange((event,session) => {
      if(session && ["SIGNED_IN","INITIAL_SESSION","TOKEN_REFRESHED"].includes(event)) {
        setTimeout(()=>window.dispatchEvent(new Event("wednesday-cloud-ready")),0);
      }
    });
  });
})();
