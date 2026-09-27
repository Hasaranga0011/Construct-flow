import re

with open('src/app/supplier/orders/index.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Replace Component name
c = c.replace('AdminPurchaseOrders', 'SupplierOrders')

# Replace router links
c = c.replace('/admin/materials/orders/', '/supplier/orders/')
c = c.replace("router.push('/admin/materials')", "router.back()")

# Remove New Order button action
c = c.replace('actionLabel="+ New Order"', '')
c = c.replace("onActionPress={() => router.push('/supplier/orders/create')} ", "")

# Change Title
c = c.replace('title="Purchase Orders"', 'title="My Orders"')
c = c.replace('All Orders', 'My Orders')

# Update fetching logic to only fetch supplier's orders
old_fetch = """        let query = supabase.from('purchase_orders').select(`*`).order('created_at', { ascending: false });"""
new_fetch = """        const { data: sessionData } = await supabase.auth.getSession();
        const currentUserId = sessionData.session?.user.id;
        
        let query = supabase.from('purchase_orders').select(`*`).eq('supplier_id', currentUserId).order('created_at', { ascending: false });"""
c = c.replace(old_fetch, new_fetch)

with open('src/app/supplier/orders/index.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
