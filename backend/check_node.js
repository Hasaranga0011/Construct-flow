require('dotenv').config();
async function checkSchema() {
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/purchase_orders?select=*&limit=1`, {
      headers: {
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
      }
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.length > 0) {
        console.log("Columns from data:", Object.keys(data[0]));
      } else {
        console.log("No data found. Trying OPTIONS...");
        const opt = await fetch(`${process.env.SUPABASE_URL}/rest/v1/purchase_orders`, {
          method: 'OPTIONS',
          headers: {
            'apikey': process.env.SUPABASE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
          }
        });
        console.log("Allowed Methods:", opt.headers.get('allow'));
      }
    } else {
      console.log("Error fetching:", await res.text());
    }
  } catch(e) {
    console.error("Fetch error:", e);
  }
}
checkSchema();
