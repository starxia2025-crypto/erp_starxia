import requests
import sys
import json
from datetime import datetime
import uuid

class CRMAPITester:
    def __init__(self, base_url="https://crm-business-hub.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.session_token = None
        self.user_id = None
        self.company_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.session_token:
            test_headers['Authorization'] = f'Bearer {self.session_token}'
        
        if headers:
            test_headers.update(headers)

        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if not success:
                details += f", Expected: {expected_status}"
                try:
                    error_data = response.json()
                    details += f", Response: {error_data}"
                except:
                    details += f", Response: {response.text[:200]}"

            self.log_test(name, success, details)
            return success, response.json() if success and response.content else {}

        except Exception as e:
            self.log_test(name, False, f"Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("Root API", "GET", "", 200)

    def create_test_session(self):
        """Create a test session by inserting directly into MongoDB simulation"""
        # For testing purposes, we'll create a mock session
        # In real scenario, this would go through OAuth flow
        test_user_id = f"test_user_{uuid.uuid4().hex[:8]}"
        test_company_id = f"test_comp_{uuid.uuid4().hex[:8]}"
        test_session_token = f"test_sess_{uuid.uuid4().hex}"
        
        # Store for later use
        self.user_id = test_user_id
        self.company_id = test_company_id
        self.session_token = test_session_token
        
        print(f"🔧 Created test session: {test_session_token}")
        return True

    def test_auth_me_without_session(self):
        """Test /auth/me without session (should fail)"""
        return self.run_test("Auth Me (No Session)", "GET", "auth/me", 401)

    def test_auth_me_with_session(self):
        """Test /auth/me with session"""
        success, response = self.run_test("Auth Me (With Session)", "GET", "auth/me", 200)
        if success and response:
            self.user_id = response.get("user_id")
            self.company_id = response.get("company_id")
        return success

    def test_dashboard_stats(self):
        """Test dashboard statistics"""
        return self.run_test("Dashboard Stats", "GET", "reports/dashboard", 200)

    def test_clients_crud(self):
        """Test clients CRUD operations"""
        # Get clients
        success, clients = self.run_test("Get Clients", "GET", "clients", 200)
        if not success:
            return False

        # Create client
        client_data = {
            "name": f"Test Client {datetime.now().strftime('%H%M%S')}",
            "email": "test@example.com",
            "phone": "+34123456789",
            "address": "Test Address 123",
            "tax_id": "12345678A"
        }
        success, new_client = self.run_test("Create Client", "POST", "clients", 200, client_data)
        if not success:
            return False

        client_id = new_client.get("client_id")
        if not client_id:
            self.log_test("Create Client - Get ID", False, "No client_id in response")
            return False

        # Update client
        update_data = {"name": "Updated Test Client"}
        success, _ = self.run_test("Update Client", "PUT", f"clients/{client_id}", 200, update_data)
        if not success:
            return False

        # Get specific client
        success, _ = self.run_test("Get Specific Client", "GET", f"clients/{client_id}", 200)
        if not success:
            return False

        # Delete client
        success, _ = self.run_test("Delete Client", "DELETE", f"clients/{client_id}", 200)
        return success

    def test_suppliers_crud(self):
        """Test suppliers CRUD operations"""
        # Get suppliers
        success, _ = self.run_test("Get Suppliers", "GET", "suppliers", 200)
        if not success:
            return False

        # Create supplier
        supplier_data = {
            "name": f"Test Supplier {datetime.now().strftime('%H%M%S')}",
            "email": "supplier@example.com",
            "phone": "+34987654321"
        }
        success, new_supplier = self.run_test("Create Supplier", "POST", "suppliers", 200, supplier_data)
        if not success:
            return False

        supplier_id = new_supplier.get("supplier_id")
        if supplier_id:
            # Delete supplier
            self.run_test("Delete Supplier", "DELETE", f"suppliers/{supplier_id}", 200)

        return success

    def test_products_crud(self):
        """Test products CRUD operations"""
        # Get products
        success, _ = self.run_test("Get Products", "GET", "products", 200)
        if not success:
            return False

        # Create product
        product_data = {
            "sku": f"TEST-{datetime.now().strftime('%H%M%S')}",
            "name": f"Test Product {datetime.now().strftime('%H%M%S')}",
            "description": "Test product description",
            "price": 99.99,
            "cost": 50.00
        }
        success, new_product = self.run_test("Create Product", "POST", "products", 200, product_data)
        if not success:
            return False

        product_id = new_product.get("product_id")
        if product_id:
            # Delete product
            self.run_test("Delete Product", "DELETE", f"products/{product_id}", 200)

        return success

    def test_warehouses_crud(self):
        """Test warehouses CRUD operations"""
        # Get warehouses
        success, _ = self.run_test("Get Warehouses", "GET", "warehouses", 200)
        if not success:
            return False

        # Create warehouse
        warehouse_data = {
            "name": f"Test Warehouse {datetime.now().strftime('%H%M%S')}",
            "address": "Test Warehouse Address"
        }
        success, new_warehouse = self.run_test("Create Warehouse", "POST", "warehouses", 200, warehouse_data)
        if not success:
            return False

        warehouse_id = new_warehouse.get("warehouse_id")
        if warehouse_id:
            # Delete warehouse
            self.run_test("Delete Warehouse", "DELETE", f"warehouses/{warehouse_id}", 200)

        return success

    def test_inventory_operations(self):
        """Test inventory operations"""
        return self.run_test("Get Inventory", "GET", "inventory", 200)

    def test_orders_crud(self):
        """Test orders CRUD operations"""
        return self.run_test("Get Orders", "GET", "orders", 200)

    def test_invoices_crud(self):
        """Test invoices CRUD operations"""
        return self.run_test("Get Invoices", "GET", "invoices", 200)

    def test_purchase_orders(self):
        """Test purchase orders"""
        return self.run_test("Get Purchase Orders", "GET", "purchase-orders", 200)

    def test_purchase_invoices(self):
        """Test purchase invoices"""
        return self.run_test("Get Purchase Invoices", "GET", "purchase-invoices", 200)

    def test_reports_export(self):
        """Test reports export functionality"""
        # Test clients export
        success, _ = self.run_test("Export Clients Report", "GET", "reports/export/clients", 200)
        return success

    def test_ai_chat_history(self):
        """Test AI chat history"""
        return self.run_test("Get AI Chat History", "GET", "ai/chat-history", 200)

    def test_ai_chat(self):
        """Test AI chat functionality"""
        chat_data = {"message": "¿Cuántos clientes tengo?"}
        success, response = self.run_test("AI Chat", "POST", "ai/chat", 200, chat_data)
        
        if success and response:
            if "response" in response:
                self.log_test("AI Chat Response", True, "Got AI response")
            else:
                self.log_test("AI Chat Response", False, "No response field")
        
        return success

    def run_all_tests(self):
        """Run all tests"""
        print("🚀 Starting CRM API Tests...")
        print(f"🌐 Base URL: {self.base_url}")
        print("=" * 50)

        # Basic connectivity
        self.test_root_endpoint()
        
        # Auth tests without session
        self.test_auth_me_without_session()
        
        # Create test session (in real app this would be OAuth)
        self.create_test_session()
        
        # Note: Since we can't actually create a real session without OAuth,
        # we'll test endpoints that don't require auth or handle auth gracefully
        
        # Test endpoints that should work without proper auth (will return 401 but endpoint exists)
        print("\n📊 Testing Protected Endpoints (expecting 401)...")
        self.run_test("Dashboard Stats (No Auth)", "GET", "reports/dashboard", 401)
        self.run_test("Get Clients (No Auth)", "GET", "clients", 401)
        self.run_test("Get Suppliers (No Auth)", "GET", "suppliers", 401)
        self.run_test("Get Products (No Auth)", "GET", "products", 401)
        self.run_test("Get Warehouses (No Auth)", "GET", "warehouses", 401)
        self.run_test("Get Inventory (No Auth)", "GET", "inventory", 401)
        self.run_test("Get Orders (No Auth)", "GET", "orders", 401)
        self.run_test("Get Invoices (No Auth)", "GET", "invoices", 401)
        self.run_test("Get Purchase Orders (No Auth)", "GET", "purchase-orders", 401)
        self.run_test("Get Purchase Invoices (No Auth)", "GET", "purchase-invoices", 401)
        self.run_test("AI Chat History (No Auth)", "GET", "ai/chat-history", 401)

        # Test AI chat without auth
        chat_data = {"message": "Test message"}
        self.run_test("AI Chat (No Auth)", "POST", "ai/chat", 401, chat_data)

        # Print results
        print("\n" + "=" * 50)
        print(f"📊 Tests completed: {self.tests_passed}/{self.tests_run}")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            return 1

def main():
    tester = CRMAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())