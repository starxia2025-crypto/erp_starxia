from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, UploadFile, File
from fastapi.responses import RedirectResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import io
import csv
import pandas as pd

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Emergent LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "user"
    company_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Company(BaseModel):
    model_config = ConfigDict(extra="ignore")
    company_id: str = Field(default_factory=lambda: f"comp_{uuid.uuid4().hex[:12]}")
    name: str
    tax_id: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ClientType(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type_id: str = Field(default_factory=lambda: f"ct_{uuid.uuid4().hex[:12]}")
    name: str
    description: Optional[str] = None
    company_id: str

class Client(BaseModel):
    model_config = ConfigDict(extra="ignore")
    client_id: str = Field(default_factory=lambda: f"cli_{uuid.uuid4().hex[:12]}")
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None
    type_id: Optional[str] = None
    company_id: str
    balance: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SupplierType(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type_id: str = Field(default_factory=lambda: f"st_{uuid.uuid4().hex[:12]}")
    name: str
    description: Optional[str] = None
    company_id: str

class Supplier(BaseModel):
    model_config = ConfigDict(extra="ignore")
    supplier_id: str = Field(default_factory=lambda: f"sup_{uuid.uuid4().hex[:12]}")
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None
    type_id: Optional[str] = None
    company_id: str
    balance: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductType(BaseModel):
    model_config = ConfigDict(extra="ignore")
    type_id: str = Field(default_factory=lambda: f"pt_{uuid.uuid4().hex[:12]}")
    name: str
    description: Optional[str] = None
    company_id: str

class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    product_id: str = Field(default_factory=lambda: f"prod_{uuid.uuid4().hex[:12]}")
    sku: str
    name: str
    description: Optional[str] = None
    price: float = 0.0
    cost: float = 0.0
    type_id: Optional[str] = None
    company_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Warehouse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    warehouse_id: str = Field(default_factory=lambda: f"wh_{uuid.uuid4().hex[:12]}")
    name: str
    address: Optional[str] = None
    company_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Inventory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    inventory_id: str = Field(default_factory=lambda: f"inv_{uuid.uuid4().hex[:12]}")
    product_id: str
    warehouse_id: str
    quantity: int = 0
    min_stock: int = 0
    company_id: str
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class OrderItem(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    price: float
    total: float

class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    order_id: str = Field(default_factory=lambda: f"ord_{uuid.uuid4().hex[:12]}")
    order_number: str
    client_id: str
    client_name: str
    items: List[OrderItem] = []
    subtotal: float = 0.0
    tax: float = 0.0
    total: float = 0.0
    status: str = "pending"  # pending, confirmed, shipped, delivered, cancelled
    warehouse_id: Optional[str] = None
    company_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Invoice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    invoice_id: str = Field(default_factory=lambda: f"inv_{uuid.uuid4().hex[:12]}")
    invoice_number: str
    client_id: str
    client_name: str
    order_id: Optional[str] = None
    items: List[OrderItem] = []
    subtotal: float = 0.0
    tax: float = 0.0
    total: float = 0.0
    status: str = "pending"  # pending, paid, overdue, cancelled
    due_date: Optional[datetime] = None
    paid_date: Optional[datetime] = None
    company_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PurchaseOrder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    po_id: str = Field(default_factory=lambda: f"po_{uuid.uuid4().hex[:12]}")
    po_number: str
    supplier_id: str
    supplier_name: str
    items: List[OrderItem] = []
    subtotal: float = 0.0
    tax: float = 0.0
    total: float = 0.0
    status: str = "pending"  # pending, confirmed, received, cancelled
    warehouse_id: Optional[str] = None
    company_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PurchaseInvoice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    pinv_id: str = Field(default_factory=lambda: f"pinv_{uuid.uuid4().hex[:12]}")
    invoice_number: str
    supplier_id: str
    supplier_name: str
    po_id: Optional[str] = None
    items: List[OrderItem] = []
    subtotal: float = 0.0
    tax: float = 0.0
    total: float = 0.0
    status: str = "pending"  # pending, paid, overdue
    due_date: Optional[datetime] = None
    paid_date: Optional[datetime] = None
    company_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    message_id: str = Field(default_factory=lambda: f"msg_{uuid.uuid4().hex[:12]}")
    user_id: str
    company_id: str
    role: str  # user or assistant
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ==================== AUTH ====================

async def get_current_user(request: Request) -> dict:
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user

@api_router.get("/auth/session")
async def exchange_session(session_id: str, response: Response):
    async with httpx.AsyncClient() as client_http:
        res = await client_http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        if res.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")
        
        data = res.json()
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    existing_user = await db.users.find_one({"email": data["email"]}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data["name"], "picture": data.get("picture")}}
        )
    else:
        # Create default company for new user
        company_id = f"comp_{uuid.uuid4().hex[:12]}"
        company = {
            "company_id": company_id,
            "name": f"Empresa de {data['name']}",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.companies.insert_one(company)
        
        # Create user with company
        user = {
            "user_id": user_id,
            "email": data["email"],
            "name": data["name"],
            "picture": data.get("picture"),
            "role": "admin",
            "company_id": company_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user)
        
        # Create default warehouse
        warehouse = {
            "warehouse_id": f"wh_{uuid.uuid4().hex[:12]}",
            "name": "Almacén Principal",
            "company_id": company_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.warehouses.insert_one(warehouse)
    
    session_token = data.get("session_token", f"sess_{uuid.uuid4().hex}")
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7*24*60*60,
        path="/"
    )
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return user

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return user

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"message": "Logged out"}

# ==================== COMPANIES ====================

@api_router.get("/companies")
async def get_companies(request: Request):
    user = await get_current_user(request)
    companies = await db.companies.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(100)
    return companies

@api_router.put("/companies/{company_id}")
async def update_company(company_id: str, data: dict, request: Request):
    user = await get_current_user(request)
    if user["company_id"] != company_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.companies.update_one({"company_id": company_id}, {"$set": data})
    company = await db.companies.find_one({"company_id": company_id}, {"_id": 0})
    return company

# ==================== USERS ====================

@api_router.get("/users")
async def get_users(request: Request):
    user = await get_current_user(request)
    users = await db.users.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(100)
    return users

# ==================== CLIENT TYPES ====================

@api_router.get("/client-types")
async def get_client_types(request: Request):
    user = await get_current_user(request)
    types = await db.client_types.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(100)
    return types

@api_router.post("/client-types")
async def create_client_type(data: dict, request: Request):
    user = await get_current_user(request)
    client_type = ClientType(company_id=user["company_id"], **data)
    doc = client_type.model_dump()
    doc["created_at"] = doc.get("created_at", datetime.now(timezone.utc)).isoformat() if isinstance(doc.get("created_at"), datetime) else datetime.now(timezone.utc).isoformat()
    await db.client_types.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.delete("/client-types/{type_id}")
async def delete_client_type(type_id: str, request: Request):
    user = await get_current_user(request)
    await db.client_types.delete_one({"type_id": type_id, "company_id": user["company_id"]})
    return {"message": "Deleted"}

# ==================== CLIENTS ====================

@api_router.get("/clients")
async def get_clients(request: Request):
    user = await get_current_user(request)
    clients = await db.clients.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(1000)
    return clients

@api_router.get("/clients/{client_id}")
async def get_client(client_id: str, request: Request):
    user = await get_current_user(request)
    client = await db.clients.find_one({"client_id": client_id, "company_id": user["company_id"]}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client

@api_router.post("/clients")
async def create_client(data: dict, request: Request):
    user = await get_current_user(request)
    client = Client(company_id=user["company_id"], **data)
    doc = client.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.clients.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, data: dict, request: Request):
    user = await get_current_user(request)
    await db.clients.update_one(
        {"client_id": client_id, "company_id": user["company_id"]},
        {"$set": data}
    )
    client = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    return client

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, request: Request):
    user = await get_current_user(request)
    await db.clients.delete_one({"client_id": client_id, "company_id": user["company_id"]})
    return {"message": "Deleted"}

# ==================== SUPPLIER TYPES ====================

@api_router.get("/supplier-types")
async def get_supplier_types(request: Request):
    user = await get_current_user(request)
    types = await db.supplier_types.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(100)
    return types

@api_router.post("/supplier-types")
async def create_supplier_type(data: dict, request: Request):
    user = await get_current_user(request)
    supplier_type = SupplierType(company_id=user["company_id"], **data)
    doc = supplier_type.model_dump()
    await db.supplier_types.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.delete("/supplier-types/{type_id}")
async def delete_supplier_type(type_id: str, request: Request):
    user = await get_current_user(request)
    await db.supplier_types.delete_one({"type_id": type_id, "company_id": user["company_id"]})
    return {"message": "Deleted"}

# ==================== SUPPLIERS ====================

@api_router.get("/suppliers")
async def get_suppliers(request: Request):
    user = await get_current_user(request)
    suppliers = await db.suppliers.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(1000)
    return suppliers

@api_router.get("/suppliers/{supplier_id}")
async def get_supplier(supplier_id: str, request: Request):
    user = await get_current_user(request)
    supplier = await db.suppliers.find_one({"supplier_id": supplier_id, "company_id": user["company_id"]}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier

@api_router.post("/suppliers")
async def create_supplier(data: dict, request: Request):
    user = await get_current_user(request)
    supplier = Supplier(company_id=user["company_id"], **data)
    doc = supplier.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.suppliers.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, data: dict, request: Request):
    user = await get_current_user(request)
    await db.suppliers.update_one(
        {"supplier_id": supplier_id, "company_id": user["company_id"]},
        {"$set": data}
    )
    supplier = await db.suppliers.find_one({"supplier_id": supplier_id}, {"_id": 0})
    return supplier

@api_router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, request: Request):
    user = await get_current_user(request)
    await db.suppliers.delete_one({"supplier_id": supplier_id, "company_id": user["company_id"]})
    return {"message": "Deleted"}

# ==================== PRODUCT TYPES ====================

@api_router.get("/product-types")
async def get_product_types(request: Request):
    user = await get_current_user(request)
    types = await db.product_types.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(100)
    return types

@api_router.post("/product-types")
async def create_product_type(data: dict, request: Request):
    user = await get_current_user(request)
    product_type = ProductType(company_id=user["company_id"], **data)
    doc = product_type.model_dump()
    await db.product_types.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.delete("/product-types/{type_id}")
async def delete_product_type(type_id: str, request: Request):
    user = await get_current_user(request)
    await db.product_types.delete_one({"type_id": type_id, "company_id": user["company_id"]})
    return {"message": "Deleted"}

# ==================== PRODUCTS ====================

@api_router.get("/products")
async def get_products(request: Request):
    user = await get_current_user(request)
    products = await db.products.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(1000)
    return products

@api_router.get("/products/{product_id}")
async def get_product(product_id: str, request: Request):
    user = await get_current_user(request)
    product = await db.products.find_one({"product_id": product_id, "company_id": user["company_id"]}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@api_router.post("/products")
async def create_product(data: dict, request: Request):
    user = await get_current_user(request)
    product = Product(company_id=user["company_id"], **data)
    doc = product.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.products.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, data: dict, request: Request):
    user = await get_current_user(request)
    await db.products.update_one(
        {"product_id": product_id, "company_id": user["company_id"]},
        {"$set": data}
    )
    product = await db.products.find_one({"product_id": product_id}, {"_id": 0})
    return product

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, request: Request):
    user = await get_current_user(request)
    await db.products.delete_one({"product_id": product_id, "company_id": user["company_id"]})
    return {"message": "Deleted"}

@api_router.post("/products/import-csv")
async def import_products_csv(file: UploadFile = File(...), request: Request = None):
    user = await get_current_user(request)
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(decoded))
    
    imported = 0
    for row in reader:
        product = Product(
            company_id=user["company_id"],
            sku=row.get("sku", f"SKU-{uuid.uuid4().hex[:8]}"),
            name=row.get("name", ""),
            description=row.get("description", ""),
            price=float(row.get("price", 0)),
            cost=float(row.get("cost", 0))
        )
        doc = product.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        await db.products.insert_one(doc)
        imported += 1
    
    return {"message": f"Imported {imported} products"}

# ==================== WAREHOUSES ====================

@api_router.get("/warehouses")
async def get_warehouses(request: Request):
    user = await get_current_user(request)
    warehouses = await db.warehouses.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(100)
    return warehouses

@api_router.post("/warehouses")
async def create_warehouse(data: dict, request: Request):
    user = await get_current_user(request)
    warehouse = Warehouse(company_id=user["company_id"], **data)
    doc = warehouse.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.warehouses.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.put("/warehouses/{warehouse_id}")
async def update_warehouse(warehouse_id: str, data: dict, request: Request):
    user = await get_current_user(request)
    await db.warehouses.update_one(
        {"warehouse_id": warehouse_id, "company_id": user["company_id"]},
        {"$set": data}
    )
    warehouse = await db.warehouses.find_one({"warehouse_id": warehouse_id}, {"_id": 0})
    return warehouse

@api_router.delete("/warehouses/{warehouse_id}")
async def delete_warehouse(warehouse_id: str, request: Request):
    user = await get_current_user(request)
    await db.warehouses.delete_one({"warehouse_id": warehouse_id, "company_id": user["company_id"]})
    return {"message": "Deleted"}

# ==================== INVENTORY ====================

@api_router.get("/inventory")
async def get_inventory(request: Request, warehouse_id: Optional[str] = None):
    user = await get_current_user(request)
    query = {"company_id": user["company_id"]}
    if warehouse_id:
        query["warehouse_id"] = warehouse_id
    inventory = await db.inventory.find(query, {"_id": 0}).to_list(1000)
    return inventory

@api_router.post("/inventory")
async def create_inventory(data: dict, request: Request):
    user = await get_current_user(request)
    inv = Inventory(company_id=user["company_id"], **data)
    doc = inv.model_dump()
    doc["updated_at"] = doc["updated_at"].isoformat()
    
    existing = await db.inventory.find_one({
        "product_id": data["product_id"],
        "warehouse_id": data["warehouse_id"],
        "company_id": user["company_id"]
    })
    
    if existing:
        await db.inventory.update_one(
            {"inventory_id": existing["inventory_id"]},
            {"$set": {"quantity": data.get("quantity", 0), "min_stock": data.get("min_stock", 0), "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return await db.inventory.find_one({"inventory_id": existing["inventory_id"]}, {"_id": 0})
    
    await db.inventory.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.put("/inventory/{inventory_id}")
async def update_inventory(inventory_id: str, data: dict, request: Request):
    user = await get_current_user(request)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.inventory.update_one(
        {"inventory_id": inventory_id, "company_id": user["company_id"]},
        {"$set": data}
    )
    inv = await db.inventory.find_one({"inventory_id": inventory_id}, {"_id": 0})
    return inv

@api_router.post("/inventory/import-csv")
async def import_inventory_csv(file: UploadFile = File(...), warehouse_id: str = None, request: Request = None):
    user = await get_current_user(request)
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(decoded))
    
    if not warehouse_id:
        wh = await db.warehouses.find_one({"company_id": user["company_id"]}, {"_id": 0})
        warehouse_id = wh["warehouse_id"] if wh else None
    
    imported = 0
    for row in reader:
        product = await db.products.find_one({"sku": row.get("sku"), "company_id": user["company_id"]}, {"_id": 0})
        if not product:
            product = Product(
                company_id=user["company_id"],
                sku=row.get("sku", f"SKU-{uuid.uuid4().hex[:8]}"),
                name=row.get("name", row.get("sku", "")),
                price=float(row.get("price", 0)),
                cost=float(row.get("cost", 0))
            )
            doc = product.model_dump()
            doc["created_at"] = doc["created_at"].isoformat()
            await db.products.insert_one(doc)
            product = doc
        
        inv = Inventory(
            company_id=user["company_id"],
            product_id=product["product_id"],
            warehouse_id=warehouse_id,
            quantity=int(row.get("quantity", 0)),
            min_stock=int(row.get("min_stock", 0))
        )
        doc = inv.model_dump()
        doc["updated_at"] = doc["updated_at"].isoformat()
        
        existing = await db.inventory.find_one({
            "product_id": product["product_id"],
            "warehouse_id": warehouse_id
        })
        
        if existing:
            await db.inventory.update_one(
                {"inventory_id": existing["inventory_id"]},
                {"$set": {"quantity": int(row.get("quantity", 0)), "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        else:
            await db.inventory.insert_one(doc)
        imported += 1
    
    return {"message": f"Imported {imported} inventory items"}

# ==================== ORDERS ====================

async def generate_order_number(company_id: str):
    count = await db.orders.count_documents({"company_id": company_id})
    return f"PED-{str(count + 1).zfill(6)}"

@api_router.get("/orders")
async def get_orders(request: Request):
    user = await get_current_user(request)
    orders = await db.orders.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(1000)
    return orders

@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, request: Request):
    user = await get_current_user(request)
    order = await db.orders.find_one({"order_id": order_id, "company_id": user["company_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@api_router.post("/orders")
async def create_order(data: dict, request: Request):
    user = await get_current_user(request)
    order_number = await generate_order_number(user["company_id"])
    
    client = await db.clients.find_one({"client_id": data["client_id"]}, {"_id": 0})
    client_name = client["name"] if client else "Unknown"
    
    items = []
    subtotal = 0
    for item in data.get("items", []):
        product = await db.products.find_one({"product_id": item["product_id"]}, {"_id": 0})
        if product:
            total = item["quantity"] * item["price"]
            items.append(OrderItem(
                product_id=item["product_id"],
                product_name=product["name"],
                quantity=item["quantity"],
                price=item["price"],
                total=total
            ))
            subtotal += total
    
    tax = subtotal * 0.21
    total = subtotal + tax
    
    order = Order(
        company_id=user["company_id"],
        order_number=order_number,
        client_id=data["client_id"],
        client_name=client_name,
        items=[i.model_dump() for i in items],
        subtotal=subtotal,
        tax=tax,
        total=total,
        status=data.get("status", "pending"),
        warehouse_id=data.get("warehouse_id")
    )
    doc = order.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.orders.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.put("/orders/{order_id}")
async def update_order(order_id: str, data: dict, request: Request):
    user = await get_current_user(request)
    await db.orders.update_one(
        {"order_id": order_id, "company_id": user["company_id"]},
        {"$set": data}
    )
    order = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    return order

@api_router.delete("/orders/{order_id}")
async def delete_order(order_id: str, request: Request):
    user = await get_current_user(request)
    await db.orders.delete_one({"order_id": order_id, "company_id": user["company_id"]})
    return {"message": "Deleted"}

# ==================== INVOICES ====================

async def generate_invoice_number(company_id: str):
    count = await db.invoices.count_documents({"company_id": company_id})
    return f"FAC-{str(count + 1).zfill(6)}"

@api_router.get("/invoices")
async def get_invoices(request: Request):
    user = await get_current_user(request)
    invoices = await db.invoices.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(1000)
    return invoices

@api_router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, request: Request):
    user = await get_current_user(request)
    invoice = await db.invoices.find_one({"invoice_id": invoice_id, "company_id": user["company_id"]}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice

@api_router.post("/invoices")
async def create_invoice(data: dict, request: Request):
    user = await get_current_user(request)
    invoice_number = await generate_invoice_number(user["company_id"])
    
    client = await db.clients.find_one({"client_id": data["client_id"]}, {"_id": 0})
    client_name = client["name"] if client else "Unknown"
    
    items = []
    subtotal = 0
    for item in data.get("items", []):
        product = await db.products.find_one({"product_id": item["product_id"]}, {"_id": 0})
        if product:
            total = item["quantity"] * item["price"]
            items.append(OrderItem(
                product_id=item["product_id"],
                product_name=product["name"],
                quantity=item["quantity"],
                price=item["price"],
                total=total
            ))
            subtotal += total
    
    tax = subtotal * 0.21
    total = subtotal + tax
    
    due_date = None
    if data.get("due_date"):
        due_date = datetime.fromisoformat(data["due_date"]).isoformat()
    
    invoice = Invoice(
        company_id=user["company_id"],
        invoice_number=invoice_number,
        client_id=data["client_id"],
        client_name=client_name,
        order_id=data.get("order_id"),
        items=[i.model_dump() for i in items],
        subtotal=subtotal,
        tax=tax,
        total=total,
        status=data.get("status", "pending"),
        due_date=due_date
    )
    doc = invoice.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.invoices.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.put("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, data: dict, request: Request):
    user = await get_current_user(request)
    if data.get("status") == "paid" and not data.get("paid_date"):
        data["paid_date"] = datetime.now(timezone.utc).isoformat()
    await db.invoices.update_one(
        {"invoice_id": invoice_id, "company_id": user["company_id"]},
        {"$set": data}
    )
    invoice = await db.invoices.find_one({"invoice_id": invoice_id}, {"_id": 0})
    return invoice

@api_router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, request: Request):
    user = await get_current_user(request)
    await db.invoices.delete_one({"invoice_id": invoice_id, "company_id": user["company_id"]})
    return {"message": "Deleted"}

# ==================== PURCHASE ORDERS ====================

async def generate_po_number(company_id: str):
    count = await db.purchase_orders.count_documents({"company_id": company_id})
    return f"OC-{str(count + 1).zfill(6)}"

@api_router.get("/purchase-orders")
async def get_purchase_orders(request: Request):
    user = await get_current_user(request)
    pos = await db.purchase_orders.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(1000)
    return pos

@api_router.post("/purchase-orders")
async def create_purchase_order(data: dict, request: Request):
    user = await get_current_user(request)
    po_number = await generate_po_number(user["company_id"])
    
    supplier = await db.suppliers.find_one({"supplier_id": data["supplier_id"]}, {"_id": 0})
    supplier_name = supplier["name"] if supplier else "Unknown"
    
    items = []
    subtotal = 0
    for item in data.get("items", []):
        product = await db.products.find_one({"product_id": item["product_id"]}, {"_id": 0})
        if product:
            total = item["quantity"] * item["price"]
            items.append(OrderItem(
                product_id=item["product_id"],
                product_name=product["name"],
                quantity=item["quantity"],
                price=item["price"],
                total=total
            ))
            subtotal += total
    
    tax = subtotal * 0.21
    total = subtotal + tax
    
    po = PurchaseOrder(
        company_id=user["company_id"],
        po_number=po_number,
        supplier_id=data["supplier_id"],
        supplier_name=supplier_name,
        items=[i.model_dump() for i in items],
        subtotal=subtotal,
        tax=tax,
        total=total,
        status=data.get("status", "pending"),
        warehouse_id=data.get("warehouse_id")
    )
    doc = po.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.purchase_orders.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.put("/purchase-orders/{po_id}")
async def update_purchase_order(po_id: str, data: dict, request: Request):
    user = await get_current_user(request)
    await db.purchase_orders.update_one(
        {"po_id": po_id, "company_id": user["company_id"]},
        {"$set": data}
    )
    po = await db.purchase_orders.find_one({"po_id": po_id}, {"_id": 0})
    return po

@api_router.delete("/purchase-orders/{po_id}")
async def delete_purchase_order(po_id: str, request: Request):
    user = await get_current_user(request)
    await db.purchase_orders.delete_one({"po_id": po_id, "company_id": user["company_id"]})
    return {"message": "Deleted"}

# ==================== PURCHASE INVOICES ====================

async def generate_pinv_number(company_id: str):
    count = await db.purchase_invoices.count_documents({"company_id": company_id})
    return f"FC-{str(count + 1).zfill(6)}"

@api_router.get("/purchase-invoices")
async def get_purchase_invoices(request: Request):
    user = await get_current_user(request)
    pinvs = await db.purchase_invoices.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(1000)
    return pinvs

@api_router.post("/purchase-invoices")
async def create_purchase_invoice(data: dict, request: Request):
    user = await get_current_user(request)
    invoice_number = await generate_pinv_number(user["company_id"])
    
    supplier = await db.suppliers.find_one({"supplier_id": data["supplier_id"]}, {"_id": 0})
    supplier_name = supplier["name"] if supplier else "Unknown"
    
    items = []
    subtotal = 0
    for item in data.get("items", []):
        product = await db.products.find_one({"product_id": item["product_id"]}, {"_id": 0})
        if product:
            total = item["quantity"] * item["price"]
            items.append(OrderItem(
                product_id=item["product_id"],
                product_name=product["name"],
                quantity=item["quantity"],
                price=item["price"],
                total=total
            ))
            subtotal += total
    
    tax = subtotal * 0.21
    total = subtotal + tax
    
    due_date = None
    if data.get("due_date"):
        due_date = datetime.fromisoformat(data["due_date"]).isoformat()
    
    pinv = PurchaseInvoice(
        company_id=user["company_id"],
        invoice_number=invoice_number,
        supplier_id=data["supplier_id"],
        supplier_name=supplier_name,
        po_id=data.get("po_id"),
        items=[i.model_dump() for i in items],
        subtotal=subtotal,
        tax=tax,
        total=total,
        status=data.get("status", "pending"),
        due_date=due_date
    )
    doc = pinv.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.purchase_invoices.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api_router.put("/purchase-invoices/{pinv_id}")
async def update_purchase_invoice(pinv_id: str, data: dict, request: Request):
    user = await get_current_user(request)
    if data.get("status") == "paid" and not data.get("paid_date"):
        data["paid_date"] = datetime.now(timezone.utc).isoformat()
    await db.purchase_invoices.update_one(
        {"pinv_id": pinv_id, "company_id": user["company_id"]},
        {"$set": data}
    )
    pinv = await db.purchase_invoices.find_one({"pinv_id": pinv_id}, {"_id": 0})
    return pinv

@api_router.delete("/purchase-invoices/{pinv_id}")
async def delete_purchase_invoice(pinv_id: str, request: Request):
    user = await get_current_user(request)
    await db.purchase_invoices.delete_one({"pinv_id": pinv_id, "company_id": user["company_id"]})
    return {"message": "Deleted"}

# ==================== REPORTS ====================

@api_router.get("/reports/dashboard")
async def get_dashboard_stats(request: Request):
    user = await get_current_user(request)
    company_id = user["company_id"]
    
    clients_count = await db.clients.count_documents({"company_id": company_id})
    suppliers_count = await db.suppliers.count_documents({"company_id": company_id})
    products_count = await db.products.count_documents({"company_id": company_id})
    orders_count = await db.orders.count_documents({"company_id": company_id})
    
    invoices = await db.invoices.find({"company_id": company_id}, {"_id": 0}).to_list(1000)
    total_sales = sum(inv.get("total", 0) for inv in invoices)
    pending_invoices = sum(1 for inv in invoices if inv.get("status") == "pending")
    
    purchase_invoices = await db.purchase_invoices.find({"company_id": company_id}, {"_id": 0}).to_list(1000)
    total_purchases = sum(pinv.get("total", 0) for pinv in purchase_invoices)
    
    inventory = await db.inventory.find({"company_id": company_id}, {"_id": 0}).to_list(1000)
    low_stock_count = sum(1 for inv in inventory if inv.get("quantity", 0) <= inv.get("min_stock", 0))
    
    recent_orders = await db.orders.find({"company_id": company_id}, {"_id": 0}).sort("created_at", -1).to_list(5)
    recent_invoices = await db.invoices.find({"company_id": company_id}, {"_id": 0}).sort("created_at", -1).to_list(5)
    
    return {
        "clients_count": clients_count,
        "suppliers_count": suppliers_count,
        "products_count": products_count,
        "orders_count": orders_count,
        "total_sales": total_sales,
        "total_purchases": total_purchases,
        "pending_invoices": pending_invoices,
        "low_stock_count": low_stock_count,
        "recent_orders": recent_orders,
        "recent_invoices": recent_invoices
    }

@api_router.get("/reports/export/{report_type}")
async def export_report(report_type: str, request: Request):
    user = await get_current_user(request)
    company_id = user["company_id"]
    
    data = []
    filename = f"{report_type}.xlsx"
    
    if report_type == "clients":
        data = await db.clients.find({"company_id": company_id}, {"_id": 0}).to_list(10000)
    elif report_type == "suppliers":
        data = await db.suppliers.find({"company_id": company_id}, {"_id": 0}).to_list(10000)
    elif report_type == "products":
        data = await db.products.find({"company_id": company_id}, {"_id": 0}).to_list(10000)
    elif report_type == "inventory":
        data = await db.inventory.find({"company_id": company_id}, {"_id": 0}).to_list(10000)
    elif report_type == "orders":
        data = await db.orders.find({"company_id": company_id}, {"_id": 0}).to_list(10000)
    elif report_type == "invoices":
        data = await db.invoices.find({"company_id": company_id}, {"_id": 0}).to_list(10000)
    elif report_type == "purchase-orders":
        data = await db.purchase_orders.find({"company_id": company_id}, {"_id": 0}).to_list(10000)
    elif report_type == "purchase-invoices":
        data = await db.purchase_invoices.find({"company_id": company_id}, {"_id": 0}).to_list(10000)
    else:
        raise HTTPException(status_code=400, detail="Invalid report type")
    
    if not data:
        raise HTTPException(status_code=404, detail="No data to export")
    
    df = pd.DataFrame(data)
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name=report_type)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ==================== AI ASSISTANT ====================

@api_router.get("/ai/chat-history")
async def get_chat_history(request: Request):
    user = await get_current_user(request)
    messages = await db.chat_messages.find(
        {"user_id": user["user_id"], "company_id": user["company_id"]},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    return messages

@api_router.post("/ai/chat")
async def chat_with_ai(data: dict, request: Request):
    user = await get_current_user(request)
    user_message = data.get("message", "")
    
    # Save user message
    user_msg = ChatMessage(
        user_id=user["user_id"],
        company_id=user["company_id"],
        role="user",
        content=user_message
    )
    user_doc = user_msg.model_dump()
    user_doc["created_at"] = user_doc["created_at"].isoformat()
    await db.chat_messages.insert_one(user_doc)
    
    # Get context from database
    clients = await db.clients.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(100)
    suppliers = await db.suppliers.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(100)
    products = await db.products.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(100)
    invoices = await db.invoices.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(50)
    orders = await db.orders.find({"company_id": user["company_id"]}, {"_id": 0}).to_list(50)
    
    context = f"""
Eres un asistente de IA para un sistema CRM. Tienes acceso a los siguientes datos de la empresa:

CLIENTES ({len(clients)} total):
{[{'nombre': c['name'], 'email': c.get('email'), 'id': c['client_id']} for c in clients[:20]]}

PROVEEDORES ({len(suppliers)} total):
{[{'nombre': s['name'], 'email': s.get('email'), 'id': s['supplier_id']} for s in suppliers[:20]]}

PRODUCTOS ({len(products)} total):
{[{'nombre': p['name'], 'sku': p['sku'], 'precio': p['price'], 'id': p['product_id']} for p in products[:20]]}

FACTURAS RECIENTES ({len(invoices)} total):
{[{'numero': i['invoice_number'], 'cliente': i['client_name'], 'total': i['total'], 'estado': i['status']} for i in invoices[:10]]}

PEDIDOS RECIENTES ({len(orders)} total):
{[{'numero': o['order_number'], 'cliente': o['client_name'], 'total': o['total'], 'estado': o['status']} for o in orders[:10]]}

Puedes ayudar al usuario a:
- Buscar clientes, proveedores, productos, facturas
- Crear nuevos registros (proporciona los datos en formato JSON)
- Consultar información del sistema
- Dar recomendaciones de negocio

Responde siempre en español y de forma concisa.
"""
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"crm_{user['user_id']}",
            system_message=context
        )
        chat.with_model("openai", "gpt-5.2")
        
        response = await chat.send_message(UserMessage(text=user_message))
        
        # Save assistant message
        assistant_msg = ChatMessage(
            user_id=user["user_id"],
            company_id=user["company_id"],
            role="assistant",
            content=response
        )
        assistant_doc = assistant_msg.model_dump()
        assistant_doc["created_at"] = assistant_doc["created_at"].isoformat()
        await db.chat_messages.insert_one(assistant_doc)
        
        return {"response": response, "message_id": assistant_doc["message_id"]}
    
    except Exception as e:
        logger.error(f"AI chat error: {str(e)}")
        error_response = "Lo siento, hubo un error al procesar tu mensaje. Por favor intenta de nuevo."
        return {"response": error_response, "error": str(e)}

@api_router.delete("/ai/chat-history")
async def clear_chat_history(request: Request):
    user = await get_current_user(request)
    await db.chat_messages.delete_many({"user_id": user["user_id"], "company_id": user["company_id"]})
    return {"message": "Chat history cleared"}

# ==================== ROOT ====================

@api_router.get("/")
async def root():
    return {"message": "CRM API Running"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
