import re

with open('src/app/supplier/deliveries/index.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('SupplierOrders', 'SupplierDeliveries')
c = c.replace('title="My Orders"', 'title="My Deliveries"')
c = c.replace('My Orders</Text>', 'My Deliveries</Text>')
c = c.replace("const [statusFilter, setStatusFilter] = useState('All');", "const [statusFilter, setStatusFilter] = useState('Confirmed');")
c = c.replace("orders, setOrders", "deliveries, setDeliveries")
c = c.replace("orders.length", "deliveries.length")
c = c.replace("orders.map", "deliveries.map")
c = c.replace("setOrders(filteredData)", "setDeliveries(filteredData)")

with open('src/app/supplier/deliveries/index.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
