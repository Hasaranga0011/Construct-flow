from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from api.routes import purchase_orders as orders

class Client:
    def __init__(self, order): self.order = order; self.calls = []
    def table(self, name): return self
    def select(self, *args): return self
    def eq(self, *args): return self
    def execute(self): return SimpleNamespace(data=[self.order])
    def rpc(self, name, params):
        self.calls.append((name, params))
        return SimpleNamespace(execute=lambda: SimpleNamespace(data={"id": "po-1", "status": "Delivered"}))

def test_supplier_cannot_change_another_suppliers_order():
    with pytest.raises(HTTPException) as error:
        orders.check_order_access(Client({"supplier_id": "supplier-2"}), "po-1", {"role": "supplier", "id": "supplier-1"})
    assert error.value.status_code == 403

def test_worker_cannot_approve_order():
    with pytest.raises(HTTPException) as error:
        orders.check_order_access(Client({"supplier_id": "worker-1"}), "po-1", {"role": "worker", "id": "worker-1"})
    assert error.value.status_code == 403

def test_delivery_uses_atomic_database_operation(monkeypatch):
    client = Client({"supplier_id": "supplier-1"})
    monkeypatch.setattr(orders, "client_for_token", lambda token: client)
    result = orders.deliver_po("po-1", {"role": "supplier", "id": "supplier-1", "token": "token"})
    assert result["status"] == "Delivered"
    assert client.calls == [("deliver_purchase_order", {"p_order_id": "po-1"})]

def test_receive_uses_atomic_database_operation(monkeypatch):
    client = Client({"supplier_id": "supplier-1"})
    monkeypatch.setattr(orders, "client_for_token", lambda token: client)
    result = orders.receive_po("po-1", {"role": "super_admin", "id": "admin-1", "token": "token"})
    assert result["status"] == "Delivered"
    assert client.calls == [("receive_purchase_order", {"p_order_id": "po-1"})]
