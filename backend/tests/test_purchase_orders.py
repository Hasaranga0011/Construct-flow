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


def test_supplier_cannot_receive_goods(monkeypatch):
    with pytest.raises(HTTPException) as error:
        orders.receive_po("po-1", {"role": "supplier", "id": "supplier-1", "token": "token"})
    assert error.value.status_code == 403


@pytest.mark.parametrize("code,status", [("42501", 403), ("P0002", 404), ("P0001", 409)])
def test_database_transition_errors_preserve_http_status(monkeypatch, code, status):
    class DatabaseFailure(Exception):
        pass
    failure = DatabaseFailure("Transition rejected")
    failure.code = code
    client = Client({"supplier_id": "supplier-1"})
    def rpc(*args):
        raise failure
    client.rpc = rpc
    monkeypatch.setattr(orders, "client_for_token", lambda token: client)
    with pytest.raises(HTTPException) as error:
        orders.deliver_po("po-1", {"role": "supplier", "id": "supplier-1", "token": "token"})
    assert error.value.status_code == status


def test_deliver_po_handles_notification_enum_22P02_gracefully(monkeypatch):
    class EnumFailure(Exception):
        code = "22P02"
    failure = EnumFailure('invalid input value for enum notification_type: "info"')
    
    initial_order = {
        "id": "po-1",
        "po_number": "PO-101",
        "project_id": "proj-1",
        "supplier_id": "supplier-1",
        "status": "Confirmed",
        "supplier_notes": "[]"
    }
    
    updated_state = dict(initial_order)
    notifications_sent = []
    
    class FakeServiceTable:
        def __init__(self, table_name):
            self.table_name = table_name
            self._filters = {}
            self._update_data = None
            
        def select(self, *args):
            return self
            
        def eq(self, field, value):
            self._filters[field] = value
            return self
            
        def update(self, data):
            self._update_data = data
            return self
            
        def execute(self):
            if self._update_data:
                updated_state.update(self._update_data)
                return SimpleNamespace(data=[dict(updated_state)])
            return SimpleNamespace(data=[dict(updated_state)])
            
    class FakeServiceClient:
        def table(self, name):
            return FakeServiceTable(name)
            
    client = Client(initial_order)
    def failing_rpc(*args, **kwargs):
        raise failure
    client.rpc = failing_rpc
    
    monkeypatch.setattr(orders, "client_for_token", lambda token: client)
    monkeypatch.setattr(orders, "get_service_client", lambda: FakeServiceClient())
    monkeypatch.setattr(orders, "create_notifications", lambda notifs: notifications_sent.extend(notifs))
    
    result = orders.deliver_po("po-1", {"role": "supplier", "id": "supplier-1", "token": "token"})
    assert result["status"] == "Delivered"
    assert updated_state["status"] == "Delivered"
    assert "delivered_at" in updated_state
    assert len(notifications_sent) == 2
    assert all(n["type"] == "general" for n in notifications_sent)


def test_receive_po_handles_notification_enum_22P02_gracefully(monkeypatch):
    class EnumFailure(Exception):
        code = "22P02"
    failure = EnumFailure('invalid input value for enum notification_type: "success"')
    
    initial_order = {
        "id": "po-1",
        "po_number": "PO-101",
        "project_id": "proj-1",
        "material_id": "mat-1",
        "quantity_ordered": 25.0,
        "supplier_id": "supplier-1",
        "status": "Delivered",
        "supplier_notes": "[]"
    }
    
    updated_state = dict(initial_order)
    material_stock = {"id": "mat-1", "project_id": "proj-1", "current_stock": 10.0}
    notifications_sent = []
    
    class FakeServiceTable:
        def __init__(self, table_name):
            self.table_name = table_name
            self._filters = {}
            self._update_data = None
            
        def select(self, *args):
            return self
            
        def eq(self, field, value):
            self._filters[field] = value
            return self
            
        def update(self, data):
            self._update_data = data
            return self
            
        def execute(self):
            if self.table_name == "materials":
                if self._update_data:
                    material_stock.update(self._update_data)
                return SimpleNamespace(data=[dict(material_stock)])
            if self._update_data:
                updated_state.update(self._update_data)
                return SimpleNamespace(data=[dict(updated_state)])
            return SimpleNamespace(data=[dict(updated_state)])
            
    class FakeServiceClient:
        def table(self, name):
            return FakeServiceTable(name)
            
    client = Client(initial_order)
    def failing_rpc(*args, **kwargs):
        raise failure
    client.rpc = failing_rpc
    
    monkeypatch.setattr(orders, "client_for_token", lambda token: client)
    monkeypatch.setattr(orders, "get_service_client", lambda: FakeServiceClient())
    monkeypatch.setattr(orders, "create_notifications", lambda notifs: notifications_sent.extend(notifs))
    
    result = orders.receive_po("po-1", {"role": "super_admin", "id": "admin-1", "token": "token"})
    assert result["status"] == "Received"
    assert updated_state["status"] == "Received"
    assert material_stock["current_stock"] == 35.0
    assert len(notifications_sent) == 2
    assert all(n["type"] == "general" for n in notifications_sent)


def test_deliver_po_handles_notification_user_id_not_null_23502_gracefully(monkeypatch):
    class ConstraintFailure(Exception):
        code = "23502"
    failure = ConstraintFailure('null value in column "user_id" of relation "notifications" violates not-null constraint')

    initial_order = {
        "id": "po-1",
        "po_number": "PO-101",
        "project_id": "proj-1",
        "supplier_id": "supplier-1",
        "status": "Confirmed",
        "supplier_notes": "[]"
    }

    updated_state = dict(initial_order)
    notifications_sent = []

    class FakeServiceTable:
        def __init__(self, table_name):
            self.table_name = table_name

        def select(self, *args):
            return self

        def eq(self, field, value):
            return self

        def update(self, data):
            updated_state.update(data)
            return self

        def execute(self):
            return SimpleNamespace(data=[dict(updated_state)])

    class FakeServiceClient:
        def table(self, name):
            return FakeServiceTable(name)

    client = Client(initial_order)
    def failing_rpc(*args, **kwargs):
        raise failure
    client.rpc = failing_rpc

    monkeypatch.setattr(orders, "client_for_token", lambda token: client)
    monkeypatch.setattr(orders, "get_service_client", lambda: FakeServiceClient())
    monkeypatch.setattr(orders, "create_notifications", lambda notifs: notifications_sent.extend(notifs))

    result = orders.deliver_po("po-1", {"role": "supplier", "id": "supplier-1", "token": "token"})
    assert result["status"] == "Delivered"
    assert updated_state["status"] == "Delivered"
    assert "delivered_at" in updated_state
    assert len(notifications_sent) == 2
    assert all(n["type"] == "general" for n in notifications_sent)


