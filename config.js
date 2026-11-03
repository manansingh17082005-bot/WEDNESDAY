// WEDNESDAY personal local mode.
// Supabase sign-in is disabled for this personal workspace.
// Live cloud lead discovery requires Supabase authentication and will be unavailable
// until a secure sign-in flow is restored.
window.WEDNESDAY_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: ""
};

// Load the companion selector before app.js initializes.
document.write('<link rel="stylesheet" href="./companions.css">');
document.write('<script src="./companions.js"><\/script>');
