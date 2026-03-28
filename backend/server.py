import csv
import io
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
 
import pandas as pd
from dotenv import load_dotenv
from fastapi import Cookie, Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import StreamingResponse
from jose import JWTError, jwt
from openai import AsyncOpenAI
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import JSON, DateTime, Float, Integer, MetaData, String, Text, UniqueConstraint, create_engine, text
from sqlalchemy.orm import Session, declarative_base, mapped_column, sessionmaker
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

DATABASE_URL = os.environ["DATABASE_URL"]
JWT_SECRET = os.environ["JWT_SECRET"]
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5-mini")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "lax").lower()
ACCESS_TOKEN_EXPIRE_DAYS = int(os.environ.get("ACCESS_TOKEN_EXPIRE_DAYS", "7"))

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True, connect_args=connect_args)
PublicSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
TenantSessionLocal = sessionmaker(autocommit=False, autoflush=False, future=True)
PublicBase = declarative_base()
TenantBase = declarative_base(metadata=MetaData(schema="tenant"))
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


class TimestampMixin:
    created_at = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class UpdatedTimestampMixin:
    updated_at = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class CompanyModel(PublicBase, TimestampMixin):
    __tablename__ = "companies"

    company_id = mapped_column(String(32), primary_key=True)
    schema_name = mapped_column(String(63), unique=True, nullable=False, index=True)
    name = mapped_column(String(255), nullable=False)
    tax_id = mapped_column(String(64))
    address = mapped_column(Text)
    phone = mapped_column(String(64))
    email = mapped_column(String(255))


class UserModel(PublicBase, TimestampMixin):
    __tablename__ = "users"

    user_id = mapped_column(String(32), primary_key=True)
    email = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash = mapped_column(String(255), nullable=False)
    name = mapped_column(String(255), nullable=False)
    picture = mapped_column(Text)
    role = mapped_column(String(32), default="user", nullable=False)
    company_id = mapped_column(String(32), nullable=False, index=True)


class ClientTypeModel(TenantBase):
    __tablename__ = "client_types"

    type_id = mapped_column(String(32), primary_key=True)
    name = mapped_column(String(255), nullable=False)
    description = mapped_column(Text)
    company_id = mapped_column(String(32), nullable=False, index=True)


class ClientModel(TenantBase, TimestampMixin):
    __tablename__ = "clients"

    client_id = mapped_column(String(32), primary_key=True)
    name = mapped_column(String(255), nullable=False)
    email = mapped_column(String(255))
    phone = mapped_column(String(64))
    address = mapped_column(Text)
    tax_id = mapped_column(String(64))
    type_id = mapped_column(String(32))
    company_id = mapped_column(String(32), nullable=False, index=True)
    balance = mapped_column(Float, default=0.0, nullable=False)


class SupplierTypeModel(TenantBase):
    __tablename__ = "supplier_types"

    type_id = mapped_column(String(32), primary_key=True)
    name = mapped_column(String(255), nullable=False)
    description = mapped_column(Text)
    company_id = mapped_column(String(32), nullable=False, index=True)


class SupplierModel(TenantBase, TimestampMixin):
    __tablename__ = "suppliers"

    supplier_id = mapped_column(String(32), primary_key=True)
    name = mapped_column(String(255), nullable=False)
    email = mapped_column(String(255))
    phone = mapped_column(String(64))
    address = mapped_column(Text)
    tax_id = mapped_column(String(64))
    type_id = mapped_column(String(32))
    company_id = mapped_column(String(32), nullable=False, index=True)
    balance = mapped_column(Float, default=0.0, nullable=False)


class ProductTypeModel(TenantBase):
    __tablename__ = "product_types"

    type_id = mapped_column(String(32), primary_key=True)
    name = mapped_column(String(255), nullable=False)
    description = mapped_column(Text)
    company_id = mapped_column(String(32), nullable=False, index=True)


class ProductModel(TenantBase, TimestampMixin):
    __tablename__ = "products"

    product_id = mapped_column(String(32), primary_key=True)
    sku = mapped_column(String(128), nullable=False)
    name = mapped_column(String(255), nullable=False)
    description = mapped_column(Text)
    price = mapped_column(Float, default=0.0, nullable=False)
    cost = mapped_column(Float, default=0.0, nullable=False)
    type_id = mapped_column(String(32))
    company_id = mapped_column(String(32), nullable=False, index=True)


class WarehouseModel(TenantBase, TimestampMixin):
    __tablename__ = "warehouses"

    warehouse_id = mapped_column(String(32), primary_key=True)
    name = mapped_column(String(255), nullable=False)
    address = mapped_column(Text)
    company_id = mapped_column(String(32), nullable=False, index=True)


class InventoryModel(TenantBase, UpdatedTimestampMixin):
    __tablename__ = "inventory"
    __table_args__ = (UniqueConstraint("company_id", "product_id", "warehouse_id", name="uq_inventory_scope"),)

    inventory_id = mapped_column(String(32), primary_key=True)
    product_id = mapped_column(String(32), nullable=False, index=True)
    warehouse_id = mapped_column(String(32), nullable=False, index=True)
    quantity = mapped_column(Integer, default=0, nullable=False)
    min_stock = mapped_column(Integer, default=0, nullable=False)
    company_id = mapped_column(String(32), nullable=False, index=True)


class OrderModel(TenantBase, TimestampMixin):
    __tablename__ = "orders"

    order_id = mapped_column(String(32), primary_key=True)
    order_number = mapped_column(String(64), nullable=False)
    client_id = mapped_column(String(32), nullable=False)
    client_name = mapped_column(String(255), nullable=False)
    items = mapped_column(JSON, default=list, nullable=False)
    subtotal = mapped_column(Float, default=0.0, nullable=False)
    tax = mapped_column(Float, default=0.0, nullable=False)
    total = mapped_column(Float, default=0.0, nullable=False)
    status = mapped_column(String(32), default="pending", nullable=False)
    warehouse_id = mapped_column(String(32))
    company_id = mapped_column(String(32), nullable=False, index=True)


class InvoiceModel(TenantBase, TimestampMixin):
    __tablename__ = "invoices"

    invoice_id = mapped_column(String(32), primary_key=True)
    invoice_number = mapped_column(String(64), nullable=False)
    client_id = mapped_column(String(32), nullable=False)
    client_name = mapped_column(String(255), nullable=False)
    order_id = mapped_column(String(32))
    items = mapped_column(JSON, default=list, nullable=False)
    subtotal = mapped_column(Float, default=0.0, nullable=False)
    tax = mapped_column(Float, default=0.0, nullable=False)
    total = mapped_column(Float, default=0.0, nullable=False)
    status = mapped_column(String(32), default="pending", nullable=False)
    due_date = mapped_column(DateTime(timezone=True))
    paid_date = mapped_column(DateTime(timezone=True))
    company_id = mapped_column(String(32), nullable=False, index=True)


class PurchaseOrderModel(TenantBase, TimestampMixin):
    __tablename__ = "purchase_orders"

    po_id = mapped_column(String(32), primary_key=True)
    po_number = mapped_column(String(64), nullable=False)
    supplier_id = mapped_column(String(32), nullable=False)
    supplier_name = mapped_column(String(255), nullable=False)
    items = mapped_column(JSON, default=list, nullable=False)
    subtotal = mapped_column(Float, default=0.0, nullable=False)
    tax = mapped_column(Float, default=0.0, nullable=False)
    total = mapped_column(Float, default=0.0, nullable=False)
    status = mapped_column(String(32), default="pending", nullable=False)
    warehouse_id = mapped_column(String(32))
    company_id = mapped_column(String(32), nullable=False, index=True)


class PurchaseInvoiceModel(TenantBase, TimestampMixin):
    __tablename__ = "purchase_invoices"

    pinv_id = mapped_column(String(32), primary_key=True)
    invoice_number = mapped_column(String(64), nullable=False)
    supplier_id = mapped_column(String(32), nullable=False)
    supplier_name = mapped_column(String(255), nullable=False)
    po_id = mapped_column(String(32))
    items = mapped_column(JSON, default=list, nullable=False)
    subtotal = mapped_column(Float, default=0.0, nullable=False)
    tax = mapped_column(Float, default=0.0, nullable=False)
    total = mapped_column(Float, default=0.0, nullable=False)
    status = mapped_column(String(32), default="pending", nullable=False)
    due_date = mapped_column(DateTime(timezone=True))
    paid_date = mapped_column(DateTime(timezone=True))
    company_id = mapped_column(String(32), nullable=False, index=True)


class ChatMessageModel(TenantBase, TimestampMixin):
    __tablename__ = "chat_messages"

    message_id = mapped_column(String(32), primary_key=True)
    user_id = mapped_column(String(32), nullable=False, index=True)
    company_id = mapped_column(String(32), nullable=False, index=True)
    role = mapped_column(String(32), nullable=False)
    content = mapped_column(Text, nullable=False)


class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)
    company_name: str


class LoginInput(BaseModel):
    email: EmailStr
    password: str


app = FastAPI(title="Starxia ERP API")


def get_public_db():
    db = PublicSessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tenant_bind(schema_name: str):
    return engine.execution_options(schema_translate_map={"tenant": schema_name})


def prefixed_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def serialize_datetime(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def model_to_dict(instance: Any, exclude: Optional[set[str]] = None) -> Dict[str, Any]:
    exclude = exclude or set()
    data: Dict[str, Any] = {}
    for column in instance.__table__.columns:
        if column.name in exclude:
            continue
        value = getattr(instance, column.name)
        data[column.name] = serialize_datetime(value) if isinstance(value, datetime) else value
    return data


def parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def slugify_schema_name(company_name: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", company_name.lower()).strip("_")
    normalized = normalized or "tenant"
    return f"tenant_{normalized[:30]}_{uuid.uuid4().hex[:8]}"


def ensure_schema_exists(schema_name: str) -> None:
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", schema_name):
        raise ValueError("Invalid schema name")
    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"'))
        tenant_bind = connection.execution_options(schema_translate_map={"tenant": schema_name})
        TenantBase.metadata.create_all(bind=tenant_bind)


def create_access_token(user: UserModel) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user.user_id,
        "company_id": user.company_id,
        "company_schema": getattr(user, "company_schema", None),
        "exp": expires_at,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=ACCESS_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )


def get_token_from_request(request: Request, session_token: Optional[str]) -> str:
    token = session_token or request.cookies.get("session_token")
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token


def get_current_user(
    request: Request,
    db: Session = Depends(get_public_db),
    session_token: Optional[str] = Cookie(default=None),
) -> UserModel:
    token = get_token_from_request(request, session_token)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid session") from exc

    user = db.query(UserModel).filter(UserModel.user_id == payload.get("sub")).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    company = db.query(CompanyModel).filter(CompanyModel.company_id == user.company_id).first()
    if not company:
        raise HTTPException(status_code=401, detail="Company not found")
    setattr(user, "company_schema", company.schema_name)
    return user


def get_db(user: UserModel = Depends(get_current_user)):
    db = TenantSessionLocal(bind=get_tenant_bind(user.company_schema))
    try:
        yield db
    finally:
        db.close()


def ensure_company_scope(user: UserModel, company_id: str) -> None:
    if user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Not authorized")


def generate_sequence(prefix: str, table: Any, company_id: str, db: Session) -> str:
    count = db.query(table).filter(table.company_id == company_id).count()
    return f"{prefix}-{str(count + 1).zfill(6)}"


def company_filter(query, model, user: UserModel):
    return query.filter(model.company_id == user.company_id)


def first_or_404(query, detail: str):
    instance = query.first()
    if not instance:
        raise HTTPException(status_code=404, detail=detail)
    return instance


def build_line_items(raw_items: List[Dict[str, Any]], products_by_id: Dict[str, ProductModel]) -> tuple[List[Dict[str, Any]], float]:
    items: List[Dict[str, Any]] = []
    subtotal = 0.0
    for raw_item in raw_items:
        product = products_by_id.get(raw_item["product_id"])
        if not product:
            continue
        quantity = int(raw_item.get("quantity", 0))
        price = float(raw_item.get("price", product.price or 0))
        total = quantity * price
        items.append(
            {
                "product_id": product.product_id,
                "product_name": product.name,
                "quantity": quantity,
                "price": price,
                "total": total,
            }
        )
        subtotal += total
    return items, subtotal


def lookup_products(db: Session, user: UserModel, raw_items: List[Dict[str, Any]]) -> Dict[str, ProductModel]:
    product_ids = [item["product_id"] for item in raw_items if item.get("product_id")]
    if not product_ids:
        return {}
    products = company_filter(db.query(ProductModel), ProductModel, user).filter(ProductModel.product_id.in_(product_ids)).all()
    return {product.product_id: product for product in products}


async def generate_ai_response(context: str, user_message: str) -> str:
    if not openai_client:
        raise RuntimeError("OPENAI_API_KEY is not configured")

    response = await openai_client.responses.create(
        model=OPENAI_MODEL,
        input=[
            {"role": "system", "content": [{"type": "input_text", "text": context}]},
            {"role": "user", "content": [{"type": "input_text", "text": user_message}]},
        ],
    )
    return response.output_text


@app.on_event("startup")
def startup() -> None:
    PublicBase.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/register")
def register(data: RegisterInput, response: Response, db: Session = Depends(get_public_db)) -> Dict[str, Any]:
    existing = db.query(UserModel).filter(UserModel.email == data.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    schema_name = slugify_schema_name(data.company_name)
    ensure_schema_exists(schema_name)

    company = CompanyModel(company_id=prefixed_id("comp"), schema_name=schema_name, name=data.company_name.strip())
    user = UserModel(
        user_id=prefixed_id("user"),
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        name=data.name.strip(),
        role="admin",
        company_id=company.company_id,
    )
    db.add(company)
    db.add(user)
    db.commit()
    db.refresh(user)
    setattr(user, "company_schema", schema_name)

    tenant_db = TenantSessionLocal(bind=get_tenant_bind(schema_name))
    try:
        warehouse = WarehouseModel(
            warehouse_id=prefixed_id("wh"),
            name="Almacen Principal",
            company_id=company.company_id,
        )
        tenant_db.add(warehouse)
        tenant_db.commit()
    finally:
        tenant_db.close()

    set_auth_cookie(response, create_access_token(user))
    return model_to_dict(user, exclude={"password_hash"})


@app.post("/api/auth/login")
def login(data: LoginInput, response: Response, db: Session = Depends(get_public_db)) -> Dict[str, Any]:
    user = db.query(UserModel).filter(UserModel.email == data.email.lower()).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    company = db.query(CompanyModel).filter(CompanyModel.company_id == user.company_id).first()
    if not company:
        raise HTTPException(status_code=401, detail="Company not found")
    setattr(user, "company_schema", company.schema_name)

    set_auth_cookie(response, create_access_token(user))
    return model_to_dict(user, exclude={"password_hash"})


@app.get("/api/auth/me")
def get_me(user: UserModel = Depends(get_current_user)) -> Dict[str, Any]:
    return model_to_dict(user, exclude={"password_hash"})


@app.post("/api/auth/logout")
def logout(response: Response) -> Dict[str, str]:
    response.delete_cookie("session_token", path="/")
    return {"message": "Logged out"}


@app.get("/api/companies")
def get_companies(user: UserModel = Depends(get_current_user), db: Session = Depends(get_public_db)) -> List[Dict[str, Any]]:
    companies = db.query(CompanyModel).filter(CompanyModel.company_id == user.company_id).all()
    return [model_to_dict(company) for company in companies]


@app.put("/api/companies/{company_id}")
def update_company(
    company_id: str,
    data: Dict[str, Any],
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_public_db),
) -> Dict[str, Any]:
    ensure_company_scope(user, company_id)
    company = first_or_404(db.query(CompanyModel).filter(CompanyModel.company_id == company_id), "Company not found")
    for field in ["name", "tax_id", "address", "phone", "email"]:
        if field in data:
            setattr(company, field, data[field])
    db.commit()
    db.refresh(company)
    return model_to_dict(company)


@app.get("/api/users")
def get_users(user: UserModel = Depends(get_current_user), db: Session = Depends(get_public_db)) -> List[Dict[str, Any]]:
    users = db.query(UserModel).filter(UserModel.company_id == user.company_id).all()
    return [model_to_dict(item, exclude={"password_hash"}) for item in users]


def scoped_list(model, user: UserModel, db: Session) -> List[Dict[str, Any]]:
    return [model_to_dict(item) for item in company_filter(db.query(model), model, user).all()]


@app.get("/api/client-types")
def get_client_types(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    return scoped_list(ClientTypeModel, user, db)


@app.post("/api/client-types")
def create_client_type(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = ClientTypeModel(type_id=prefixed_id("ct"), name=data["name"], description=data.get("description"), company_id=user.company_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/client-types/{type_id}")
def delete_client_type(type_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    company_filter(db.query(ClientTypeModel), ClientTypeModel, user).filter(ClientTypeModel.type_id == type_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/clients")
def get_clients(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    return scoped_list(ClientModel, user, db)


@app.get("/api/clients/{client_id}")
def get_client(client_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = first_or_404(company_filter(db.query(ClientModel), ClientModel, user).filter(ClientModel.client_id == client_id), "Client not found")
    return model_to_dict(item)


@app.post("/api/clients")
def create_client(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = ClientModel(
        client_id=prefixed_id("cli"),
        name=data["name"],
        email=data.get("email"),
        phone=data.get("phone"),
        address=data.get("address"),
        tax_id=data.get("tax_id"),
        type_id=data.get("type_id"),
        balance=float(data.get("balance", 0) or 0),
        company_id=user.company_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.put("/api/clients/{client_id}")
def update_client(client_id: str, data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = first_or_404(company_filter(db.query(ClientModel), ClientModel, user).filter(ClientModel.client_id == client_id), "Client not found")
    for field in ["name", "email", "phone", "address", "tax_id", "type_id", "balance"]:
        if field in data:
            setattr(item, field, data[field])
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/clients/{client_id}")
def delete_client(client_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    company_filter(db.query(ClientModel), ClientModel, user).filter(ClientModel.client_id == client_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/supplier-types")
def get_supplier_types(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    return scoped_list(SupplierTypeModel, user, db)


@app.post("/api/supplier-types")
def create_supplier_type(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = SupplierTypeModel(type_id=prefixed_id("st"), name=data["name"], description=data.get("description"), company_id=user.company_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/supplier-types/{type_id}")
def delete_supplier_type(type_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    company_filter(db.query(SupplierTypeModel), SupplierTypeModel, user).filter(SupplierTypeModel.type_id == type_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/suppliers")
def get_suppliers(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    return scoped_list(SupplierModel, user, db)


@app.get("/api/suppliers/{supplier_id}")
def get_supplier(supplier_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = first_or_404(company_filter(db.query(SupplierModel), SupplierModel, user).filter(SupplierModel.supplier_id == supplier_id), "Supplier not found")
    return model_to_dict(item)


@app.post("/api/suppliers")
def create_supplier(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = SupplierModel(
        supplier_id=prefixed_id("sup"),
        name=data["name"],
        email=data.get("email"),
        phone=data.get("phone"),
        address=data.get("address"),
        tax_id=data.get("tax_id"),
        type_id=data.get("type_id"),
        balance=float(data.get("balance", 0) or 0),
        company_id=user.company_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.put("/api/suppliers/{supplier_id}")
def update_supplier(supplier_id: str, data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = first_or_404(company_filter(db.query(SupplierModel), SupplierModel, user).filter(SupplierModel.supplier_id == supplier_id), "Supplier not found")
    for field in ["name", "email", "phone", "address", "tax_id", "type_id", "balance"]:
        if field in data:
            setattr(item, field, data[field])
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/suppliers/{supplier_id}")
def delete_supplier(supplier_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    company_filter(db.query(SupplierModel), SupplierModel, user).filter(SupplierModel.supplier_id == supplier_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/product-types")
def get_product_types(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    return scoped_list(ProductTypeModel, user, db)


@app.post("/api/product-types")
def create_product_type(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = ProductTypeModel(type_id=prefixed_id("pt"), name=data["name"], description=data.get("description"), company_id=user.company_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/product-types/{type_id}")
def delete_product_type(type_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    company_filter(db.query(ProductTypeModel), ProductTypeModel, user).filter(ProductTypeModel.type_id == type_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/products")
def get_products(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    return scoped_list(ProductModel, user, db)


@app.get("/api/products/{product_id}")
def get_product(product_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = first_or_404(company_filter(db.query(ProductModel), ProductModel, user).filter(ProductModel.product_id == product_id), "Product not found")
    return model_to_dict(item)


@app.post("/api/products")
def create_product(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = ProductModel(
        product_id=prefixed_id("prod"),
        sku=data["sku"],
        name=data["name"],
        description=data.get("description"),
        price=float(data.get("price", 0) or 0),
        cost=float(data.get("cost", 0) or 0),
        type_id=data.get("type_id"),
        company_id=user.company_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.put("/api/products/{product_id}")
def update_product(product_id: str, data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = first_or_404(company_filter(db.query(ProductModel), ProductModel, user).filter(ProductModel.product_id == product_id), "Product not found")
    for field in ["sku", "name", "description", "price", "cost", "type_id"]:
        if field in data:
            setattr(item, field, data[field])
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/products/{product_id}")
def delete_product(product_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    company_filter(db.query(ProductModel), ProductModel, user).filter(ProductModel.product_id == product_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.post("/api/products/import-csv")
async def import_products_csv(file: UploadFile = File(...), user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    content = (await file.read()).decode("utf-8")
    reader = csv.DictReader(io.StringIO(content))
    imported = 0
    for row in reader:
        db.add(
            ProductModel(
                product_id=prefixed_id("prod"),
                sku=row.get("sku") or f"SKU-{uuid.uuid4().hex[:8]}",
                name=row.get("name", ""),
                description=row.get("description"),
                price=float(row.get("price", 0) or 0),
                cost=float(row.get("cost", 0) or 0),
                company_id=user.company_id,
            )
        )
        imported += 1
    db.commit()
    return {"message": f"Imported {imported} products"}


@app.get("/api/warehouses")
def get_warehouses(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    return scoped_list(WarehouseModel, user, db)


@app.post("/api/warehouses")
def create_warehouse(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = WarehouseModel(warehouse_id=prefixed_id("wh"), name=data["name"], address=data.get("address"), company_id=user.company_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.put("/api/warehouses/{warehouse_id}")
def update_warehouse(warehouse_id: str, data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = first_or_404(company_filter(db.query(WarehouseModel), WarehouseModel, user).filter(WarehouseModel.warehouse_id == warehouse_id), "Warehouse not found")
    for field in ["name", "address"]:
        if field in data:
            setattr(item, field, data[field])
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/warehouses/{warehouse_id}")
def delete_warehouse(warehouse_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    company_filter(db.query(WarehouseModel), WarehouseModel, user).filter(WarehouseModel.warehouse_id == warehouse_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/inventory")
def get_inventory(warehouse_id: Optional[str] = None, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    query = company_filter(db.query(InventoryModel), InventoryModel, user)
    if warehouse_id:
        query = query.filter(InventoryModel.warehouse_id == warehouse_id)
    return [model_to_dict(item) for item in query.all()]


@app.post("/api/inventory")
def create_inventory(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    existing = company_filter(db.query(InventoryModel), InventoryModel, user).filter(
        InventoryModel.product_id == data["product_id"],
        InventoryModel.warehouse_id == data["warehouse_id"],
    ).first()
    if existing:
        existing.quantity = int(data.get("quantity", 0) or 0)
        existing.min_stock = int(data.get("min_stock", 0) or 0)
        existing.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return model_to_dict(existing)

    item = InventoryModel(
        inventory_id=prefixed_id("inv"),
        product_id=data["product_id"],
        warehouse_id=data["warehouse_id"],
        quantity=int(data.get("quantity", 0) or 0),
        min_stock=int(data.get("min_stock", 0) or 0),
        company_id=user.company_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.put("/api/inventory/{inventory_id}")
def update_inventory(inventory_id: str, data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = first_or_404(company_filter(db.query(InventoryModel), InventoryModel, user).filter(InventoryModel.inventory_id == inventory_id), "Inventory not found")
    for field in ["product_id", "warehouse_id", "quantity", "min_stock"]:
        if field in data:
            setattr(item, field, data[field])
    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.post("/api/inventory/import-csv")
async def import_inventory_csv(
    warehouse_id: Optional[str] = None,
    file: UploadFile = File(...),
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    if not warehouse_id:
        default_warehouse = company_filter(db.query(WarehouseModel), WarehouseModel, user).first()
        warehouse_id = default_warehouse.warehouse_id if default_warehouse else None
    if not warehouse_id:
        raise HTTPException(status_code=400, detail="No warehouse available")

    content = (await file.read()).decode("utf-8")
    reader = csv.DictReader(io.StringIO(content))
    imported = 0
    for row in reader:
        product = company_filter(db.query(ProductModel), ProductModel, user).filter(ProductModel.sku == row.get("sku")).first()
        if not product:
            product = ProductModel(
                product_id=prefixed_id("prod"),
                sku=row.get("sku") or f"SKU-{uuid.uuid4().hex[:8]}",
                name=row.get("name") or row.get("sku") or "",
                price=float(row.get("price", 0) or 0),
                cost=float(row.get("cost", 0) or 0),
                company_id=user.company_id,
            )
            db.add(product)
            db.flush()

        item = company_filter(db.query(InventoryModel), InventoryModel, user).filter(
            InventoryModel.product_id == product.product_id,
            InventoryModel.warehouse_id == warehouse_id,
        ).first()
        if item:
            item.quantity = int(row.get("quantity", 0) or 0)
            item.min_stock = int(row.get("min_stock", item.min_stock or 0) or 0)
            item.updated_at = datetime.now(timezone.utc)
        else:
            db.add(
                InventoryModel(
                    inventory_id=prefixed_id("inv"),
                    product_id=product.product_id,
                    warehouse_id=warehouse_id,
                    quantity=int(row.get("quantity", 0) or 0),
                    min_stock=int(row.get("min_stock", 0) or 0),
                    company_id=user.company_id,
                )
            )
        imported += 1
    db.commit()
    return {"message": f"Imported {imported} inventory items"}


@app.get("/api/orders")
def get_orders(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    items = company_filter(db.query(OrderModel), OrderModel, user).order_by(OrderModel.created_at.desc()).all()
    return [model_to_dict(item) for item in items]


@app.get("/api/orders/{order_id}")
def get_order(order_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = first_or_404(company_filter(db.query(OrderModel), OrderModel, user).filter(OrderModel.order_id == order_id), "Order not found")
    return model_to_dict(item)


@app.post("/api/orders")
def create_order(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    client = first_or_404(company_filter(db.query(ClientModel), ClientModel, user).filter(ClientModel.client_id == data["client_id"]), "Client not found")
    products_by_id = lookup_products(db, user, data.get("items", []))
    items, subtotal = build_line_items(data.get("items", []), products_by_id)
    tax = subtotal * 0.21

    item = OrderModel(
        order_id=prefixed_id("ord"),
        order_number=generate_sequence("PED", OrderModel, user.company_id, db),
        client_id=client.client_id,
        client_name=client.name,
        items=items,
        subtotal=subtotal,
        tax=tax,
        total=subtotal + tax,
        status=data.get("status", "pending"),
        warehouse_id=data.get("warehouse_id"),
        company_id=user.company_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.put("/api/orders/{order_id}")
def update_order(order_id: str, data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = first_or_404(company_filter(db.query(OrderModel), OrderModel, user).filter(OrderModel.order_id == order_id), "Order not found")
    for field in ["status", "warehouse_id"]:
        if field in data:
            setattr(item, field, data[field])
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/orders/{order_id}")
def delete_order(order_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    company_filter(db.query(OrderModel), OrderModel, user).filter(OrderModel.order_id == order_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/invoices")
def get_invoices(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    items = company_filter(db.query(InvoiceModel), InvoiceModel, user).order_by(InvoiceModel.created_at.desc()).all()
    return [model_to_dict(item) for item in items]


@app.get("/api/invoices/{invoice_id}")
def get_invoice(invoice_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = first_or_404(company_filter(db.query(InvoiceModel), InvoiceModel, user).filter(InvoiceModel.invoice_id == invoice_id), "Invoice not found")
    return model_to_dict(item)


@app.post("/api/invoices")
def create_invoice(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    client = first_or_404(company_filter(db.query(ClientModel), ClientModel, user).filter(ClientModel.client_id == data["client_id"]), "Client not found")
    products_by_id = lookup_products(db, user, data.get("items", []))
    items, subtotal = build_line_items(data.get("items", []), products_by_id)
    tax = subtotal * 0.21

    item = InvoiceModel(
        invoice_id=prefixed_id("inv"),
        invoice_number=generate_sequence("FAC", InvoiceModel, user.company_id, db),
        client_id=client.client_id,
        client_name=client.name,
        order_id=data.get("order_id"),
        items=items,
        subtotal=subtotal,
        tax=tax,
        total=subtotal + tax,
        status=data.get("status", "pending"),
        due_date=parse_iso_datetime(data.get("due_date")),
        company_id=user.company_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.put("/api/invoices/{invoice_id}")
def update_invoice(invoice_id: str, data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = first_or_404(company_filter(db.query(InvoiceModel), InvoiceModel, user).filter(InvoiceModel.invoice_id == invoice_id), "Invoice not found")
    if "status" in data:
        item.status = data["status"]
    if data.get("due_date"):
        item.due_date = parse_iso_datetime(data["due_date"])
    if data.get("status") == "paid" and not item.paid_date:
        item.paid_date = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/invoices/{invoice_id}")
def delete_invoice(invoice_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    company_filter(db.query(InvoiceModel), InvoiceModel, user).filter(InvoiceModel.invoice_id == invoice_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/purchase-orders")
def get_purchase_orders(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    items = company_filter(db.query(PurchaseOrderModel), PurchaseOrderModel, user).order_by(PurchaseOrderModel.created_at.desc()).all()
    return [model_to_dict(item) for item in items]


@app.post("/api/purchase-orders")
def create_purchase_order(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    supplier = first_or_404(company_filter(db.query(SupplierModel), SupplierModel, user).filter(SupplierModel.supplier_id == data["supplier_id"]), "Supplier not found")
    products_by_id = lookup_products(db, user, data.get("items", []))
    items, subtotal = build_line_items(data.get("items", []), products_by_id)
    tax = subtotal * 0.21

    item = PurchaseOrderModel(
        po_id=prefixed_id("po"),
        po_number=generate_sequence("OC", PurchaseOrderModel, user.company_id, db),
        supplier_id=supplier.supplier_id,
        supplier_name=supplier.name,
        items=items,
        subtotal=subtotal,
        tax=tax,
        total=subtotal + tax,
        status=data.get("status", "pending"),
        warehouse_id=data.get("warehouse_id"),
        company_id=user.company_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.put("/api/purchase-orders/{po_id}")
def update_purchase_order(po_id: str, data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = first_or_404(company_filter(db.query(PurchaseOrderModel), PurchaseOrderModel, user).filter(PurchaseOrderModel.po_id == po_id), "Purchase order not found")
    for field in ["status", "warehouse_id"]:
        if field in data:
            setattr(item, field, data[field])
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/purchase-orders/{po_id}")
def delete_purchase_order(po_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    company_filter(db.query(PurchaseOrderModel), PurchaseOrderModel, user).filter(PurchaseOrderModel.po_id == po_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/purchase-invoices")
def get_purchase_invoices(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    items = company_filter(db.query(PurchaseInvoiceModel), PurchaseInvoiceModel, user).order_by(PurchaseInvoiceModel.created_at.desc()).all()
    return [model_to_dict(item) for item in items]


@app.post("/api/purchase-invoices")
def create_purchase_invoice(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    supplier = first_or_404(company_filter(db.query(SupplierModel), SupplierModel, user).filter(SupplierModel.supplier_id == data["supplier_id"]), "Supplier not found")
    products_by_id = lookup_products(db, user, data.get("items", []))
    items, subtotal = build_line_items(data.get("items", []), products_by_id)
    tax = subtotal * 0.21

    item = PurchaseInvoiceModel(
        pinv_id=prefixed_id("pinv"),
        invoice_number=generate_sequence("FC", PurchaseInvoiceModel, user.company_id, db),
        supplier_id=supplier.supplier_id,
        supplier_name=supplier.name,
        po_id=data.get("po_id"),
        items=items,
        subtotal=subtotal,
        tax=tax,
        total=subtotal + tax,
        status=data.get("status", "pending"),
        due_date=parse_iso_datetime(data.get("due_date")),
        company_id=user.company_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.put("/api/purchase-invoices/{pinv_id}")
def update_purchase_invoice(pinv_id: str, data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    item = first_or_404(company_filter(db.query(PurchaseInvoiceModel), PurchaseInvoiceModel, user).filter(PurchaseInvoiceModel.pinv_id == pinv_id), "Purchase invoice not found")
    if "status" in data:
        item.status = data["status"]
    if data.get("due_date"):
        item.due_date = parse_iso_datetime(data["due_date"])
    if data.get("status") == "paid" and not item.paid_date:
        item.paid_date = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/purchase-invoices/{pinv_id}")
def delete_purchase_invoice(pinv_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    company_filter(db.query(PurchaseInvoiceModel), PurchaseInvoiceModel, user).filter(PurchaseInvoiceModel.pinv_id == pinv_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/reports/dashboard")
def get_dashboard_stats(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    company_id = user.company_id
    clients_count = db.query(ClientModel).filter(ClientModel.company_id == company_id).count()
    suppliers_count = db.query(SupplierModel).filter(SupplierModel.company_id == company_id).count()
    products_count = db.query(ProductModel).filter(ProductModel.company_id == company_id).count()
    orders = db.query(OrderModel).filter(OrderModel.company_id == company_id).order_by(OrderModel.created_at.desc()).all()
    invoices = db.query(InvoiceModel).filter(InvoiceModel.company_id == company_id).order_by(InvoiceModel.created_at.desc()).all()
    purchase_invoices = db.query(PurchaseInvoiceModel).filter(PurchaseInvoiceModel.company_id == company_id).all()
    inventory = db.query(InventoryModel).filter(InventoryModel.company_id == company_id).all()

    return {
        "clients_count": clients_count,
        "suppliers_count": suppliers_count,
        "products_count": products_count,
        "orders_count": len(orders),
        "total_sales": sum(invoice.total or 0 for invoice in invoices),
        "total_purchases": sum(item.total or 0 for item in purchase_invoices),
        "pending_invoices": sum(1 for invoice in invoices if invoice.status == "pending"),
        "low_stock_count": sum(1 for item in inventory if item.quantity <= item.min_stock),
        "recent_orders": [model_to_dict(item) for item in orders[:5]],
        "recent_invoices": [model_to_dict(item) for item in invoices[:5]],
    }


@app.get("/api/reports/export/{report_type}")
def export_report(report_type: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> StreamingResponse:
    table_map = {
        "clients": ClientModel,
        "suppliers": SupplierModel,
        "products": ProductModel,
        "inventory": InventoryModel,
        "orders": OrderModel,
        "invoices": InvoiceModel,
        "purchase-orders": PurchaseOrderModel,
        "purchase-invoices": PurchaseInvoiceModel,
    }
    model = table_map.get(report_type)
    if not model:
        raise HTTPException(status_code=400, detail="Invalid report type")

    items = company_filter(db.query(model), model, user).all()
    if not items:
        raise HTTPException(status_code=404, detail="No data to export")

    df = pd.DataFrame([model_to_dict(item) for item in items])
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=report_type)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={report_type}.xlsx"},
    )


@app.get("/api/ai/chat-history")
def get_chat_history(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    items = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.user_id == user.user_id, ChatMessageModel.company_id == user.company_id)
        .order_by(ChatMessageModel.created_at.asc())
        .all()
    )
    return [model_to_dict(item) for item in items]


@app.post("/api/ai/chat")
async def chat_with_ai(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    user_message = data.get("message", "").strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="Message is required")

    user_msg = ChatMessageModel(
        message_id=prefixed_id("msg"),
        user_id=user.user_id,
        company_id=user.company_id,
        role="user",
        content=user_message,
    )
    db.add(user_msg)
    db.commit()

    clients = company_filter(db.query(ClientModel), ClientModel, user).limit(20).all()
    suppliers = company_filter(db.query(SupplierModel), SupplierModel, user).limit(20).all()
    products = company_filter(db.query(ProductModel), ProductModel, user).limit(20).all()
    invoices = company_filter(db.query(InvoiceModel), InvoiceModel, user).order_by(InvoiceModel.created_at.desc()).limit(10).all()
    orders = company_filter(db.query(OrderModel), OrderModel, user).order_by(OrderModel.created_at.desc()).limit(10).all()

    context = f"""
Eres un asistente de IA para un ERP. Responde siempre en espanol y de forma concisa.

CLIENTES:
{[{"nombre": item.name, "email": item.email, "id": item.client_id} for item in clients]}

PROVEEDORES:
{[{"nombre": item.name, "email": item.email, "id": item.supplier_id} for item in suppliers]}

PRODUCTOS:
{[{"nombre": item.name, "sku": item.sku, "precio": item.price, "id": item.product_id} for item in products]}

FACTURAS:
{[{"numero": item.invoice_number, "cliente": item.client_name, "total": item.total, "estado": item.status} for item in invoices]}

PEDIDOS:
{[{"numero": item.order_number, "cliente": item.client_name, "total": item.total, "estado": item.status} for item in orders]}
"""

    try:
        ai_response = await generate_ai_response(context, user_message)
    except Exception as exc:
        logger.error("AI chat error: %s", exc)
        return {
            "response": "No he podido procesar tu mensaje ahora mismo. Revisa la configuracion de OPENAI_API_KEY.",
            "error": str(exc),
        }

    assistant_msg = ChatMessageModel(
        message_id=prefixed_id("msg"),
        user_id=user.user_id,
        company_id=user.company_id,
        role="assistant",
        content=ai_response,
    )
    db.add(assistant_msg)
    db.commit()

    return {"response": ai_response, "message_id": assistant_msg.message_id}


@app.delete("/api/ai/chat-history")
def clear_chat_history(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    db.query(ChatMessageModel).filter(ChatMessageModel.user_id == user.user_id, ChatMessageModel.company_id == user.company_id).delete()
    db.commit()
    return {"message": "Chat history cleared"}


@app.get("/api")
def root() -> Dict[str, str]:
    return {"message": "Starxia ERP API Running"}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
