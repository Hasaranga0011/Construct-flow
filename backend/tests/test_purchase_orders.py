from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from api.routes import purchase_orders as orders


@pytest.fixture
def retry_order_client(monkeypatch):
    class RetryClient:
        def __init__(self):
            self.saved = None
            self.inserts = 0
            self.notifications = []
            self.race = False
        def table(self, name):
            self.name = name
            self.operation = 'read'
            return self
        def select(self, *args): return self
        def eq(self, *args): return self
        def insert(self, payload):
            self.payload = payload
            self.operation = 'insert'
            return self
        def execute(self):
            if self.name == 'profiles': return SimpleNamespace(data=[{'role': 'supplier', 'is_approved': True}])
            if self.name == 'purchase_orders':
                if self.operation == 'insert':
                    self.inserts += 1
                    self.saved = dict(self.payload)
                    if self.race:
                        failure = Exception('Concurrent insert already committed')
                        failure.code = '23505'
                        raise failure
                return SimpleNamespace(data=[self.saved] if self.saved else [])
            return SimpleNamespace(data=[])
    client = RetryClient()
    monkeypatch.setattr(orders, 'client_for_token', lambda token: client)
    monkeypatch.setattr('core.access.project_member', lambda *args: True)
    monkeypatch.setattr(orders, 'create_notifications', lambda value: client.notifications.append(value))
    return client


def retry_order(**changes):
    return orders.PurchaseOrderCreate(**{
        'request_id': '10000000-0000-4000-8000-000000000001',
        'project_id': 'project-one', 'supplier_id': 'supplier-one', 'supplier_name': 'Supplier',
        'material_id': '20000000-0000-4000-8000-000000000002',
        'quantity_ordered': 3, 'unit_price': 12.5, 'expected_date': '2030-01-01', 'unit': 'bags', **changes,
    })


def test_uncertain_response_retry_returns_original_order_once(retry_order_client):
    client = retry_order_client
    user = {'id': 'admin-one', 'role': 'super_admin', 'token': 'jwt'}
    first = orders.create_purchase_order(retry_order(), user)
    client.saved['status'] = 'Delivered'
    client.saved['boq_item_id'] = 'inferred-boq-reference'
    # BOQ triggers can replace a catalog ID with its linked stock ID.
    client.saved['material_id'] = 'stock-row'
    replay = orders.create_purchase_order(retry_order(), user)
    assert replay['id'] == first['id']
    assert replay['status'] == 'Delivered'
    assert client.inserts == 1
    assert len(client.notifications) == 1


def test_concurrent_order_retry_recovers_unique_key_winner(retry_order_client):
    retry_order_client.race = True
    result = orders.create_purchase_order(retry_order(), {'id': 'admin-one', 'role': 'super_admin', 'token': 'jwt'})
    assert result['quantity_ordered'] == 3
    assert retry_order_client.inserts == 1
    assert not retry_order_client.notifications


@pytest.mark.parametrize('changes', [{'quantity_ordered': 4}, {'unit_price': 0}, {'unit': 'tonnes'}, {'supplier_id': 'other'}, {'material_id': '30000000-0000-4000-8000-000000000003'}])
def test_reusing_order_key_for_different_details_is_rejected(retry_order_client, changes):
    user = {'id': 'admin-one', 'role': 'super_admin', 'token': 'jwt'}
    orders.create_purchase_order(retry_order(), user)
    with pytest.raises(HTTPException) as error:
        orders.create_purchase_order(retry_order(**changes), user)
    assert error.value.status_code == 409
    assert retry_order_client.inserts == 1


def test_order_request_key_is_scoped_to_actor_and_project(retry_order_client):
    client = retry_order_client
    first = orders.create_purchase_order(retry_order(), {'id': 'admin-one', 'role': 'super_admin', 'token': 'jwt'})['id']
    client.saved = None
    second = orders.create_purchase_order(retry_order(), {'id': 'admin-two', 'role': 'super_admin', 'token': 'jwt'})['id']
    client.saved = None
    third = orders.create_purchase_order(retry_order(project_id='project-two'), {'id': 'admin-one', 'role': 'super_admin', 'token': 'jwt'})['id']
    assert len({first, second, third}) == 3


@pytest.mark.parametrize('changes', [{'quantity_ordered': 1e308, 'unit_price': 1e308}, {'supplier_name': ' '}, {'unit': ' '}])
def test_invalid_order_totals_and_blank_labels_fail_before_database(changes):
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        retry_order(**changes)

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


@pytest.mark.parametrize("operation,role,code", [("deliver","supplier","22P02"),("receive","super_admin","22P02"),("deliver","supplier","23502"),("receive","super_admin","42501")])
def test_transition_failure_never_falls_back_to_privileged_writes(monkeypatch, operation, role, code):
    class Failure(Exception):
        pass
    failure = Failure("Database rejected the transaction")
    failure.code = code
    client = Client({"supplier_id":"supplier-1","status":"Confirmed"})
    def fail(*args):
        raise failure
    client.rpc = fail
    monkeypatch.setattr(orders,"client_for_token",lambda token:client)
    monkeypatch.setattr(orders,"get_service_client",lambda:pytest.fail("Privileged fallback must never run"))
    with pytest.raises(HTTPException) as error:
        (orders.deliver_po if operation=="deliver" else orders.receive_po)("po-1",{"id":"supplier-1","role":role,"token":"jwt"})
    assert error.value.status_code == (403 if code=="42501" else 500)
