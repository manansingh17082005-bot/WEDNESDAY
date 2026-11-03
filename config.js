// Public client configuration only. Never put AI provider secrets or Supabase service-role keys here.
window.WEDNESDAY_CONFIG = {
  supabaseUrl: "https://bdidzrlljkkssamzahxz.supabase.co",
  supabaseAnonKey: "sb_publishable_y9UZ-h_9JaeV-VLSqiRX6g_kIgUHtm4"
};

// Load the companion selector before app.js initializes.
document.write('<link rel="stylesheet" href="./companions.css">');
document.write('<script src="./companions.js"><\/script>');
