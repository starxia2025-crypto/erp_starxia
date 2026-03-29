import csv
import hashlib
import io
import json
import logging
import os
import re
import smtplib
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode
 
import pandas as pd
from compliance_services import build_verifactu_export, get_aeat_adapter
from dotenv import load_dotenv
from fastapi import Cookie, Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import StreamingResponse
from jose import JWTError, jwt
from openai import AsyncOpenAI
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, MetaData, String, Text, UniqueConstraint, create_engine, text
from sqlalchemy.orm import Session, declarative_base, mapped_column, sessionmaker
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

DATABASE_URL = os.environ["DATABASE_URL"]
JWT_SECRET = os.environ["JWT_SECRET"]
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5-mini")
PASSWORD_RESET_BASE_URL = os.environ.get("PASSWORD_RESET_BASE_URL", "http://localhost:3000")
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USERNAME = os.environ.get("SMTP_USERNAME", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.environ.get("SMTP_FROM_EMAIL", "")
SMTP_FROM_NAME = os.environ.get("SMTP_FROM_NAME", "Starxia ERP")
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").lower() == "true"
SMTP_USE_SSL = os.environ.get("SMTP_USE_SSL", "false").lower() == "true"
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
    legal_name = mapped_column(String(255))
    tax_id = mapped_column(String(64))
    address = mapped_column(Text)
    country = mapped_column(String(2), default="ES", nullable=False)
    phone = mapped_column(String(64))
    email = mapped_column(String(255))
    billing_email = mapped_column(String(255))
    logo_url = mapped_column(Text)
    fiscal_series_config = mapped_column(JSON, default=dict, nullable=False)
    verifactu_enabled = mapped_column(Boolean, default=True, nullable=False)
    aeat_submission_enabled = mapped_column(Boolean, default=False, nullable=False)


class LegalDocumentModel(PublicBase, TimestampMixin):
    __tablename__ = "legal_documents"
    __table_args__ = (UniqueConstraint("code", "version", name="uq_legal_document_code_version"),)

    document_id = mapped_column(String(32), primary_key=True)
    code = mapped_column(String(64), nullable=False, index=True)
    version = mapped_column(String(32), nullable=False)
    title = mapped_column(String(255), nullable=False)
    language = mapped_column(String(8), default="es", nullable=False)
    content = mapped_column(Text, nullable=False)
    is_active = mapped_column(Boolean, default=True, nullable=False)
    requires_acceptance = mapped_column(Boolean, default=True, nullable=False)
    published_at = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class LegalAcceptanceModel(PublicBase, TimestampMixin):
    __tablename__ = "legal_acceptances"
    __table_args__ = (
        UniqueConstraint("user_id", "company_id", "document_code", "document_version", name="uq_legal_acceptance_version"),
    )

    acceptance_id = mapped_column(String(32), primary_key=True)
    user_id = mapped_column(String(32), nullable=False, index=True)
    company_id = mapped_column(String(32), nullable=False, index=True)
    document_code = mapped_column(String(64), nullable=False, index=True)
    document_version = mapped_column(String(32), nullable=False)
    accepted = mapped_column(Boolean, default=True, nullable=False)
    accepted_at = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    ip_address = mapped_column(String(64))
    user_agent = mapped_column(Text)


class ProcessingActivityModel(PublicBase, TimestampMixin, UpdatedTimestampMixin):
    __tablename__ = "processing_activities"

    activity_id = mapped_column(String(32), primary_key=True)
    code = mapped_column(String(64), nullable=False, unique=True)
    title = mapped_column(String(255), nullable=False)
    purpose = mapped_column(Text)
    legal_basis = mapped_column(Text)
    data_categories = mapped_column(Text)
    data_subject_categories = mapped_column(Text)
    recipients = mapped_column(Text)
    processors = mapped_column(Text)
    retention_period = mapped_column(Text)
    security_measures = mapped_column(Text)
    international_transfers = mapped_column(Text)


class SecurityAuditLogModel(PublicBase, TimestampMixin):
    __tablename__ = "security_audit_logs"

    log_id = mapped_column(String(32), primary_key=True)
    company_id = mapped_column(String(32), index=True)
    user_id = mapped_column(String(32), index=True)
    action = mapped_column(String(128), nullable=False, index=True)
    entity_type = mapped_column(String(64))
    entity_id = mapped_column(String(32))
    metadata_json = mapped_column(JSON, default=dict, nullable=False)


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
    series = mapped_column(String(32), default="GEN", nullable=False)
    number = mapped_column(Integer, default=1, nullable=False)
    invoice_number = mapped_column(String(64), nullable=False)
    client_id = mapped_column(String(32), nullable=False)
    client_name = mapped_column(String(255), nullable=False)
    order_id = mapped_column(String(32))
    issue_date = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    operation_date = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    invoice_type = mapped_column(String(32), default="complete", nullable=False)
    simplified = mapped_column(Boolean, default=False, nullable=False)
    rectified_invoice_id = mapped_column(String(32))
    items = mapped_column(JSON, default=list, nullable=False)
    subtotal = mapped_column(Float, default=0.0, nullable=False)
    tax = mapped_column(Float, default=0.0, nullable=False)
    total = mapped_column(Float, default=0.0, nullable=False)
    currency = mapped_column(String(8), default="EUR", nullable=False)
    pdf_path = mapped_column(Text)
    status = mapped_column(String(32), default="issued", nullable=False)
    immutable_at = mapped_column(DateTime(timezone=True))
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


class InvoiceRecordModel(TenantBase, TimestampMixin):
    __tablename__ = "invoice_records"

    record_id = mapped_column(String(32), primary_key=True)
    invoice_id = mapped_column(String(32), nullable=False, index=True)
    company_id = mapped_column(String(32), nullable=False, index=True)
    record_type = mapped_column(String(32), nullable=False)
    canonical_payload = mapped_column(Text, nullable=False)
    hash_current = mapped_column(String(128), nullable=False, index=True)
    hash_previous = mapped_column(String(128))
    generated_at = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    signed = mapped_column(Boolean, default=False, nullable=False)
    signature_value = mapped_column(Text)
    sent_to_aeat = mapped_column(Boolean, default=False, nullable=False)
    sent_at = mapped_column(DateTime(timezone=True))
    aeat_response = mapped_column(Text)


class SystemEventModel(TenantBase, TimestampMixin):
    __tablename__ = "system_events"

    event_id = mapped_column(String(32), primary_key=True)
    company_id = mapped_column(String(32), nullable=False, index=True)
    user_id = mapped_column(String(32), nullable=False, index=True)
    event_type = mapped_column(String(128), nullable=False, index=True)
    entity_type = mapped_column(String(64), nullable=False)
    entity_id = mapped_column(String(32), nullable=False)
    payload = mapped_column(JSON, default=dict, nullable=False)
    hash_current = mapped_column(String(128), nullable=False, index=True)
    hash_previous = mapped_column(String(128))


class ReturnModel(TenantBase, TimestampMixin):
    __tablename__ = "returns"

    return_id = mapped_column(String(32), primary_key=True)
    return_number = mapped_column(String(64), nullable=False)
    return_type = mapped_column(String(32), nullable=False)
    source_document_id = mapped_column(String(32), nullable=False)
    source_document_number = mapped_column(String(64), nullable=False)
    partner_id = mapped_column(String(32), nullable=False)
    partner_name = mapped_column(String(255), nullable=False)
    warehouse_id = mapped_column(String(32), nullable=False)
    items = mapped_column(JSON, default=list, nullable=False)
    subtotal = mapped_column(Float, default=0.0, nullable=False)
    tax = mapped_column(Float, default=0.0, nullable=False)
    total = mapped_column(Float, default=0.0, nullable=False)
    reason = mapped_column(Text)
    company_id = mapped_column(String(32), nullable=False, index=True)


class StockTransferModel(TenantBase, TimestampMixin):
    __tablename__ = "stock_transfers"

    transfer_id = mapped_column(String(32), primary_key=True)
    transfer_number = mapped_column(String(64), nullable=False)
    source_warehouse_id = mapped_column(String(32), nullable=False)
    target_warehouse_id = mapped_column(String(32), nullable=False)
    items = mapped_column(JSON, default=list, nullable=False)
    notes = mapped_column(Text)
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
    company_tax_id: Optional[str] = None
    company_address: Optional[str] = None
    company_phone: Optional[str] = None
    company_email: Optional[EmailStr] = None
    accept_terms: bool = False
    accept_privacy: bool = False


class LegalAcceptanceInput(BaseModel):
    document_code: str
    document_version: str
    accepted: bool = True


class LegalDocumentPublishInput(BaseModel):
    code: str
    version: str
    title: str
    content: str
    requires_acceptance: bool = True


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordInput(BaseModel):
    email: EmailStr


class ResetPasswordInput(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class ReturnInput(BaseModel):
    return_type: str
    source_document_id: str
    warehouse_id: Optional[str] = None
    reason: Optional[str] = None
    items: List[Dict[str, Any]]


class StockTransferInput(BaseModel):
    source_warehouse_id: str
    target_warehouse_id: str
    notes: Optional[str] = None
    items: List[Dict[str, Any]]


class CreateUserInput(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)
    role: str


class UpdateUserInput(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None


app = FastAPI(title="Starxia ERP API")

ROLE_PERMISSIONS = {
    "owner": {"*"},
    "admin": {"*"},
    "manager": {
        "dashboard.read",
        "clients.read",
        "clients.write",
        "suppliers.read",
        "suppliers.write",
        "products.read",
        "products.write",
        "inventory.read",
        "inventory.write",
        "sales.read",
        "sales.write",
        "purchases.read",
        "purchases.write",
        "reports.read",
        "settings.read",
        "ai.read",
        "users.read",
    },
    "sales": {
        "dashboard.read",
        "clients.read",
        "clients.write",
        "products.read",
        "sales.read",
        "sales.write",
        "ai.read",
    },
    "warehouse": {
        "dashboard.read",
        "products.read",
        "products.write",
        "inventory.read",
        "inventory.write",
        "ai.read",
    },
    "employee": {
        "dashboard.read",
        "ai.read",
    },
    "advisor": {
        "dashboard.read",
        "clients.read",
        "suppliers.read",
        "products.read",
        "inventory.read",
        "sales.read",
        "purchases.read",
        "reports.read",
        "settings.read",
        "ai.read",
        "users.read",
    },
}
VALID_ROLES = set(ROLE_PERMISSIONS.keys())
ENTITY_PERMISSION_MAP = {
    "client": "clients",
    "supplier": "suppliers",
    "product": "products",
    "warehouse": "inventory",
}
DEFAULT_LEGAL_DOCUMENTS = {
    "terms": {
        "version": "2026.04",
        "title": "Terminos y condiciones",
        "requires_acceptance": True,
        "content": """1. Objeto del servicio

Starxia ERP es un software SaaS de gestion empresarial accesible en linea para la administracion de clientes, proveedores, inventario, compras, ventas, facturacion y analitica de negocio.

2. Partes

El prestador del servicio es la entidad titular de Starxia ERP.
El cliente es la empresa o profesional que contrata el servicio y crea una cuenta de empresa en la plataforma.

3. Alta y acceso

El cliente declara que los datos facilitados en el alta son exactos, completos y actualizados.
La persona que acepta estas condiciones declara tener capacidad suficiente para contratar en nombre propio o de la empresa a la que representa.

4. Uso permitido

El cliente podra utilizar la plataforma exclusivamente para su actividad empresarial o profesional legitima y conforme a la ley.
Queda prohibido:
- utilizar el servicio para fines ilicitos
- compartir credenciales de forma insegura
- intentar acceder a datos de terceros
- alterar, copiar o explotar la plataforma fuera de lo permitido contractualmente

5. Roles y control de acceso

Cada empresa es responsable de asignar usuarios, roles y permisos internos.
El cliente asume la responsabilidad de custodiar sus credenciales y de revocar el acceso a usuarios que ya no deban operar en el sistema.

6. Disponibilidad y soporte

El servicio se presta bajo un modelo SaaS y se intentara mantener una disponibilidad razonable y continuada.
Podran producirse interrupciones por mantenimiento, seguridad, incidencias de terceros o fuerza mayor.

7. Facturacion y cumplimiento

Starxia ERP incorpora funcionalidades orientadas al cumplimiento fiscal y de facturacion, pero el cliente sigue siendo responsable de la veracidad de los datos introducidos y de su correcto uso operativo.
La configuracion fiscal definitiva debe validarse por el cliente y, en su caso, por su asesoria fiscal o juridica.

8. Propiedad intelectual

La plataforma, su codigo, estructura, diseno, marcas y documentacion son titularidad del prestador o de sus licenciantes.
El cliente recibe un derecho limitado, no exclusivo y no sublicenciable de uso mientras el servicio este vigente.

9. Proteccion de datos

El tratamiento de datos personales se regula adicionalmente por la politica de privacidad y, cuando proceda, por el contrato de encargado del tratamiento.

10. Responsabilidad

El servicio se presta como herramienta de gestion.
El prestador no responde de decisiones empresariales, contables, fiscales o comerciales tomadas por el cliente ni de errores derivados de datos incorrectos introducidos por este.

11. Suspensiones y resolucion

El prestador podra suspender el acceso por incumplimientos graves, riesgos de seguridad, uso fraudulento o impago, cuando exista base contractual para ello.

12. Modificaciones

Estas condiciones podran actualizarse por razones legales, tecnicas, operativas o comerciales.
Cuando la version aplicable cambie y sea necesario, el sistema podra solicitar una nueva aceptacion.

13. Ley aplicable y jurisdiccion

Estas condiciones se interpretaran conforme al derecho espanol, sin perjuicio de la normativa imperativa aplicable.

TODO JURIDICO:
- completar identificacion del prestador
- incluir condiciones economicas definitivas
- revisar clausulas de limitacion de responsabilidad
- validar jurisdiccion y foro""",
    },
    "privacy": {
        "version": "2026.04",
        "title": "Politica de privacidad",
        "requires_acceptance": True,
        "content": """1. Responsable del tratamiento

El responsable del tratamiento sera la entidad titular de Starxia ERP, cuyos datos identificativos completos deben incorporarse antes de produccion.

2. Finalidades

Los datos personales podran tratarse para:
- gestion del alta y autenticacion de usuarios
- prestacion del servicio ERP
- soporte tecnico y atencion al cliente
- seguridad, auditoria y prevencion de fraude
- cumplimiento legal y fiscal
- comunicaciones vinculadas al servicio

3. Base juridica

Las bases juridicas podran ser:
- ejecucion de la relacion contractual
- cumplimiento de obligaciones legales
- interes legitimo en seguridad, continuidad y soporte
- consentimiento, cuando proceda

4. Categorias de datos

Podran tratarse, segun el uso del servicio:
- datos identificativos y de contacto
- datos profesionales y de empresa
- datos de acceso, logs y evidencias tecnicas
- datos de clientes, proveedores y operaciones del cliente alojados en la plataforma

5. Conservacion

Los datos se conservaran durante la vigencia de la relacion y posteriormente durante los plazos legales o mientras existan responsabilidades asociadas.

6. Destinatarios

Podran acceder a los datos:
- personal autorizado del prestador
- proveedores tecnologicos necesarios para operar el servicio
- encargados del tratamiento formalizados
- autoridades cuando exista obligacion legal

7. Transferencias internacionales

Solo se realizaran cuando exista una base legal suficiente y garantias adecuadas conforme al RGPD.

8. Derechos

Las personas interesadas podran ejercitar sus derechos de acceso, rectificacion, supresion, oposicion, limitacion y portabilidad cuando proceda.
El sistema incorpora un flujo basico para registrar solicitudes, sin perjuicio del procedimiento juridico definitivo del responsable.

9. Seguridad

Se aplican medidas tecnicas y organizativas razonables para proteger los datos, incluyendo control de acceso, segregacion por empresa, auditoria y gestion de credenciales.

10. Encargado del tratamiento

Cuando el cliente use Starxia ERP para tratar datos personales por cuenta propia, podra resultar aplicable el contrato de encargado del tratamiento.

11. Reclamaciones

La persona interesada podra reclamar ante la autoridad de control competente si considera vulnerados sus derechos.

TODO JURIDICO:
- completar datos del responsable
- concretar plazos de conservacion
- revisar lista de proveedores y transferencias
- validar redaccion final con DPO o asesoria""",
    },
    "dpa": {
        "version": "2026.04",
        "title": "Contrato de encargado del tratamiento",
        "requires_acceptance": True,
        "content": """1. Objeto

El presente acuerdo regula el tratamiento de datos personales realizado por el prestador de Starxia ERP por cuenta del cliente, cuando este utilice la plataforma para gestionar datos personales bajo su propia responsabilidad.

2. Naturaleza y finalidad

El tratamiento se limita a la prestacion del servicio SaaS de gestion empresarial y a las operaciones tecnicamente necesarias para su mantenimiento, soporte, seguridad y continuidad.

3. Tipo de datos y categorias

Dependiendo del uso del cliente, podran incluirse datos identificativos, de contacto, facturacion, operaciones comerciales y otra informacion incorporada por el propio cliente a la plataforma.

4. Obligaciones del encargado

El encargado se compromete a:
- tratar los datos solo siguiendo instrucciones documentadas del responsable
- garantizar confidencialidad del personal autorizado
- aplicar medidas de seguridad adecuadas
- asistir al responsable en el ejercicio de derechos
- apoyar en seguridad, brechas y evaluaciones cuando proceda
- suprimir o devolver los datos al finalizar la relacion, salvo obligacion legal de conservacion

5. Subencargados

El encargado podra apoyarse en subencargados tecnicos necesarios para la prestacion del servicio, siempre con las garantias contractuales correspondientes.

6. Brechas de seguridad

El encargado notificara al responsable, sin dilacion indebida, aquellas incidencias de seguridad que puedan afectar a datos personales tratados por cuenta del cliente.

7. Auditoria e informacion

El encargado pondra a disposicion del responsable la informacion razonablemente necesaria para demostrar el cumplimiento de sus obligaciones contractuales.

8. Duracion

Este acuerdo permanecera vigente mientras el encargado trate datos personales por cuenta del responsable dentro del servicio.

TODO JURIDICO:
- completar identidad de las partes
- detallar subencargados reales
- revisar anexo tecnico de seguridad
- validar texto definitivo conforme al articulo 28 RGPD""",
    },
    "cookies": {
        "version": "2026.04",
        "title": "Politica de cookies",
        "requires_acceptance": False,
        "content": """1. Uso de cookies

La aplicacion puede utilizar cookies tecnicas necesarias para permitir el acceso autenticado, mantener la sesion, reforzar seguridad y asegurar el funcionamiento basico del servicio.

2. Tipologias

En el estado actual del sistema se contemplan principalmente cookies tecnicas y de sesion.
Si en el futuro se incorporan cookies analiticas, publicitarias o equivalentes, debera habilitarse un panel de consentimiento especifico.

3. Gestion

El usuario puede configurar su navegador para bloquear o eliminar cookies, aunque ello podria afectar al funcionamiento del servicio.

4. Informacion adicional

Para mas informacion sobre tratamiento de datos personales, consulta la politica de privacidad.

TODO JURIDICO:
- revisar inventario real de cookies
- anadir CMP si se incorporan cookies no tecnicas""",
    },
}


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


def permissions_for_role(role: str) -> set[str]:
    return ROLE_PERMISSIONS.get(role, set())


def user_has_permission(user: UserModel, permission: str) -> bool:
    perms = permissions_for_role(user.role)
    return "*" in perms or permission in perms


def require_permission(user: UserModel, permission: str) -> None:
    if not user_has_permission(user, permission):
        raise HTTPException(status_code=403, detail="Not authorized for this action")


def get_active_legal_documents(db: Session, requires_acceptance: Optional[bool] = None) -> List[LegalDocumentModel]:
    query = db.query(LegalDocumentModel).filter(LegalDocumentModel.is_active.is_(True))
    if requires_acceptance is not None:
        query = query.filter(LegalDocumentModel.requires_acceptance.is_(requires_acceptance))
    items = query.order_by(LegalDocumentModel.code.asc(), LegalDocumentModel.published_at.desc()).all()
    latest_by_code: Dict[str, LegalDocumentModel] = {}
    for item in items:
        if item.code not in latest_by_code:
            latest_by_code[item.code] = item
    return list(latest_by_code.values())


def get_latest_legal_document_by_code(db: Session, code: str) -> LegalDocumentModel:
    document = (
        db.query(LegalDocumentModel)
        .filter(LegalDocumentModel.code == code, LegalDocumentModel.is_active.is_(True))
        .order_by(LegalDocumentModel.published_at.desc())
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail=f"Legal document '{code}' not found")
    return document


def get_required_legal_reacceptances(db: Session, user: UserModel) -> List[Dict[str, Any]]:
    pending: List[Dict[str, Any]] = []
    required_documents = get_active_legal_documents(db, requires_acceptance=True)
    for document in required_documents:
        acceptance = (
            db.query(LegalAcceptanceModel)
            .filter(
                LegalAcceptanceModel.user_id == user.user_id,
                LegalAcceptanceModel.company_id == user.company_id,
                LegalAcceptanceModel.document_code == document.code,
                LegalAcceptanceModel.document_version == document.version,
                LegalAcceptanceModel.accepted.is_(True),
            )
            .first()
        )
        if not acceptance:
            pending.append(
                {
                    "code": document.code,
                    "version": document.version,
                    "title": document.title,
                }
            )
    return pending


def serialize_user(user: UserModel) -> Dict[str, Any]:
    data = model_to_dict(user, exclude={"password_hash"})
    data["permissions"] = sorted(permissions_for_role(user.role))
    company = getattr(user, "company", None)
    if company is not None:
        data["company_name"] = company.legal_name or company.name
        data["company_logo_url"] = company.logo_url
        data["company_legal_name"] = company.legal_name
    return data


def parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def canonical_json(data: Dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


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


def apply_public_migrations() -> None:
    if engine.dialect.name != "postgresql":
        return
    statements = [
        'ALTER TABLE companies ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255)',
        "ALTER TABLE companies ADD COLUMN IF NOT EXISTS country VARCHAR(2) NOT NULL DEFAULT 'ES'",
        'ALTER TABLE companies ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255)',
        'ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT',
        "ALTER TABLE companies ADD COLUMN IF NOT EXISTS fiscal_series_config JSONB NOT NULL DEFAULT '{}'::jsonb",
        "ALTER TABLE companies ADD COLUMN IF NOT EXISTS verifactu_enabled BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE companies ADD COLUMN IF NOT EXISTS aeat_submission_enabled BOOLEAN NOT NULL DEFAULT FALSE",
        """
        CREATE TABLE IF NOT EXISTS legal_documents (
            document_id VARCHAR(32) PRIMARY KEY,
            code VARCHAR(64) NOT NULL,
            version VARCHAR(32) NOT NULL,
            title VARCHAR(255) NOT NULL,
            language VARCHAR(8) NOT NULL DEFAULT 'es',
            content TEXT NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            requires_acceptance BOOLEAN NOT NULL DEFAULT TRUE,
            published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_legal_document_code_version UNIQUE (code, version)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS legal_acceptances (
            acceptance_id VARCHAR(32) PRIMARY KEY,
            user_id VARCHAR(32) NOT NULL,
            company_id VARCHAR(32) NOT NULL,
            document_code VARCHAR(64) NOT NULL,
            document_version VARCHAR(32) NOT NULL,
            accepted BOOLEAN NOT NULL DEFAULT TRUE,
            accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ip_address VARCHAR(64),
            user_agent TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_legal_acceptance_version UNIQUE (user_id, company_id, document_code, document_version)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS processing_activities (
            activity_id VARCHAR(32) PRIMARY KEY,
            code VARCHAR(64) NOT NULL UNIQUE,
            title VARCHAR(255) NOT NULL,
            purpose TEXT,
            legal_basis TEXT,
            data_categories TEXT,
            data_subject_categories TEXT,
            recipients TEXT,
            processors TEXT,
            retention_period TEXT,
            security_measures TEXT,
            international_transfers TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS security_audit_logs (
            log_id VARCHAR(32) PRIMARY KEY,
            company_id VARCHAR(32),
            user_id VARCHAR(32),
            action VARCHAR(128) NOT NULL,
            entity_type VARCHAR(64),
            entity_id VARCHAR(32),
            metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
    ]
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def apply_tenant_migrations(schema_name: str) -> None:
    if engine.dialect.name != "postgresql":
        return
    schema = f'"{schema_name}"'
    statements = [
        f"ALTER TABLE {schema}.invoices ADD COLUMN IF NOT EXISTS series VARCHAR(32) NOT NULL DEFAULT 'GEN'",
        f"ALTER TABLE {schema}.invoices ADD COLUMN IF NOT EXISTS number INTEGER NOT NULL DEFAULT 1",
        f"ALTER TABLE {schema}.invoices ADD COLUMN IF NOT EXISTS issue_date TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        f"ALTER TABLE {schema}.invoices ADD COLUMN IF NOT EXISTS operation_date TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        f"ALTER TABLE {schema}.invoices ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(32) NOT NULL DEFAULT 'complete'",
        f"ALTER TABLE {schema}.invoices ADD COLUMN IF NOT EXISTS simplified BOOLEAN NOT NULL DEFAULT FALSE",
        f"ALTER TABLE {schema}.invoices ADD COLUMN IF NOT EXISTS rectified_invoice_id VARCHAR(32)",
        f"ALTER TABLE {schema}.invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(8) NOT NULL DEFAULT 'EUR'",
        f"ALTER TABLE {schema}.invoices ADD COLUMN IF NOT EXISTS pdf_path TEXT",
        f"ALTER TABLE {schema}.invoices ADD COLUMN IF NOT EXISTS immutable_at TIMESTAMPTZ",
        f"""
        CREATE TABLE IF NOT EXISTS {schema}.invoice_records (
            record_id VARCHAR(32) PRIMARY KEY,
            invoice_id VARCHAR(32) NOT NULL,
            company_id VARCHAR(32) NOT NULL,
            record_type VARCHAR(32) NOT NULL,
            canonical_payload TEXT NOT NULL,
            hash_current VARCHAR(128) NOT NULL,
            hash_previous VARCHAR(128),
            generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            signed BOOLEAN NOT NULL DEFAULT FALSE,
            signature_value TEXT,
            sent_to_aeat BOOLEAN NOT NULL DEFAULT FALSE,
            sent_at TIMESTAMPTZ,
            aeat_response TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {schema}.system_events (
            event_id VARCHAR(32) PRIMARY KEY,
            company_id VARCHAR(32) NOT NULL,
            user_id VARCHAR(32) NOT NULL,
            event_type VARCHAR(128) NOT NULL,
            entity_type VARCHAR(64) NOT NULL,
            entity_id VARCHAR(32) NOT NULL,
            payload JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            hash_current VARCHAR(128) NOT NULL,
            hash_previous VARCHAR(128),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
    ]
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def seed_legal_documents(db: Session) -> None:
    seed_documents = [
        (
            code,
            config["version"],
            config["title"],
            config["content"],
            config["requires_acceptance"],
        )
        for code, config in DEFAULT_LEGAL_DOCUMENTS.items()
    ]
    changed = False
    for code, version, title, content, requires_acceptance in seed_documents:
        previous_items = db.query(LegalDocumentModel).filter(LegalDocumentModel.code == code).all()
        for previous in previous_items:
            if previous.version != version and previous.is_active:
                previous.is_active = False
                changed = True
        existing = (
            db.query(LegalDocumentModel)
            .filter(LegalDocumentModel.code == code, LegalDocumentModel.version == version)
            .first()
        )
        if existing:
            if existing.content != content or existing.title != title or existing.requires_acceptance != requires_acceptance:
                existing.content = content
                existing.title = title
                existing.requires_acceptance = requires_acceptance
                existing.is_active = True
                changed = True
            continue
        db.add(
            LegalDocumentModel(
                document_id=prefixed_id("ldoc"),
                code=code,
                version=version,
                title=title,
                content=content,
                requires_acceptance=requires_acceptance,
                is_active=True,
            )
        )
        changed = True
    if changed:
        db.commit()

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


def create_password_reset_token(user: UserModel) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(hours=2)
    payload = {
        "sub": user.user_id,
        "purpose": "password_reset",
        "pwd": user.password_hash,
        "exp": expires_at,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_password_reset_token(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except JWTError as exc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token") from exc
    if payload.get("purpose") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid reset token")
    return payload


def send_email_message(
    to_email: str,
    subject: str,
    body: str,
    attachments: Optional[List[Dict[str, Any]]] = None,
) -> None:
    if not SMTP_HOST or not SMTP_FROM_EMAIL:
        raise RuntimeError("SMTP is not configured")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    message["To"] = to_email
    message.set_content(body)
    for attachment in attachments or []:
        message.add_attachment(
            attachment["content"],
            maintype=attachment["maintype"],
            subtype=attachment["subtype"],
            filename=attachment["filename"],
        )

    try:
        if SMTP_USE_SSL:
            smtp = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20)
        else:
            smtp = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20)

        with smtp:
            if SMTP_USE_TLS and not SMTP_USE_SSL:
                smtp.starttls()
            if SMTP_USERNAME:
                smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
            smtp.send_message(message)
    except Exception as exc:
        logger.exception("SMTP send failed")
        raise RuntimeError("Could not send email") from exc


def send_password_reset_email(user: UserModel) -> None:
    token = create_password_reset_token(user)
    reset_url = f"{PASSWORD_RESET_BASE_URL}?{urlencode({'reset_token': token})}"
    body = (
        f"Hola {user.name},\n\n"
        "Hemos recibido una solicitud para restablecer tu contrasena en Starxia ERP.\n\n"
        f"Usa este enlace para crear una nueva contrasena:\n{reset_url}\n\n"
        "Este enlace caduca en 2 horas. Si no solicitaste este cambio, puedes ignorar este correo.\n"
    )
    send_email_message(user.email, "Restablece tu contrasena de Starxia ERP", body)


def record_legal_acceptance(
    db: Session,
    user_id: str,
    company_id: str,
    document_code: str,
    document_version: str,
    request: Request,
) -> LegalAcceptanceModel:
    acceptance = LegalAcceptanceModel(
        acceptance_id=prefixed_id("lacc"),
        user_id=user_id,
        company_id=company_id,
        document_code=document_code,
        document_version=document_version,
        accepted=True,
        accepted_at=datetime.now(timezone.utc),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(acceptance)
    return acceptance


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


def get_next_invoice_number(series: str, user: UserModel, db: Session) -> int:
    last_number = (
        company_filter(db.query(InvoiceModel), InvoiceModel, user)
        .filter(InvoiceModel.series == series)
        .order_by(InvoiceModel.number.desc())
        .with_entities(InvoiceModel.number)
        .first()
    )
    return int(last_number[0]) + 1 if last_number else 1


def log_security_event(
    db: Session,
    action: str,
    company_id: Optional[str] = None,
    user_id: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    metadata_json: Optional[Dict[str, Any]] = None,
) -> None:
    db.add(
        SecurityAuditLogModel(
            log_id=prefixed_id("slog"),
            company_id=company_id,
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_json=metadata_json or {},
        )
    )


def get_previous_system_event_hash(user: UserModel, db: Session) -> Optional[str]:
    previous = (
        company_filter(db.query(SystemEventModel), SystemEventModel, user)
        .order_by(SystemEventModel.created_at.desc())
        .first()
    )
    return previous.hash_current if previous else None


def log_system_event(
    db: Session,
    user: UserModel,
    event_type: str,
    entity_type: str,
    entity_id: str,
    payload: Optional[Dict[str, Any]] = None,
) -> SystemEventModel:
    previous_hash = get_previous_system_event_hash(user, db)
    canonical_payload = canonical_json(payload or {})
    current_hash = sha256_hex(f"{previous_hash or ''}|{event_type}|{entity_type}|{entity_id}|{canonical_payload}")
    event = SystemEventModel(
        event_id=prefixed_id("evt"),
        company_id=user.company_id,
        user_id=user.user_id,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload or {},
        hash_previous=previous_hash,
        hash_current=current_hash,
    )
    db.add(event)
    return event


def company_filter(query, model, user: UserModel):
    return query.filter(model.company_id == user.company_id)


def first_or_404(query, detail: str):
    instance = query.first()
    if not instance:
        raise HTTPException(status_code=404, detail=detail)
    return instance


def get_default_warehouse(user: UserModel, db: Session) -> WarehouseModel:
    warehouse = company_filter(db.query(WarehouseModel), WarehouseModel, user).order_by(WarehouseModel.created_at.asc()).first()
    if not warehouse:
        raise HTTPException(status_code=400, detail="No warehouse available")
    return warehouse


def resolve_warehouse_id(user: UserModel, db: Session, warehouse_id: Optional[str]) -> str:
    if warehouse_id:
        warehouse = company_filter(db.query(WarehouseModel), WarehouseModel, user).filter(WarehouseModel.warehouse_id == warehouse_id).first()
        if not warehouse:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        return warehouse.warehouse_id
    return get_default_warehouse(user, db).warehouse_id


def get_or_create_inventory_item(db: Session, user: UserModel, product_id: str, warehouse_id: str) -> InventoryModel:
    item = company_filter(db.query(InventoryModel), InventoryModel, user).filter(
        InventoryModel.product_id == product_id,
        InventoryModel.warehouse_id == warehouse_id,
    ).first()
    if item:
        return item

    item = InventoryModel(
        inventory_id=prefixed_id("inv"),
        product_id=product_id,
        warehouse_id=warehouse_id,
        quantity=0,
        min_stock=0,
        company_id=user.company_id,
    )
    db.add(item)
    db.flush()
    return item


def adjust_inventory_stock(
    db: Session,
    user: UserModel,
    items: List[Dict[str, Any]],
    warehouse_id: str,
    movement: str,
) -> None:
    multiplier = 1 if movement == "in" else -1
    for line in items:
        product_id = line.get("product_id")
        quantity = int(line.get("quantity", 0) or 0)
        if not product_id or quantity <= 0:
            continue

        inventory_item = get_or_create_inventory_item(db, user, product_id, warehouse_id)
        new_quantity = int(inventory_item.quantity or 0) + (quantity * multiplier)
        if new_quantity < 0:
            product = company_filter(db.query(ProductModel), ProductModel, user).filter(ProductModel.product_id == product_id).first()
            product_name = product.name if product else product_id
            raise HTTPException(status_code=400, detail=f"Stock insuficiente para {product_name} en el almacen seleccionado")
        inventory_item.quantity = new_quantity
        inventory_item.updated_at = datetime.now(timezone.utc)


def enrich_products_with_inventory(products: List[ProductModel], user: UserModel, db: Session) -> List[Dict[str, Any]]:
    product_ids = [product.product_id for product in products]
    inventory_items = (
        company_filter(db.query(InventoryModel), InventoryModel, user)
        .filter(InventoryModel.product_id.in_(product_ids))
        .all()
        if product_ids
        else []
    )
    warehouses = company_filter(db.query(WarehouseModel), WarehouseModel, user).all()
    warehouse_names = {warehouse.warehouse_id: warehouse.name for warehouse in warehouses}
    inventory_by_product: Dict[str, List[Dict[str, Any]]] = {}

    for item in inventory_items:
        inventory_by_product.setdefault(item.product_id, []).append(
            {
                "warehouse_id": item.warehouse_id,
                "warehouse_name": warehouse_names.get(item.warehouse_id, item.warehouse_id),
                "quantity": item.quantity,
                "min_stock": item.min_stock,
            }
        )

    enriched: List[Dict[str, Any]] = []
    for product in products:
        data = model_to_dict(product)
        stock_lines = inventory_by_product.get(product.product_id, [])
        data["stock_by_warehouse"] = stock_lines
        data["stock_total"] = sum(line["quantity"] for line in stock_lines)
        enriched.append(data)
    return enriched


def enrich_invoice_like(item: Any, user: Optional[UserModel] = None, db: Optional[Session] = None) -> Dict[str, Any]:
    data = model_to_dict(item)
    data["outstanding_amount"] = 0 if data.get("status") == "paid" else float(data.get("total") or 0)
    if user and db and isinstance(item, InvoiceModel):
        record = latest_invoice_record(item.invoice_id, user, db)
        data["fiscal_record_status"] = record.record_type if record else None
        data["fiscal_record_hash"] = record.hash_current if record else None
    return data


def enrich_transfer(item: StockTransferModel) -> Dict[str, Any]:
    data = model_to_dict(item)
    data["items_count"] = sum(int(line.get("quantity", 0) or 0) for line in (item.items or []))
    return data


def get_invoice_inventory_warehouse_id(db: Session, user: UserModel, invoice: Any, invoice_kind: str) -> str:
    if invoice_kind == "sales" and getattr(invoice, "order_id", None):
        order = company_filter(db.query(OrderModel), OrderModel, user).filter(OrderModel.order_id == invoice.order_id).first()
        if order and order.warehouse_id:
            return order.warehouse_id

    if invoice_kind == "purchase" and getattr(invoice, "po_id", None):
        purchase_order = company_filter(db.query(PurchaseOrderModel), PurchaseOrderModel, user).filter(
            PurchaseOrderModel.po_id == invoice.po_id
        ).first()
        if purchase_order and purchase_order.warehouse_id:
            return purchase_order.warehouse_id

    return get_default_warehouse(user, db).warehouse_id


def build_invoice_canonical_payload(invoice: InvoiceModel, company: CompanyModel) -> Dict[str, Any]:
    return {
        "company_id": company.company_id,
        "company_name": company.legal_name or company.name,
        "company_tax_id": company.tax_id,
        "invoice_id": invoice.invoice_id,
        "series": invoice.series,
        "number": invoice.number,
        "invoice_number": invoice.invoice_number,
        "issue_date": serialize_datetime(invoice.issue_date),
        "operation_date": serialize_datetime(invoice.operation_date),
        "invoice_type": invoice.invoice_type,
        "simplified": invoice.simplified,
        "rectified_invoice_id": invoice.rectified_invoice_id,
        "status": invoice.status,
        "client_id": invoice.client_id,
        "client_name": invoice.client_name,
        "currency": invoice.currency,
        "subtotal": invoice.subtotal,
        "tax": invoice.tax,
        "total": invoice.total,
        "items": invoice.items or [],
    }


def get_previous_invoice_record_hash(user: UserModel, db: Session) -> Optional[str]:
    previous = (
        company_filter(db.query(InvoiceRecordModel), InvoiceRecordModel, user)
        .order_by(InvoiceRecordModel.generated_at.desc())
        .first()
    )
    return previous.hash_current if previous else None


def create_invoice_record(
    db: Session,
    user: UserModel,
    company: CompanyModel,
    invoice: InvoiceModel,
    record_type: str,
    extra_payload: Optional[Dict[str, Any]] = None,
) -> InvoiceRecordModel:
    payload = build_invoice_canonical_payload(invoice, company)
    if extra_payload:
        payload.update(extra_payload)
    canonical_payload = canonical_json(payload)
    previous_hash = get_previous_invoice_record_hash(user, db)
    current_hash = sha256_hex(f"{previous_hash or ''}|{record_type}|{canonical_payload}")
    record = InvoiceRecordModel(
        record_id=prefixed_id("irec"),
        invoice_id=invoice.invoice_id,
        company_id=user.company_id,
        record_type=record_type,
        canonical_payload=canonical_payload,
        hash_previous=previous_hash,
        hash_current=current_hash,
        generated_at=datetime.now(timezone.utc),
        signed=False,
        sent_to_aeat=False,
    )
    db.add(record)
    return record


def latest_invoice_record(invoice_id: str, user: UserModel, db: Session) -> Optional[InvoiceRecordModel]:
    return (
        company_filter(db.query(InvoiceRecordModel), InvoiceRecordModel, user)
        .filter(InvoiceRecordModel.invoice_id == invoice_id)
        .order_by(InvoiceRecordModel.generated_at.desc())
        .first()
    )


def build_invoice_pdf_bytes(invoice: InvoiceModel, company: CompanyModel) -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    pdf.setTitle(f"Factura {invoice.invoice_number}")
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(40, height - 50, "Factura")
    pdf.setFont("Helvetica", 10)
    pdf.drawRightString(width - 40, height - 50, invoice.invoice_number)

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(40, height - 90, company.legal_name or company.name)
    pdf.setFont("Helvetica", 10)
    pdf.drawString(40, height - 106, f"NIF/CIF: {company.tax_id or '-'}")
    pdf.drawString(40, height - 122, f"Direccion: {company.address or '-'}")
    pdf.drawString(40, height - 138, f"Email: {company.billing_email or company.email or '-'}")

    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(40, height - 178, "Datos de factura")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(40, height - 194, f"Fecha de emision: {invoice.issue_date.astimezone(timezone.utc).date().isoformat() if invoice.issue_date else '-'}")
    pdf.drawString(40, height - 210, f"Fecha de operacion: {invoice.operation_date.astimezone(timezone.utc).date().isoformat() if invoice.operation_date else '-'}")
    pdf.drawString(40, height - 226, f"Tipo: {invoice.invoice_type}")
    pdf.drawString(40, height - 242, f"Cliente: {invoice.client_name}")
    pdf.drawString(40, height - 258, f"Estado: {invoice.status}")

    y = height - 300
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(40, y, "Descripcion")
    pdf.drawRightString(360, y, "Cantidad")
    pdf.drawRightString(450, y, "Precio")
    pdf.drawRightString(width - 40, y, "Total")
    y -= 14
    pdf.line(40, y, width - 40, y)
    y -= 16

    pdf.setFont("Helvetica", 10)
    for line in invoice.items or []:
        description = str(line.get("product_name") or line.get("description") or "Linea")
        quantity = float(line.get("quantity", 0) or 0)
        price = float(line.get("price", 0) or 0)
        total = float(line.get("total", quantity * price) or 0)

        if y < 120:
            pdf.showPage()
            y = height - 60
            pdf.setFont("Helvetica", 10)

        pdf.drawString(40, y, description[:48])
        pdf.drawRightString(360, y, f"{quantity:.2f}")
        pdf.drawRightString(450, y, f"{price:.2f} EUR")
        pdf.drawRightString(width - 40, y, f"{total:.2f} EUR")
        y -= 18

    y -= 8
    pdf.line(320, y, width - 40, y)
    y -= 18
    pdf.drawRightString(450, y, "Base imponible")
    pdf.drawRightString(width - 40, y, f"{invoice.subtotal:.2f} EUR")
    y -= 16
    pdf.drawRightString(450, y, "IVA")
    pdf.drawRightString(width - 40, y, f"{invoice.tax:.2f} EUR")
    y -= 16
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawRightString(450, y, "Total")
    pdf.drawRightString(width - 40, y, f"{invoice.total:.2f} EUR")

    record_label_y = max(y - 34, 70)
    pdf.setFont("Helvetica", 9)
    pdf.drawString(40, record_label_y, f"Estado VERI*FACTU: {invoice.status}")
    pdf.drawString(40, record_label_y - 14, "Documento generado por el sistema con trazabilidad y cadena hash interna.")

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.getvalue()


def get_return_source_document(db: Session, user: UserModel, return_type: str, source_document_id: str):
    if return_type == "sales":
        invoice = first_or_404(
            company_filter(db.query(InvoiceModel), InvoiceModel, user).filter(InvoiceModel.invoice_id == source_document_id),
            "Sales invoice not found",
        )
        warehouse_id = resolve_warehouse_id(user, db, None)
        if invoice.order_id:
            source_order = company_filter(db.query(OrderModel), OrderModel, user).filter(OrderModel.order_id == invoice.order_id).first()
            if source_order and source_order.warehouse_id:
                warehouse_id = source_order.warehouse_id
        return {
            "source_model": invoice,
            "warehouse_id": warehouse_id,
            "partner_id": invoice.client_id,
            "partner_name": invoice.client_name,
            "items": invoice.items or [],
            "number": invoice.invoice_number,
        }

    if return_type == "purchase":
        purchase_invoice = first_or_404(
            company_filter(db.query(PurchaseInvoiceModel), PurchaseInvoiceModel, user).filter(PurchaseInvoiceModel.pinv_id == source_document_id),
            "Purchase invoice not found",
        )
        warehouse_id = resolve_warehouse_id(user, db, None)
        if purchase_invoice.po_id:
            source_po = company_filter(db.query(PurchaseOrderModel), PurchaseOrderModel, user).filter(PurchaseOrderModel.po_id == purchase_invoice.po_id).first()
            if source_po and source_po.warehouse_id:
                warehouse_id = source_po.warehouse_id
        return {
            "source_model": purchase_invoice,
            "warehouse_id": warehouse_id,
            "partner_id": purchase_invoice.supplier_id,
            "partner_name": purchase_invoice.supplier_name,
            "items": purchase_invoice.items or [],
            "number": purchase_invoice.invoice_number,
        }

    raise HTTPException(status_code=400, detail="Invalid return type")


def build_return_items(source_items: List[Dict[str, Any]], requested_items: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], float]:
    if not requested_items:
        raise HTTPException(status_code=400, detail="Return must include at least one item")

    source_index = {item.get("product_id"): item for item in source_items}
    built_items: List[Dict[str, Any]] = []
    subtotal = 0.0

    for line in requested_items:
        product_id = line.get("product_id")
        quantity = int(line.get("quantity", 0) or 0)
        if not product_id or quantity <= 0:
            continue
        source_line = source_index.get(product_id)
        if not source_line:
            raise HTTPException(status_code=400, detail="One of the return items does not belong to the source document")
        source_quantity = int(source_line.get("quantity", 0) or 0)
        if quantity > source_quantity:
            raise HTTPException(status_code=400, detail="Return quantity exceeds original document quantity")
        price = float(source_line.get("price", 0) or 0)
        total = quantity * price
        built_items.append(
            {
                "product_id": product_id,
                "product_name": source_line.get("product_name"),
                "quantity": quantity,
                "price": price,
                "total": total,
            }
        )
        subtotal += total

    if not built_items:
        raise HTTPException(status_code=400, detail="Return must include at least one valid item")
    return built_items, subtotal


def query_report_rows(
    report_type: str,
    user: UserModel,
    db: Session,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    client_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
    status: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_direction: str = "desc",
) -> List[Dict[str, Any]]:
    if report_type == "inventory":
        rows = [model_to_dict(item) for item in company_filter(db.query(InventoryModel), InventoryModel, user).all()]
        if sort_by == "quantity":
            rows.sort(key=lambda item: item.get("quantity", 0), reverse=sort_direction == "desc")
        return rows

    model_map = {
        "clients": ClientModel,
        "suppliers": SupplierModel,
        "products": ProductModel,
        "orders": OrderModel,
        "invoices": InvoiceModel,
        "purchase-orders": PurchaseOrderModel,
        "purchase-invoices": PurchaseInvoiceModel,
        "returns": ReturnModel,
        "stock-transfers": StockTransferModel,
    }
    model = model_map.get(report_type)
    if not model:
        raise HTTPException(status_code=400, detail="Invalid report type")

    query = company_filter(db.query(model), model, user)
    date_from_value = parse_iso_datetime(date_from) if date_from else None
    date_to_value = parse_iso_datetime(date_to) if date_to else None
    if date_from_value:
        query = query.filter(model.created_at >= date_from_value)
    if date_to_value:
        query = query.filter(model.created_at <= date_to_value + timedelta(days=1))

    if client_id and hasattr(model, "client_id"):
        query = query.filter(model.client_id == client_id)
    if supplier_id and hasattr(model, "supplier_id"):
        query = query.filter(model.supplier_id == supplier_id)
    if status and hasattr(model, "status"):
        query = query.filter(model.status == status)

    if sort_by and hasattr(model, sort_by):
        order_column = getattr(model, sort_by)
        query = query.order_by(order_column.asc() if sort_direction == "asc" else order_column.desc())
    elif hasattr(model, "created_at"):
        query = query.order_by(model.created_at.desc())

    items = query.all()
    if model in {InvoiceModel, PurchaseInvoiceModel}:
        return [enrich_invoice_like(item, user if model is InvoiceModel else None, db if model is InvoiceModel else None) for item in items]
    if model is StockTransferModel:
        return [enrich_transfer(item) for item in items]
    return [model_to_dict(item) for item in items]


def dataframe_for_report(rows: List[Dict[str, Any]]) -> pd.DataFrame:
    normalized_rows: List[Dict[str, Any]] = []
    for row in rows:
        normalized = {}
        for key, value in row.items():
            if isinstance(value, (list, dict)):
                normalized[key] = json.dumps(value, ensure_ascii=False)
            else:
                normalized[key] = value
        normalized_rows.append(normalized)
    return pd.DataFrame(normalized_rows)


def build_pdf_report(title: str, rows: List[Dict[str, Any]]) -> bytes:
    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=landscape(A4))
    width, height = landscape(A4)
    y = height - 40
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(40, y, title)
    y -= 24
    pdf.setFont("Helvetica", 9)

    if not rows:
        pdf.drawString(40, y, "No hay datos para este informe")
    else:
        columns = list(rows[0].keys())[:6]
        column_width = (width - 80) / max(len(columns), 1)
        for index, column in enumerate(columns):
            pdf.drawString(40 + (index * column_width), y, str(column)[:24])
        y -= 18

        for row in rows[:60]:
            if y < 40:
                pdf.showPage()
                y = height - 40
                pdf.setFont("Helvetica", 9)
            for index, column in enumerate(columns):
                value = row.get(column, "")
                if isinstance(value, (list, dict)):
                    value = json.dumps(value, ensure_ascii=False)
                pdf.drawString(40 + (index * column_width), y, str(value)[:28])
            y -= 16

    pdf.save()
    output.seek(0)
    return output.getvalue()


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


def is_write_intent(message: str) -> bool:
    normalized = message.lower().strip()
    normalized = "".join(
        char for char in unicodedata.normalize("NFKD", normalized) if not unicodedata.combining(char)
    )
    normalized = normalized.lstrip("¿?¡!.,:; ")
    read_starters = [
        "cuantos",
        "cuantas",
        "muestrame",
        "busca",
        "dime",
        "lista",
        "ensename",
        "cuales",
        "tengo",
        "hay",
        "donde",
        "que ",
    ]
    if any(normalized.startswith(prefix) for prefix in read_starters):
        return False

    write_keywords = [
        "crea",
        "crear",
        "creame",
        "créame",
        "registra",
        "registrar",
        "añade",
        "anade",
        "agrega",
        "modifica",
        "editar",
        "edita",
        "actualiza",
        "borra",
        "elimina",
        "genera un cliente",
        "crea un cliente",
        "crea el cliente",
        "crea una factura",
        "crea un pedido",
    ]
    tokens = set(re.findall(r"[a-z0-9_@.]+", normalized))
    return any(keyword in normalized for keyword in write_keywords) or bool(tokens.intersection(
        {"crear", "crea", "creame", "registra", "registrar", "anade", "agrega", "modifica", "editar", "edita", "actualiza"}
    ))


def clean_json_response(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    return cleaned.strip()


async def extract_erp_action(user_message: str, recent_history_text: str = "") -> Optional[Dict[str, Any]]:
    if not openai_client:
        return None

    response = await openai_client.responses.create(
        model=OPENAI_MODEL,
        input=[
            {
                "role": "system",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Convierte la peticion del usuario en JSON puro para un ERP. "
                            "No expliques nada, devuelve solo JSON. "
                            'Formato: {"intent":"create|update|delete|read|unknown","entity":"client|supplier|product|warehouse|unknown","lookup":{},"data":{}}. '
                              "Rellena solo campos explicitamente pedidos o inferidos de forma muy obvia. "
                              "Ten en cuenta el historial reciente si el usuario usa referencias como 'ese cliente', "
                              "'el anterior' o 'cambiale'. "
                              "Si falta informacion critica para crear o editar, deja los campos faltantes fuera."
                          ),
                      }
                  ],
              },
              {
                  "role": "system",
                  "content": [{"type": "input_text", "text": f"Historial reciente:\n{recent_history_text}"}],
              },
              {"role": "user", "content": [{"type": "input_text", "text": user_message}]},
          ],
      )
    try:
        return json.loads(clean_json_response(response.output_text))
    except json.JSONDecodeError:
        logger.warning("Could not parse action JSON from AI: %s", response.output_text)
        return None


def normalize_value(value: Any) -> Any:
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        return stripped
    return value


def get_lookup_candidates(query, field, value):
    return query.filter(field == value).all()


def resolve_entity_instance(db: Session, model: Any, id_field_name: str, user: UserModel, lookup: Dict[str, Any], extra_fields: List[str]):
    query = company_filter(db.query(model), model, user)
    record_id = normalize_value(lookup.get(id_field_name))
    if record_id:
        return query.filter(getattr(model, id_field_name) == record_id).first()

    for field_name in extra_fields:
        field_value = normalize_value(lookup.get(field_name))
        if field_value:
            results = get_lookup_candidates(query, getattr(model, field_name), field_value)
            if len(results) == 1:
                return results[0]
            if len(results) > 1:
                raise HTTPException(status_code=400, detail=f"Multiple {model.__tablename__} match {field_name}")
    return None


def execute_ai_write_action(action: Dict[str, Any], user: UserModel, db: Session) -> Optional[str]:
    intent = action.get("intent")
    entity = action.get("entity")
    lookup = action.get("lookup") or {}
    data = {key: normalize_value(value) for key, value in (action.get("data") or {}).items()}

    if intent == "delete":
        return "No tengo permiso para eliminar datos desde el asistente IA."

    if intent not in {"create", "update"}:
        return None

    module_name = ENTITY_PERMISSION_MAP.get(entity)
    if not module_name:
        return "Todavia no puedo escribir ese tipo de entidad desde el asistente IA."
    if not user_has_permission(user, f"{module_name}.write"):
        return "Tu rol no tiene permiso para crear o editar ese tipo de datos."

    if entity == "client":
        if intent == "create":
            if not data.get("name"):
                return "Puedo crear el cliente, pero me falta al menos el nombre."
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
            return f"Cliente creado: nombre={item.name}, email={item.email or '-'}, id={item.client_id}"

        item = resolve_entity_instance(db, ClientModel, "client_id", user, lookup, ["email", "name"])
        if not item:
            return "No he encontrado un cliente unico para actualizar."
        for field in ["name", "email", "phone", "address", "tax_id", "type_id", "balance"]:
            if field in data and data[field] is not None:
                setattr(item, field, float(data[field]) if field == "balance" else data[field])
        db.commit()
        db.refresh(item)
        return f"Cliente actualizado: nombre={item.name}, email={item.email or '-'}, id={item.client_id}"

    if entity == "supplier":
        if intent == "create":
            if not data.get("name"):
                return "Puedo crear el proveedor, pero me falta al menos el nombre."
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
            return f"Proveedor creado: nombre={item.name}, email={item.email or '-'}, id={item.supplier_id}"

        item = resolve_entity_instance(db, SupplierModel, "supplier_id", user, lookup, ["email", "name"])
        if not item:
            return "No he encontrado un proveedor unico para actualizar."
        for field in ["name", "email", "phone", "address", "tax_id", "type_id", "balance"]:
            if field in data and data[field] is not None:
                setattr(item, field, float(data[field]) if field == "balance" else data[field])
        db.commit()
        db.refresh(item)
        return f"Proveedor actualizado: nombre={item.name}, email={item.email or '-'}, id={item.supplier_id}"

    if entity == "product":
        if intent == "create":
            if not data.get("name") or not data.get("sku"):
                return "Puedo crear el producto, pero me faltan al menos nombre y SKU."
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
            return f"Producto creado: nombre={item.name}, sku={item.sku}, id={item.product_id}"

        item = resolve_entity_instance(db, ProductModel, "product_id", user, lookup, ["sku", "name"])
        if not item:
            return "No he encontrado un producto unico para actualizar."
        for field in ["sku", "name", "description", "price", "cost", "type_id"]:
            if field in data and data[field] is not None:
                setattr(item, field, float(data[field]) if field in {"price", "cost"} else data[field])
        db.commit()
        db.refresh(item)
        return f"Producto actualizado: nombre={item.name}, sku={item.sku}, id={item.product_id}"

    if entity == "warehouse":
        if intent == "create":
            if not data.get("name"):
                return "Puedo crear el almacen, pero me falta al menos el nombre."
            item = WarehouseModel(
                warehouse_id=prefixed_id("wh"),
                name=data["name"],
                address=data.get("address"),
                company_id=user.company_id,
            )
            db.add(item)
            db.commit()
            db.refresh(item)
            return f"Almacen creado: nombre={item.name}, id={item.warehouse_id}"

        item = resolve_entity_instance(db, WarehouseModel, "warehouse_id", user, lookup, ["name"])
        if not item:
            return "No he encontrado un almacen unico para actualizar."
        for field in ["name", "address"]:
            if field in data and data[field] is not None:
                setattr(item, field, data[field])
        db.commit()
        db.refresh(item)
        return f"Almacen actualizado: nombre={item.name}, id={item.warehouse_id}"

    return "Todavia no puedo escribir ese tipo de entidad desde el asistente IA. Ahora mismo soporto clientes, proveedores, productos y almacenes."


def try_direct_read_response(user_message: str, user: UserModel, db: Session) -> Optional[str]:
    normalized = user_message.strip()

    prefix_match = re.search(
        r'productos?\s+que\s+empiecen\s+por\s+["“]?([A-Za-z0-9ÁÉÍÓÚáéíóúÑñ])["”]?',
        normalized,
        re.IGNORECASE,
    )
    if prefix_match:
        if not user_has_permission(user, "products.read"):
            return "Tu rol no tiene permiso para consultar productos."
        prefix = prefix_match.group(1)
        products = (
            company_filter(db.query(ProductModel), ProductModel, user)
            .filter(ProductModel.name.ilike(f"{prefix}%"))
            .order_by(ProductModel.name.asc())
            .all()
        )
        if not products:
            return f"No hay productos que empiecen por '{prefix}'."
        lines = [f"{index}. {item.name} - SKU: {item.sku} - Precio: {item.price}" for index, item in enumerate(products, start=1)]
        return f"Aqui tienes los productos que empiezan por '{prefix}':\n\n" + "\n".join(lines)

    return None


@app.on_event("startup")
def startup() -> None:
    apply_public_migrations()
    PublicBase.metadata.create_all(bind=engine)
    with PublicSessionLocal() as db:
        seed_legal_documents(db)
        companies = db.query(CompanyModel).all()
        for company in companies:
            ensure_schema_exists(company.schema_name)
            apply_tenant_migrations(company.schema_name)
            tenant_bind = get_tenant_bind(company.schema_name)
            TenantBase.metadata.create_all(bind=tenant_bind)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/public/legal-documents")
def get_public_legal_documents(db: Session = Depends(get_public_db)) -> List[Dict[str, Any]]:
    seed_legal_documents(db)
    return [
        model_to_dict(document)
        for document in get_active_legal_documents(db)
    ]


@app.get("/api/legal-documents")
def get_legal_documents(user: UserModel = Depends(get_current_user), db: Session = Depends(get_public_db)) -> List[Dict[str, Any]]:
    require_permission(user, "settings.read")
    return [model_to_dict(document) for document in get_active_legal_documents(db)]


@app.post("/api/legal-documents/publish")
def publish_legal_document(
    data: LegalDocumentPublishInput,
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_public_db),
) -> Dict[str, Any]:
    require_permission(user, "settings.write")
    code = data.code.strip().lower()
    version = data.version.strip()
    title = data.title.strip()
    content = data.content.strip()
    if not code or not version or not title or not content:
        raise HTTPException(status_code=400, detail="Code, version, title and content are required")

    existing_same_version = (
        db.query(LegalDocumentModel)
        .filter(LegalDocumentModel.code == code, LegalDocumentModel.version == version)
        .first()
    )
    if existing_same_version:
        existing_same_version.title = title
        existing_same_version.content = content
        existing_same_version.requires_acceptance = data.requires_acceptance
        existing_same_version.is_active = True
        item = existing_same_version
    else:
        item = LegalDocumentModel(
            document_id=prefixed_id("ldoc"),
            code=code,
            version=version,
            title=title,
            content=content,
            requires_acceptance=data.requires_acceptance,
            is_active=True,
            published_at=datetime.now(timezone.utc),
        )
        db.add(item)

    older_versions = (
        db.query(LegalDocumentModel)
        .filter(LegalDocumentModel.code == code, LegalDocumentModel.document_id != item.document_id)
        .all()
    )
    for older in older_versions:
        older.is_active = False

    log_security_event(
        db,
        action="legal_document.published",
        company_id=user.company_id,
        user_id=user.user_id,
        entity_type="legal_document",
        entity_id=code,
        metadata_json={"version": version},
    )
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.get("/api/legal-acceptances")
def get_legal_acceptances(user: UserModel = Depends(get_current_user), db: Session = Depends(get_public_db)) -> List[Dict[str, Any]]:
    require_permission(user, "settings.read")
    items = (
        db.query(LegalAcceptanceModel)
        .filter(LegalAcceptanceModel.company_id == user.company_id)
        .order_by(LegalAcceptanceModel.accepted_at.desc())
        .all()
    )
    return [model_to_dict(item) for item in items]


@app.get("/api/legal-documents/pending")
def get_pending_legal_documents(user: UserModel = Depends(get_current_user), db: Session = Depends(get_public_db)) -> List[Dict[str, Any]]:
    return get_required_legal_reacceptances(db, user)


@app.post("/api/legal-acceptances")
def accept_legal_documents(
    items: List[LegalAcceptanceInput],
    request: Request,
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_public_db),
) -> Dict[str, str]:
    require_permission(user, "settings.read")
    for item in items:
        if not item.accepted:
            continue
        document = (
            db.query(LegalDocumentModel)
            .filter(
                LegalDocumentModel.code == item.document_code,
                LegalDocumentModel.version == item.document_version,
                LegalDocumentModel.is_active.is_(True),
            )
            .first()
        )
        if not document:
            raise HTTPException(status_code=400, detail=f"Documento legal invalido: {item.document_code}")
        existing = (
            db.query(LegalAcceptanceModel)
            .filter(
                LegalAcceptanceModel.user_id == user.user_id,
                LegalAcceptanceModel.company_id == user.company_id,
                LegalAcceptanceModel.document_code == item.document_code,
                LegalAcceptanceModel.document_version == item.document_version,
            )
            .first()
        )
        if not existing:
            record_legal_acceptance(db, user.user_id, user.company_id, item.document_code, item.document_version, request)
            log_security_event(
                db,
                action="legal_acceptance.recorded",
                company_id=user.company_id,
                user_id=user.user_id,
                entity_type="legal_document",
                entity_id=item.document_code,
                metadata_json={"version": item.document_version},
            )
    db.commit()
    return {"message": "Legal acceptances stored"}


@app.get("/api/processing-activities")
def get_processing_activities(user: UserModel = Depends(get_current_user), db: Session = Depends(get_public_db)) -> List[Dict[str, Any]]:
    require_permission(user, "settings.read")
    items = db.query(ProcessingActivityModel).order_by(ProcessingActivityModel.title.asc()).all()
    return [model_to_dict(item) for item in items]


@app.post("/api/processing-activities")
def create_processing_activity(
    data: Dict[str, Any],
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_public_db),
) -> Dict[str, Any]:
    require_permission(user, "settings.write")
    code = (data.get("code") or "").strip().lower()
    title = (data.get("title") or "").strip()
    if not code or not title:
        raise HTTPException(status_code=400, detail="Code and title are required")
    existing = db.query(ProcessingActivityModel).filter(ProcessingActivityModel.code == code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Processing activity code already exists")
    item = ProcessingActivityModel(
        activity_id=prefixed_id("rat"),
        code=code,
        title=title,
        purpose=data.get("purpose"),
        legal_basis=data.get("legal_basis"),
        data_categories=data.get("data_categories"),
        data_subject_categories=data.get("data_subject_categories"),
        recipients=data.get("recipients"),
        processors=data.get("processors"),
        retention_period=data.get("retention_period"),
        security_measures=data.get("security_measures"),
        international_transfers=data.get("international_transfers"),
    )
    db.add(item)
    log_security_event(
        db,
        action="privacy.processing_activity_created",
        company_id=user.company_id,
        user_id=user.user_id,
        entity_type="processing_activity",
        entity_id=item.activity_id,
        metadata_json={"code": code},
    )
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.get("/api/security-audit-logs")
def get_security_audit_logs(
    limit: int = Query(default=100, ge=1, le=500),
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_public_db),
) -> List[Dict[str, Any]]:
    require_permission(user, "settings.read")
    items = (
        db.query(SecurityAuditLogModel)
        .filter(
            (SecurityAuditLogModel.company_id == user.company_id)
            | (SecurityAuditLogModel.company_id.is_(None))
        )
        .order_by(SecurityAuditLogModel.created_at.desc())
        .limit(limit)
        .all()
    )
    return [model_to_dict(item) for item in items]


@app.get("/api/privacy/export")
def export_privacy_bundle(user: UserModel = Depends(get_current_user), db: Session = Depends(get_public_db)) -> Dict[str, Any]:
    company = first_or_404(
        db.query(CompanyModel).filter(CompanyModel.company_id == user.company_id),
        "Company not found",
    )
    legal_acceptances = (
        db.query(LegalAcceptanceModel)
        .filter(LegalAcceptanceModel.company_id == user.company_id, LegalAcceptanceModel.user_id == user.user_id)
        .order_by(LegalAcceptanceModel.accepted_at.desc())
        .all()
    )
    log_security_event(
        db,
        action="privacy.export_generated",
        company_id=user.company_id,
        user_id=user.user_id,
        entity_type="user",
        entity_id=user.user_id,
    )
    db.commit()
    return {
        "user": serialize_user(user),
        "company": model_to_dict(company),
        "legal_acceptances": [model_to_dict(item) for item in legal_acceptances],
        "generated_at": serialize_datetime(datetime.now(timezone.utc)),
    }


@app.post("/api/privacy/erasure-request")
def create_erasure_request(user: UserModel = Depends(get_current_user), db: Session = Depends(get_public_db)) -> Dict[str, str]:
    log_security_event(
        db,
        action="privacy.erasure_requested",
        company_id=user.company_id,
        user_id=user.user_id,
        entity_type="user",
        entity_id=user.user_id,
    )
    db.commit()
    return {"message": "Solicitud de supresion registrada para revision interna"}


@app.post("/api/privacy/deactivate-account")
def deactivate_account(user: UserModel = Depends(get_current_user), db: Session = Depends(get_public_db)) -> Dict[str, str]:
    log_security_event(
        db,
        action="privacy.account_deactivated_request",
        company_id=user.company_id,
        user_id=user.user_id,
        entity_type="user",
        entity_id=user.user_id,
    )
    db.commit()
    return {"message": "Solicitud de desactivacion registrada para revision interna"}


@app.post("/api/auth/register")
def register(data: RegisterInput, request: Request, response: Response, db: Session = Depends(get_public_db)) -> Dict[str, Any]:
    existing = db.query(UserModel).filter(UserModel.email == data.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    if not data.accept_terms or not data.accept_privacy:
        raise HTTPException(status_code=400, detail="Debes aceptar terminos y politica de privacidad")

    seed_legal_documents(db)
    schema_name = slugify_schema_name(data.company_name)
    ensure_schema_exists(schema_name)

    terms_document = get_latest_legal_document_by_code(db, "terms")
    privacy_document = get_latest_legal_document_by_code(db, "privacy")
    company = CompanyModel(
        company_id=prefixed_id("comp"),
        schema_name=schema_name,
        name=data.company_name.strip(),
        legal_name=data.company_name.strip(),
        tax_id=data.company_tax_id.strip() if data.company_tax_id else None,
        address=data.company_address.strip() if data.company_address else None,
        phone=data.company_phone.strip() if data.company_phone else None,
        email=data.company_email.lower() if data.company_email else None,
        billing_email=data.company_email.lower() if data.company_email else data.email.lower(),
        fiscal_series_config={"default": {"series": "F", "next_number": 1}},
        verifactu_enabled=True,
        aeat_submission_enabled=False,
    )
    user = UserModel(
        user_id=prefixed_id("user"),
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        name=data.name.strip(),
        role="admin",
        company_id=company.company_id,
    )
    try:
        db.add(company)
        db.add(user)
        db.commit()
        db.refresh(user)
        setattr(user, "company_schema", schema_name)
        record_legal_acceptance(db, user.user_id, company.company_id, terms_document.code, terms_document.version, request)
        record_legal_acceptance(db, user.user_id, company.company_id, privacy_document.code, privacy_document.version, request)
        log_security_event(
            db,
            action="auth.register",
            company_id=company.company_id,
            user_id=user.user_id,
            entity_type="company",
            entity_id=company.company_id,
            metadata_json={"schema_name": schema_name},
        )
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Registration failed for company bootstrap")
        raise HTTPException(status_code=400, detail="No se pudo crear la empresa. Revisa si el email ya existe o si faltan datos obligatorios.") from exc

    tenant_db = TenantSessionLocal(bind=get_tenant_bind(schema_name))
    try:
        apply_tenant_migrations(schema_name)
        warehouse = WarehouseModel(
            warehouse_id=prefixed_id("wh"),
            name="Almacen Principal",
            company_id=company.company_id,
        )
        tenant_db.add(warehouse)
        log_system_event(
            tenant_db,
            user,
            event_type="company.bootstrap",
            entity_type="warehouse",
            entity_id=warehouse.warehouse_id,
            payload={"name": warehouse.name},
        )
        tenant_db.commit()
    except HTTPException:
        tenant_db.rollback()
        raise
    except Exception as exc:
        tenant_db.rollback()
        logger.exception("Tenant bootstrap failed")
        raise HTTPException(status_code=400, detail="La empresa se creo parcialmente, pero fallo la preparacion inicial del tenant.") from exc
    finally:
        tenant_db.close()

    setattr(user, "company", company)
    set_auth_cookie(response, create_access_token(user))
    return serialize_user(user)


@app.post("/api/auth/login")
def login(data: LoginInput, response: Response, db: Session = Depends(get_public_db)) -> Dict[str, Any]:
    user = db.query(UserModel).filter(UserModel.email == data.email.lower()).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    company = db.query(CompanyModel).filter(CompanyModel.company_id == user.company_id).first()
    if not company:
        raise HTTPException(status_code=401, detail="Company not found")
    setattr(user, "company_schema", company.schema_name)
    setattr(user, "company", company)

    log_security_event(
        db,
        action="auth.login",
        company_id=user.company_id,
        user_id=user.user_id,
        entity_type="user",
        entity_id=user.user_id,
        metadata_json={"email": user.email},
    )
    db.commit()
    set_auth_cookie(response, create_access_token(user))
    return serialize_user(user)


@app.get("/api/auth/me")
def get_me(user: UserModel = Depends(get_current_user), db: Session = Depends(get_public_db)) -> Dict[str, Any]:
    company = db.query(CompanyModel).filter(CompanyModel.company_id == user.company_id).first()
    if company:
        setattr(user, "company", company)
    data = serialize_user(user)
    data["pending_legal_documents"] = get_required_legal_reacceptances(db, user)
    return data


@app.post("/api/auth/logout")
def logout(response: Response, user: UserModel = Depends(get_current_user), db: Session = Depends(get_public_db)) -> Dict[str, str]:
    log_security_event(
        db,
        action="auth.logout",
        company_id=user.company_id,
        user_id=user.user_id,
        entity_type="user",
        entity_id=user.user_id,
    )
    db.commit()
    response.delete_cookie("session_token", path="/")
    return {"message": "Logged out"}


@app.post("/api/auth/forgot-password")
def forgot_password(data: ForgotPasswordInput, db: Session = Depends(get_public_db)) -> Dict[str, str]:
    user = db.query(UserModel).filter(UserModel.email == data.email.lower()).first()
    if user:
        send_password_reset_email(user)
    return {"message": "If the account exists, we have sent a password reset email"}


@app.post("/api/auth/reset-password")
def reset_password(data: ResetPasswordInput, db: Session = Depends(get_public_db)) -> Dict[str, str]:
    payload = decode_password_reset_token(data.token)
    user = db.query(UserModel).filter(UserModel.user_id == payload.get("sub")).first()
    if not user or payload.get("pwd") != user.password_hash:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"message": "Password updated"}


@app.get("/api/companies")
def get_companies(user: UserModel = Depends(get_current_user), db: Session = Depends(get_public_db)) -> List[Dict[str, Any]]:
    require_permission(user, "settings.read")
    companies = db.query(CompanyModel).filter(CompanyModel.company_id == user.company_id).all()
    payload = []
    for company in companies:
        data = model_to_dict(company)
        data["pending_legal_documents"] = get_required_legal_reacceptances(db, user)
        payload.append(data)
    return payload


@app.put("/api/companies/{company_id}")
def update_company(
    company_id: str,
    data: Dict[str, Any],
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_public_db),
) -> Dict[str, Any]:
    require_permission(user, "settings.write")
    ensure_company_scope(user, company_id)
    company = first_or_404(db.query(CompanyModel).filter(CompanyModel.company_id == company_id), "Company not found")
    for field in [
        "name",
        "legal_name",
        "tax_id",
        "address",
        "country",
        "phone",
        "email",
        "billing_email",
        "logo_url",
        "fiscal_series_config",
        "verifactu_enabled",
        "aeat_submission_enabled",
    ]:
        if field in data:
            setattr(company, field, data[field])
    log_security_event(
        db,
        action="company.updated",
        company_id=user.company_id,
        user_id=user.user_id,
        entity_type="company",
        entity_id=company.company_id,
        metadata_json={key: data.get(key) for key in data.keys()},
    )
    db.commit()
    db.refresh(company)
    return model_to_dict(company)


@app.get("/api/users")
def get_users(user: UserModel = Depends(get_current_user), db: Session = Depends(get_public_db)) -> List[Dict[str, Any]]:
    require_permission(user, "users.read")
    users = db.query(UserModel).filter(UserModel.company_id == user.company_id).all()
    return [serialize_user(item) for item in users]


@app.post("/api/users")
def create_user(data: CreateUserInput, user: UserModel = Depends(get_current_user), db: Session = Depends(get_public_db)) -> Dict[str, Any]:
    require_permission(user, "users.write")
    role = data.role.strip().lower()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    existing = db.query(UserModel).filter(UserModel.email == data.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = UserModel(
        user_id=prefixed_id("user"),
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        name=data.name.strip(),
        role=role,
        company_id=user.company_id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return serialize_user(new_user)


@app.put("/api/users/{user_id}")
def update_user(user_id: str, data: UpdateUserInput, user: UserModel = Depends(get_current_user), db: Session = Depends(get_public_db)) -> Dict[str, Any]:
    require_permission(user, "users.write")
    target_user = first_or_404(
        db.query(UserModel).filter(UserModel.user_id == user_id, UserModel.company_id == user.company_id),
        "User not found",
    )
    if data.name is not None:
        target_user.name = data.name.strip()
    if data.role is not None:
        role = data.role.strip().lower()
        if role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        if target_user.user_id == user.user_id and role != target_user.role:
            raise HTTPException(status_code=400, detail="You cannot change your own role")
        target_user.role = role
    db.commit()
    db.refresh(target_user)
    return serialize_user(target_user)


def scoped_list(model, user: UserModel, db: Session) -> List[Dict[str, Any]]:
    return [model_to_dict(item) for item in company_filter(db.query(model), model, user).all()]


@app.get("/api/client-types")
def get_client_types(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    require_permission(user, "clients.read")
    return scoped_list(ClientTypeModel, user, db)


@app.post("/api/client-types")
def create_client_type(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "clients.write")
    item = ClientTypeModel(type_id=prefixed_id("ct"), name=data["name"], description=data.get("description"), company_id=user.company_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/client-types/{type_id}")
def delete_client_type(type_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    require_permission(user, "clients.write")
    company_filter(db.query(ClientTypeModel), ClientTypeModel, user).filter(ClientTypeModel.type_id == type_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/clients")
def get_clients(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    require_permission(user, "clients.read")
    return scoped_list(ClientModel, user, db)


@app.get("/api/clients/{client_id}")
def get_client(client_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "clients.read")
    item = first_or_404(company_filter(db.query(ClientModel), ClientModel, user).filter(ClientModel.client_id == client_id), "Client not found")
    return model_to_dict(item)


@app.post("/api/clients")
def create_client(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "clients.write")
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
    require_permission(user, "clients.write")
    item = first_or_404(company_filter(db.query(ClientModel), ClientModel, user).filter(ClientModel.client_id == client_id), "Client not found")
    for field in ["name", "email", "phone", "address", "tax_id", "type_id", "balance"]:
        if field in data:
            setattr(item, field, data[field])
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/clients/{client_id}")
def delete_client(client_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    require_permission(user, "clients.write")
    company_filter(db.query(ClientModel), ClientModel, user).filter(ClientModel.client_id == client_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/supplier-types")
def get_supplier_types(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    require_permission(user, "suppliers.read")
    return scoped_list(SupplierTypeModel, user, db)


@app.post("/api/supplier-types")
def create_supplier_type(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "suppliers.write")
    item = SupplierTypeModel(type_id=prefixed_id("st"), name=data["name"], description=data.get("description"), company_id=user.company_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/supplier-types/{type_id}")
def delete_supplier_type(type_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    require_permission(user, "suppliers.write")
    company_filter(db.query(SupplierTypeModel), SupplierTypeModel, user).filter(SupplierTypeModel.type_id == type_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/suppliers")
def get_suppliers(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    require_permission(user, "suppliers.read")
    return scoped_list(SupplierModel, user, db)


@app.get("/api/suppliers/{supplier_id}")
def get_supplier(supplier_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "suppliers.read")
    item = first_or_404(company_filter(db.query(SupplierModel), SupplierModel, user).filter(SupplierModel.supplier_id == supplier_id), "Supplier not found")
    return model_to_dict(item)


@app.post("/api/suppliers")
def create_supplier(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "suppliers.write")
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
    require_permission(user, "suppliers.write")
    item = first_or_404(company_filter(db.query(SupplierModel), SupplierModel, user).filter(SupplierModel.supplier_id == supplier_id), "Supplier not found")
    for field in ["name", "email", "phone", "address", "tax_id", "type_id", "balance"]:
        if field in data:
            setattr(item, field, data[field])
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/suppliers/{supplier_id}")
def delete_supplier(supplier_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    require_permission(user, "suppliers.write")
    company_filter(db.query(SupplierModel), SupplierModel, user).filter(SupplierModel.supplier_id == supplier_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/product-types")
def get_product_types(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    require_permission(user, "products.read")
    return scoped_list(ProductTypeModel, user, db)


@app.post("/api/product-types")
def create_product_type(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "products.write")
    item = ProductTypeModel(type_id=prefixed_id("pt"), name=data["name"], description=data.get("description"), company_id=user.company_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/product-types/{type_id}")
def delete_product_type(type_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    require_permission(user, "products.write")
    company_filter(db.query(ProductTypeModel), ProductTypeModel, user).filter(ProductTypeModel.type_id == type_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/products")
def get_products(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    require_permission(user, "products.read")
    products = company_filter(db.query(ProductModel), ProductModel, user).order_by(ProductModel.created_at.desc()).all()
    return enrich_products_with_inventory(products, user, db)


@app.get("/api/products/{product_id}")
def get_product(product_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "products.read")
    item = first_or_404(company_filter(db.query(ProductModel), ProductModel, user).filter(ProductModel.product_id == product_id), "Product not found")
    return enrich_products_with_inventory([item], user, db)[0]


@app.post("/api/products")
def create_product(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "products.write")
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
    return enrich_products_with_inventory([item], user, db)[0]


@app.put("/api/products/{product_id}")
def update_product(product_id: str, data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "products.write")
    item = first_or_404(company_filter(db.query(ProductModel), ProductModel, user).filter(ProductModel.product_id == product_id), "Product not found")
    for field in ["sku", "name", "description", "price", "cost", "type_id"]:
        if field in data:
            setattr(item, field, data[field])
    db.commit()
    db.refresh(item)
    return enrich_products_with_inventory([item], user, db)[0]


@app.delete("/api/products/{product_id}")
def delete_product(product_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    require_permission(user, "products.write")
    company_filter(db.query(ProductModel), ProductModel, user).filter(ProductModel.product_id == product_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.post("/api/products/import-csv")
async def import_products_csv(file: UploadFile = File(...), user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    require_permission(user, "products.write")
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
    require_permission(user, "inventory.read")
    return scoped_list(WarehouseModel, user, db)


@app.post("/api/warehouses")
def create_warehouse(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "inventory.write")
    item = WarehouseModel(warehouse_id=prefixed_id("wh"), name=data["name"], address=data.get("address"), company_id=user.company_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.put("/api/warehouses/{warehouse_id}")
def update_warehouse(warehouse_id: str, data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "inventory.write")
    item = first_or_404(company_filter(db.query(WarehouseModel), WarehouseModel, user).filter(WarehouseModel.warehouse_id == warehouse_id), "Warehouse not found")
    for field in ["name", "address"]:
        if field in data:
            setattr(item, field, data[field])
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/warehouses/{warehouse_id}")
def delete_warehouse(warehouse_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    require_permission(user, "inventory.write")
    company_filter(db.query(WarehouseModel), WarehouseModel, user).filter(WarehouseModel.warehouse_id == warehouse_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/inventory")
def get_inventory(warehouse_id: Optional[str] = None, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    require_permission(user, "inventory.read")
    query = company_filter(db.query(InventoryModel), InventoryModel, user)
    if warehouse_id:
        query = query.filter(InventoryModel.warehouse_id == warehouse_id)
    return [model_to_dict(item) for item in query.all()]


@app.post("/api/inventory")
def create_inventory(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "inventory.write")
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
    require_permission(user, "inventory.write")
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
    require_permission(user, "inventory.write")
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
    require_permission(user, "sales.read")
    items = company_filter(db.query(OrderModel), OrderModel, user).order_by(OrderModel.created_at.desc()).all()
    return [model_to_dict(item) for item in items]


@app.get("/api/orders/{order_id}")
def get_order(order_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "sales.read")
    item = first_or_404(company_filter(db.query(OrderModel), OrderModel, user).filter(OrderModel.order_id == order_id), "Order not found")
    return model_to_dict(item)


@app.post("/api/orders")
def create_order(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "sales.write")
    client = first_or_404(company_filter(db.query(ClientModel), ClientModel, user).filter(ClientModel.client_id == data["client_id"]), "Client not found")
    products_by_id = lookup_products(db, user, data.get("items", []))
    items, subtotal = build_line_items(data.get("items", []), products_by_id)
    tax = subtotal * 0.21
    warehouse_id = resolve_warehouse_id(user, db, data.get("warehouse_id"))

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
        warehouse_id=warehouse_id,
        company_id=user.company_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.put("/api/orders/{order_id}")
def update_order(order_id: str, data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "sales.write")
    item = first_or_404(company_filter(db.query(OrderModel), OrderModel, user).filter(OrderModel.order_id == order_id), "Order not found")
    for field in ["status", "warehouse_id"]:
        if field in data:
            setattr(item, field, data[field])
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/orders/{order_id}")
def delete_order(order_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    require_permission(user, "sales.write")
    company_filter(db.query(OrderModel), OrderModel, user).filter(OrderModel.order_id == order_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/system-events")
def get_system_events(
    entity_type: Optional[str] = Query(default=None),
    entity_id: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    if entity_type == "invoice":
        require_permission(user, "sales.read")
    else:
        require_permission(user, "settings.read")
    query = company_filter(db.query(SystemEventModel), SystemEventModel, user)
    if entity_type:
        query = query.filter(SystemEventModel.entity_type == entity_type)
    if entity_id:
        query = query.filter(SystemEventModel.entity_id == entity_id)
    items = query.order_by(SystemEventModel.created_at.desc()).limit(limit).all()
    return [model_to_dict(item) for item in items]


@app.get("/api/invoices")
def get_invoices(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    require_permission(user, "sales.read")
    items = company_filter(db.query(InvoiceModel), InvoiceModel, user).order_by(InvoiceModel.created_at.desc()).all()
    return [enrich_invoice_like(item, user, db) for item in items]


@app.get("/api/invoices/{invoice_id}")
def get_invoice(invoice_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "sales.read")
    item = first_or_404(company_filter(db.query(InvoiceModel), InvoiceModel, user).filter(InvoiceModel.invoice_id == invoice_id), "Invoice not found")
    return enrich_invoice_like(item, user, db)


@app.get("/api/invoices/{invoice_id}/pdf")
def get_invoice_pdf(invoice_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> StreamingResponse:
    require_permission(user, "sales.read")
    invoice = first_or_404(company_filter(db.query(InvoiceModel), InvoiceModel, user).filter(InvoiceModel.invoice_id == invoice_id), "Invoice not found")
    with PublicSessionLocal() as public_db:
        company = first_or_404(
            public_db.query(CompanyModel).filter(CompanyModel.company_id == user.company_id),
            "Company not found",
        )
    pdf_bytes = build_invoice_pdf_bytes(invoice, company)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{invoice.invoice_number}.pdf"'},
    )


@app.post("/api/invoices")
def create_invoice(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "sales.write")
    source_order = None
    if data.get("order_id"):
        source_order = first_or_404(
            company_filter(db.query(OrderModel), OrderModel, user).filter(OrderModel.order_id == data["order_id"]),
            "Order not found",
        )
        existing_invoice = company_filter(db.query(InvoiceModel), InvoiceModel, user).filter(InvoiceModel.order_id == source_order.order_id).first()
        if existing_invoice:
            raise HTTPException(status_code=400, detail="This order is already linked to a sales invoice")

    client_id = data.get("client_id") or (source_order.client_id if source_order else None)
    if not client_id:
        raise HTTPException(status_code=400, detail="Client is required")
    client = first_or_404(company_filter(db.query(ClientModel), ClientModel, user).filter(ClientModel.client_id == client_id), "Client not found")

    raw_items = data.get("items") or (source_order.items if source_order else [])
    if not raw_items:
        raise HTTPException(status_code=400, detail="Invoice must include at least one item")
    products_by_id = lookup_products(db, user, raw_items)
    items, subtotal = build_line_items(raw_items, products_by_id)
    warehouse_id = resolve_warehouse_id(user, db, data.get("warehouse_id") or (source_order.warehouse_id if source_order else None))
    tax = subtotal * 0.21
    series = (data.get("series") or "F").strip().upper()
    invoice_type = (data.get("invoice_type") or "complete").strip().lower()
    simplified = bool(data.get("simplified", False))
    next_number = get_next_invoice_number(series, user, db)

    item = InvoiceModel(
        invoice_id=prefixed_id("inv"),
        series=series,
        number=next_number,
        invoice_number=f"{series}-{str(next_number).zfill(6)}",
        client_id=client.client_id,
        client_name=client.name,
        order_id=source_order.order_id if source_order else data.get("order_id"),
        issue_date=parse_iso_datetime(data.get("issue_date")) or datetime.now(timezone.utc),
        operation_date=parse_iso_datetime(data.get("operation_date")) or datetime.now(timezone.utc),
        invoice_type=invoice_type,
        simplified=simplified,
        rectified_invoice_id=data.get("rectified_invoice_id"),
        items=items,
        subtotal=subtotal,
        tax=tax,
        total=subtotal + tax,
        currency=data.get("currency", "EUR"),
        status="issued",
        immutable_at=datetime.now(timezone.utc),
        due_date=parse_iso_datetime(data.get("due_date")),
        company_id=user.company_id,
    )
    adjust_inventory_stock(db, user, items, warehouse_id, movement="out")
    db.add(item)
    with PublicSessionLocal() as public_db:
        company = first_or_404(
            public_db.query(CompanyModel).filter(CompanyModel.company_id == user.company_id),
            "Company not found",
        )
        create_invoice_record(db, user, company, item, "alta")
    log_system_event(
        db,
        user,
        event_type="invoice.issued",
        entity_type="invoice",
        entity_id=item.invoice_id,
        payload={"invoice_number": item.invoice_number, "total": item.total, "series": item.series, "number": item.number},
    )
    db.commit()
    db.refresh(item)
    return enrich_invoice_like(item, user, db)


@app.put("/api/invoices/{invoice_id}")
def update_invoice(invoice_id: str, data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "sales.write")
    item = first_or_404(company_filter(db.query(InvoiceModel), InvoiceModel, user).filter(InvoiceModel.invoice_id == invoice_id), "Invoice not found")
    forbidden_fields = {"items", "subtotal", "tax", "total", "client_id", "client_name", "series", "number", "invoice_number"}
    if any(field in data for field in forbidden_fields):
        raise HTTPException(status_code=400, detail="Issued invoices are immutable. Use a rectificative invoice instead.")
    if "status" in data:
        item.status = data["status"]
    if data.get("due_date"):
        item.due_date = parse_iso_datetime(data["due_date"])
    if data.get("status") == "paid" and not item.paid_date:
        item.paid_date = datetime.now(timezone.utc)
    log_system_event(
        db,
        user,
        event_type="invoice.updated",
        entity_type="invoice",
        entity_id=item.invoice_id,
        payload={"status": item.status, "due_date": serialize_datetime(item.due_date)},
    )
    db.commit()
    db.refresh(item)
    return enrich_invoice_like(item, user, db)


@app.delete("/api/invoices/{invoice_id}")
def delete_invoice(invoice_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    require_permission(user, "sales.write")
    raise HTTPException(status_code=400, detail="Issued invoices cannot be deleted. Use cancellation or rectification.")


@app.post("/api/invoices/{invoice_id}/cancel")
def cancel_invoice(invoice_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "sales.write")
    item = first_or_404(company_filter(db.query(InvoiceModel), InvoiceModel, user).filter(InvoiceModel.invoice_id == invoice_id), "Invoice not found")
    if item.status == "cancelled":
        raise HTTPException(status_code=400, detail="Invoice already cancelled")
    item.status = "cancelled"
    with PublicSessionLocal() as public_db:
        company = first_or_404(
            public_db.query(CompanyModel).filter(CompanyModel.company_id == user.company_id),
            "Company not found",
        )
        create_invoice_record(db, user, company, item, "anulacion", {"cancelled_at": serialize_datetime(datetime.now(timezone.utc))})
    log_system_event(
        db,
        user,
        event_type="invoice.cancelled",
        entity_type="invoice",
        entity_id=item.invoice_id,
        payload={"invoice_number": item.invoice_number},
    )
    db.commit()
    db.refresh(item)
    return enrich_invoice_like(item, user, db)


@app.post("/api/invoices/{invoice_id}/rectify")
def rectify_invoice(invoice_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "sales.write")
    source_invoice = first_or_404(
        company_filter(db.query(InvoiceModel), InvoiceModel, user).filter(InvoiceModel.invoice_id == invoice_id),
        "Invoice not found",
    )
    series = "R"
    next_number = get_next_invoice_number(series, user, db)
    rectified_items = []
    subtotal = 0.0
    for item in source_invoice.items or []:
        quantity = int(item.get("quantity", 0) or 0)
        price = float(item.get("price", 0) or 0)
        total = quantity * price * -1
        rectified_items.append(
            {
                "product_id": item.get("product_id"),
                "product_name": item.get("product_name"),
                "quantity": quantity,
                "price": price * -1,
                "total": total,
            }
        )
        subtotal += total
    rectified_invoice = InvoiceModel(
        invoice_id=prefixed_id("inv"),
        series=series,
        number=next_number,
        invoice_number=f"{series}-{str(next_number).zfill(6)}",
        client_id=source_invoice.client_id,
        client_name=source_invoice.client_name,
        order_id=source_invoice.order_id,
        issue_date=datetime.now(timezone.utc),
        operation_date=datetime.now(timezone.utc),
        invoice_type="rectificativa",
        simplified=False,
        rectified_invoice_id=source_invoice.invoice_id,
        items=rectified_items,
        subtotal=subtotal,
        tax=round(subtotal * 0.21, 2),
        total=round(subtotal * 1.21, 2),
        currency=source_invoice.currency or "EUR",
        status="issued",
        immutable_at=datetime.now(timezone.utc),
        due_date=source_invoice.due_date,
        company_id=user.company_id,
    )
    db.add(rectified_invoice)
    with PublicSessionLocal() as public_db:
        company = first_or_404(
            public_db.query(CompanyModel).filter(CompanyModel.company_id == user.company_id),
            "Company not found",
        )
        create_invoice_record(
            db,
            user,
            company,
            rectified_invoice,
            "alta",
            {"rectifies": source_invoice.invoice_number},
        )
    log_system_event(
        db,
        user,
        event_type="invoice.rectified",
        entity_type="invoice",
        entity_id=rectified_invoice.invoice_id,
        payload={"source_invoice_id": source_invoice.invoice_id, "invoice_number": rectified_invoice.invoice_number},
    )
    db.commit()
    db.refresh(rectified_invoice)
    return enrich_invoice_like(rectified_invoice, user, db)


@app.get("/api/invoices/{invoice_id}/records")
def get_invoice_records(invoice_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    require_permission(user, "sales.read")
    records = (
        company_filter(db.query(InvoiceRecordModel), InvoiceRecordModel, user)
        .filter(InvoiceRecordModel.invoice_id == invoice_id)
        .order_by(InvoiceRecordModel.generated_at.asc())
        .all()
    )
    return [model_to_dict(record) for record in records]


@app.get("/api/invoices/{invoice_id}/record-export")
def export_invoice_records(invoice_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> StreamingResponse:
    require_permission(user, "sales.read")
    records = (
        company_filter(db.query(InvoiceRecordModel), InvoiceRecordModel, user)
        .filter(InvoiceRecordModel.invoice_id == invoice_id)
        .order_by(InvoiceRecordModel.generated_at.asc())
        .all()
    )
    if not records:
        raise HTTPException(status_code=404, detail="No fiscal records found")
    log_system_event(
        db,
        user,
        event_type="invoice.records_exported",
        entity_type="invoice",
        entity_id=invoice_id,
        payload={"records": len(records)},
    )
    db.commit()
    payload = json.dumps([model_to_dict(record) for record in records], ensure_ascii=False, indent=2).encode("utf-8")
    return StreamingResponse(
        io.BytesIO(payload),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=invoice-records-{invoice_id}.json"},
    )


@app.get("/api/verifactu/records/export")
def export_verifactu_records(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> StreamingResponse:
    require_permission(user, "reports.read")
    records = (
        company_filter(db.query(InvoiceRecordModel), InvoiceRecordModel, user)
        .order_by(InvoiceRecordModel.generated_at.asc())
        .all()
    )
    with PublicSessionLocal() as public_db:
        company = first_or_404(
            public_db.query(CompanyModel).filter(CompanyModel.company_id == user.company_id),
            "Company not found",
        )
        company_payload = {
            "company_id": company.company_id,
            "name": company.legal_name or company.name,
            "tax_id": company.tax_id,
            "verifactu_enabled": company.verifactu_enabled,
            "aeat_submission_enabled": company.aeat_submission_enabled,
        }
    payload = build_verifactu_export(company_payload, [model_to_dict(record) for record in records])
    adapter_status = get_aeat_adapter().submit_invoice_record(payload)
    payload["aeat_adapter_status"] = adapter_status
    log_system_event(
        db,
        user,
        event_type="verifactu.records_exported",
        entity_type="invoice_record",
        entity_id=user.company_id,
        payload={"records": len(records)},
    )
    db.commit()
    encoded = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    return StreamingResponse(
        io.BytesIO(encoded),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="verifactu-records.json"'},
    )


@app.get("/api/purchase-orders")
def get_purchase_orders(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    require_permission(user, "purchases.read")
    items = company_filter(db.query(PurchaseOrderModel), PurchaseOrderModel, user).order_by(PurchaseOrderModel.created_at.desc()).all()
    return [model_to_dict(item) for item in items]


@app.post("/api/purchase-orders")
def create_purchase_order(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "purchases.write")
    supplier = first_or_404(company_filter(db.query(SupplierModel), SupplierModel, user).filter(SupplierModel.supplier_id == data["supplier_id"]), "Supplier not found")
    products_by_id = lookup_products(db, user, data.get("items", []))
    items, subtotal = build_line_items(data.get("items", []), products_by_id)
    tax = subtotal * 0.21
    warehouse_id = resolve_warehouse_id(user, db, data.get("warehouse_id"))

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
        warehouse_id=warehouse_id,
        company_id=user.company_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.put("/api/purchase-orders/{po_id}")
def update_purchase_order(po_id: str, data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "purchases.write")
    item = first_or_404(company_filter(db.query(PurchaseOrderModel), PurchaseOrderModel, user).filter(PurchaseOrderModel.po_id == po_id), "Purchase order not found")
    for field in ["status", "warehouse_id"]:
        if field in data:
            setattr(item, field, data[field])
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.delete("/api/purchase-orders/{po_id}")
def delete_purchase_order(po_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    require_permission(user, "purchases.write")
    company_filter(db.query(PurchaseOrderModel), PurchaseOrderModel, user).filter(PurchaseOrderModel.po_id == po_id).delete()
    db.commit()
    return {"message": "Deleted"}


@app.get("/api/purchase-invoices")
def get_purchase_invoices(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    require_permission(user, "purchases.read")
    items = company_filter(db.query(PurchaseInvoiceModel), PurchaseInvoiceModel, user).order_by(PurchaseInvoiceModel.created_at.desc()).all()
    return [enrich_invoice_like(item) for item in items]


@app.post("/api/purchase-invoices")
def create_purchase_invoice(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "purchases.write")
    source_po = None
    if data.get("po_id"):
        source_po = first_or_404(
            company_filter(db.query(PurchaseOrderModel), PurchaseOrderModel, user).filter(PurchaseOrderModel.po_id == data["po_id"]),
            "Purchase order not found",
        )
        existing_purchase_invoice = company_filter(db.query(PurchaseInvoiceModel), PurchaseInvoiceModel, user).filter(PurchaseInvoiceModel.po_id == source_po.po_id).first()
        if existing_purchase_invoice:
            raise HTTPException(status_code=400, detail="This purchase order is already linked to a purchase invoice")

    supplier_id = data.get("supplier_id") or (source_po.supplier_id if source_po else None)
    if not supplier_id:
        raise HTTPException(status_code=400, detail="Supplier is required")
    supplier = first_or_404(company_filter(db.query(SupplierModel), SupplierModel, user).filter(SupplierModel.supplier_id == supplier_id), "Supplier not found")

    raw_items = data.get("items") or (source_po.items if source_po else [])
    if not raw_items:
        raise HTTPException(status_code=400, detail="Purchase invoice must include at least one item")
    products_by_id = lookup_products(db, user, raw_items)
    items, subtotal = build_line_items(raw_items, products_by_id)
    warehouse_id = resolve_warehouse_id(user, db, data.get("warehouse_id") or (source_po.warehouse_id if source_po else None))
    tax = subtotal * 0.21
    adjust_inventory_stock(db, user, items, warehouse_id, movement="in")

    item = PurchaseInvoiceModel(
        pinv_id=prefixed_id("pinv"),
        invoice_number=generate_sequence("FC", PurchaseInvoiceModel, user.company_id, db),
        supplier_id=supplier.supplier_id,
        supplier_name=supplier.name,
        po_id=source_po.po_id if source_po else data.get("po_id"),
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
    return enrich_invoice_like(item)


@app.put("/api/purchase-invoices/{pinv_id}")
def update_purchase_invoice(pinv_id: str, data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "purchases.write")
    item = first_or_404(company_filter(db.query(PurchaseInvoiceModel), PurchaseInvoiceModel, user).filter(PurchaseInvoiceModel.pinv_id == pinv_id), "Purchase invoice not found")
    if "status" in data:
        item.status = data["status"]
    if data.get("due_date"):
        item.due_date = parse_iso_datetime(data["due_date"])
    if data.get("status") == "paid" and not item.paid_date:
        item.paid_date = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return enrich_invoice_like(item)


@app.delete("/api/purchase-invoices/{pinv_id}")
def delete_purchase_invoice(pinv_id: str, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, str]:
    require_permission(user, "purchases.write")
    raise HTTPException(
        status_code=400,
        detail="Purchase invoices cannot be deleted once recorded. Use returns and mark the document as cancelled in your accounting flow.",
    )


@app.get("/api/returns")
def get_returns(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    if not (user_has_permission(user, "sales.read") or user_has_permission(user, "purchases.read") or user_has_permission(user, "inventory.read")):
        raise HTTPException(status_code=403, detail="Not authorized for this action")
    items = company_filter(db.query(ReturnModel), ReturnModel, user).order_by(ReturnModel.created_at.desc()).all()
    return [model_to_dict(item) for item in items]


@app.post("/api/returns")
def create_return(data: ReturnInput, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    return_type = data.return_type.strip().lower()
    if return_type == "sales":
        require_permission(user, "sales.write")
    elif return_type == "purchase":
        require_permission(user, "purchases.write")
    else:
        raise HTTPException(status_code=400, detail="Invalid return type")

    source = get_return_source_document(db, user, return_type, data.source_document_id)
    items, subtotal = build_return_items(source["items"], data.items)
    tax = subtotal * 0.21
    warehouse_id = resolve_warehouse_id(user, db, data.warehouse_id or source["warehouse_id"])

    movement = "in" if return_type == "sales" else "out"
    adjust_inventory_stock(db, user, items, warehouse_id, movement=movement)

    item = ReturnModel(
        return_id=prefixed_id("ret"),
        return_number=generate_sequence("DEV", ReturnModel, user.company_id, db),
        return_type=return_type,
        source_document_id=source["source_model"].invoice_id if return_type == "sales" else source["source_model"].pinv_id,
        source_document_number=source["number"],
        partner_id=source["partner_id"],
        partner_name=source["partner_name"],
        warehouse_id=warehouse_id,
        items=items,
        subtotal=subtotal,
        tax=tax,
        total=subtotal + tax,
        reason=data.reason,
        company_id=user.company_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return model_to_dict(item)


@app.get("/api/stock-transfers")
def get_stock_transfers(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    require_permission(user, "inventory.read")
    items = company_filter(db.query(StockTransferModel), StockTransferModel, user).order_by(StockTransferModel.created_at.desc()).all()
    return [enrich_transfer(item) for item in items]


@app.post("/api/stock-transfers")
def create_stock_transfer(data: StockTransferInput, user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "inventory.write")
    if data.source_warehouse_id == data.target_warehouse_id:
        raise HTTPException(status_code=400, detail="Source and target warehouse must be different")
    if not data.items:
        raise HTTPException(status_code=400, detail="Transfer must include at least one item")

    resolve_warehouse_id(user, db, data.source_warehouse_id)
    resolve_warehouse_id(user, db, data.target_warehouse_id)
    transfer_items: List[Dict[str, Any]] = []
    for line in data.items:
        product_id = line.get("product_id")
        quantity = int(line.get("quantity", 0) or 0)
        if not product_id or quantity <= 0:
            continue
        product = first_or_404(company_filter(db.query(ProductModel), ProductModel, user).filter(ProductModel.product_id == product_id), "Product not found")
        transfer_items.append(
            {
                "product_id": product.product_id,
                "product_name": product.name,
                "quantity": quantity,
            }
        )
    if not transfer_items:
        raise HTTPException(status_code=400, detail="Transfer must include at least one valid item")

    adjust_inventory_stock(db, user, transfer_items, data.source_warehouse_id, movement="out")
    adjust_inventory_stock(db, user, transfer_items, data.target_warehouse_id, movement="in")

    item = StockTransferModel(
        transfer_id=prefixed_id("mov"),
        transfer_number=generate_sequence("TRF", StockTransferModel, user.company_id, db),
        source_warehouse_id=data.source_warehouse_id,
        target_warehouse_id=data.target_warehouse_id,
        items=transfer_items,
        notes=data.notes,
        company_id=user.company_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return enrich_transfer(item)


@app.get("/api/reports/dashboard")
def get_dashboard_stats(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "dashboard.read")
    company_id = user.company_id
    clients_count = db.query(ClientModel).filter(ClientModel.company_id == company_id).count() if user_has_permission(user, "clients.read") else 0
    suppliers_count = db.query(SupplierModel).filter(SupplierModel.company_id == company_id).count() if user_has_permission(user, "suppliers.read") else 0
    products_count = db.query(ProductModel).filter(ProductModel.company_id == company_id).count() if user_has_permission(user, "products.read") else 0
    orders = (
        db.query(OrderModel).filter(OrderModel.company_id == company_id).order_by(OrderModel.created_at.desc()).all()
        if user_has_permission(user, "sales.read")
        else []
    )
    invoices = (
        db.query(InvoiceModel).filter(InvoiceModel.company_id == company_id).order_by(InvoiceModel.created_at.desc()).all()
        if user_has_permission(user, "sales.read")
        else []
    )
    purchase_invoices = (
        db.query(PurchaseInvoiceModel).filter(PurchaseInvoiceModel.company_id == company_id).all()
        if user_has_permission(user, "purchases.read")
        else []
    )
    inventory = db.query(InventoryModel).filter(InventoryModel.company_id == company_id).all() if user_has_permission(user, "inventory.read") else []

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
    require_permission(user, "reports.read")
    rows = query_report_rows(report_type, user, db)
    if not rows:
        raise HTTPException(status_code=404, detail="No data to export")

    df = dataframe_for_report(rows)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=report_type)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={report_type}.xlsx"},
    )


@app.get("/api/reports/query/{report_type}")
def get_report_preview(
    report_type: str,
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    client_id: Optional[str] = Query(default=None),
    supplier_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    sort_by: Optional[str] = Query(default=None),
    sort_direction: str = Query(default="desc"),
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    require_permission(user, "reports.read")
    rows = query_report_rows(
        report_type,
        user,
        db,
        date_from=date_from,
        date_to=date_to,
        client_id=client_id,
        supplier_id=supplier_id,
        status=status,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    totals = {
        "rows": len(rows),
        "total_amount": sum(float(row.get("total", 0) or 0) for row in rows),
        "outstanding_amount": sum(float(row.get("outstanding_amount", 0) or 0) for row in rows),
    }
    return {"rows": rows, "totals": totals}


@app.get("/api/reports/export/{report_type}/{file_format}")
def export_report_with_format(
    report_type: str,
    file_format: str,
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    client_id: Optional[str] = Query(default=None),
    supplier_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    sort_by: Optional[str] = Query(default=None),
    sort_direction: str = Query(default="desc"),
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    require_permission(user, "reports.read")
    rows = query_report_rows(
        report_type,
        user,
        db,
        date_from=date_from,
        date_to=date_to,
        client_id=client_id,
        supplier_id=supplier_id,
        status=status,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No data to export")

    if file_format == "excel":
        df = dataframe_for_report(rows)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name=report_type)
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={report_type}.xlsx"},
        )

    if file_format == "pdf":
        pdf_content = build_pdf_report(f"Informe {report_type}", rows)
        return StreamingResponse(
            io.BytesIO(pdf_content),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={report_type}.pdf"},
        )

    raise HTTPException(status_code=400, detail="Invalid export format")


@app.post("/api/reports/email/{report_type}")
def email_report(
    report_type: str,
    data: Dict[str, Any],
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    require_permission(user, "reports.read")
    recipient = data.get("recipient")
    if not recipient:
        raise HTTPException(status_code=400, detail="Recipient email is required")

    file_format = data.get("format", "excel")
    rows = query_report_rows(
        report_type,
        user,
        db,
        date_from=data.get("date_from"),
        date_to=data.get("date_to"),
        client_id=data.get("client_id"),
        supplier_id=data.get("supplier_id"),
        status=data.get("status"),
        sort_by=data.get("sort_by"),
        sort_direction=data.get("sort_direction", "desc"),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No data to export")

    if file_format == "excel":
        df = dataframe_for_report(rows)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name=report_type)
        attachment = {
            "content": output.getvalue(),
            "maintype": "application",
            "subtype": "vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "filename": f"{report_type}.xlsx",
        }
    elif file_format == "pdf":
        attachment = {
            "content": build_pdf_report(f"Informe {report_type}", rows),
            "maintype": "application",
            "subtype": "pdf",
            "filename": f"{report_type}.pdf",
        }
    else:
        raise HTTPException(status_code=400, detail="Invalid email format")

    send_email_message(
        recipient,
        f"Informe {report_type}",
        f"Adjunto encontraras el informe {report_type} generado desde Starxia ERP.",
        attachments=[attachment],
    )
    return {"message": "Report emailed successfully"}


@app.get("/api/statistics/overview")
def get_statistics_overview(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "reports.read")
    invoices = company_filter(db.query(InvoiceModel), InvoiceModel, user).all()
    purchase_invoices = company_filter(db.query(PurchaseInvoiceModel), PurchaseInvoiceModel, user).all()
    products = company_filter(db.query(ProductModel), ProductModel, user).all()
    inventory_items = company_filter(db.query(InventoryModel), InventoryModel, user).all()
    warehouses = company_filter(db.query(WarehouseModel), WarehouseModel, user).all()

    sales_by_month: Dict[str, float] = {}
    purchases_by_month: Dict[str, float] = {}
    product_sales: Dict[str, int] = {}
    warehouse_stock: Dict[str, int] = {warehouse.name: 0 for warehouse in warehouses}
    product_names = {product.product_id: product.name for product in products}
    warehouse_names = {warehouse.warehouse_id: warehouse.name for warehouse in warehouses}

    for invoice in invoices:
        month_key = invoice.created_at.strftime("%Y-%m")
        sales_by_month[month_key] = sales_by_month.get(month_key, 0.0) + float(invoice.total or 0)
        for item in invoice.items or []:
            product_name = product_names.get(item.get("product_id"), item.get("product_name") or "Producto")
            product_sales[product_name] = product_sales.get(product_name, 0) + int(item.get("quantity", 0) or 0)

    for invoice in purchase_invoices:
        month_key = invoice.created_at.strftime("%Y-%m")
        purchases_by_month[month_key] = purchases_by_month.get(month_key, 0.0) + float(invoice.total or 0)

    for inventory_item in inventory_items:
        warehouse_name = warehouse_names.get(inventory_item.warehouse_id, inventory_item.warehouse_id)
        warehouse_stock[warehouse_name] = warehouse_stock.get(warehouse_name, 0) + int(inventory_item.quantity or 0)

    return {
        "sales_by_month": [{"month": month, "total": total} for month, total in sorted(sales_by_month.items())],
        "purchases_by_month": [{"month": month, "total": total} for month, total in sorted(purchases_by_month.items())],
        "top_products": [
            {"name": name, "quantity": quantity}
            for name, quantity in sorted(product_sales.items(), key=lambda item: item[1], reverse=True)[:10]
        ],
        "stock_by_warehouse": [{"warehouse": name, "quantity": quantity} for name, quantity in warehouse_stock.items()],
        "receivables": sum(float(invoice.total or 0) for invoice in invoices if invoice.status != "paid"),
        "payables": sum(float(invoice.total or 0) for invoice in purchase_invoices if invoice.status != "paid"),
    }


@app.get("/api/ai/chat-history")
def get_chat_history(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    require_permission(user, "ai.read")
    items = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.user_id == user.user_id, ChatMessageModel.company_id == user.company_id)
        .order_by(ChatMessageModel.created_at.asc())
        .all()
    )
    return [model_to_dict(item) for item in items]


@app.post("/api/ai/chat")
async def chat_with_ai(data: Dict[str, Any], user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    require_permission(user, "ai.read")
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

    recent_history = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.user_id == user.user_id, ChatMessageModel.company_id == user.company_id)
        .order_by(ChatMessageModel.created_at.desc())
        .limit(8)
        .all()
    )
    history_lines = [
        f"{item.role.upper()}: {item.content}"
        for item in reversed(recent_history)
        if item.message_id != user_msg.message_id
    ]
    history_text = "\n".join(history_lines) if history_lines else "Sin historial previo relevante."

    if is_write_intent(user_message):
        action = await extract_erp_action(user_message, history_text)
        ai_response = execute_ai_write_action(action or {}, user, db) or (
            "He detectado una intencion de escritura, pero no he podido interpretar la accion con suficiente claridad. "
            "Pidemelo indicando la entidad y los campos, por ejemplo: crea el cliente Ana con email ana@empresa.com."
        )
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

    direct_response = try_direct_read_response(user_message, user, db)
    if direct_response:
        assistant_msg = ChatMessageModel(
            message_id=prefixed_id("msg"),
            user_id=user.user_id,
            company_id=user.company_id,
            role="assistant",
            content=direct_response,
        )
        db.add(assistant_msg)
        db.commit()
        return {"response": direct_response, "message_id": assistant_msg.message_id}

    clients = company_filter(db.query(ClientModel), ClientModel, user).limit(20).all() if user_has_permission(user, "clients.read") else []
    suppliers = company_filter(db.query(SupplierModel), SupplierModel, user).limit(20).all() if user_has_permission(user, "suppliers.read") else []
    products = company_filter(db.query(ProductModel), ProductModel, user).limit(20).all() if user_has_permission(user, "products.read") else []
    invoices = (
        company_filter(db.query(InvoiceModel), InvoiceModel, user).order_by(InvoiceModel.created_at.desc()).limit(10).all()
        if user_has_permission(user, "sales.read")
        else []
    )
    orders = (
        company_filter(db.query(OrderModel), OrderModel, user).order_by(OrderModel.created_at.desc()).limit(10).all()
        if user_has_permission(user, "sales.read")
        else []
    )

    context = f"""
Eres un asistente de IA para un ERP. Responde siempre en espanol y de forma concisa.
IMPORTANTE:
  - Solo tienes permisos de lectura en esta parte conversacional.
  - Las altas y ediciones reales se ejecutan fuera de esta respuesta mediante acciones backend.
  - Nunca afirmes que has creado, actualizado o eliminado algo salvo que el backend ya lo haya ejecutado antes de generar esta respuesta.
  - No propongas borrar datos ni sugieras que se ha hecho una eliminacion.
  - Si no encuentras un dato en el contexto, dilo claramente.
  - Ten en cuenta el historial reciente para mantener el hilo de la conversacion.

  HISTORIAL RECIENTE:
  {history_text}
  
CLIENTES:
{[{"nombre": item.name, "email": item.email, "telefono": item.phone, "id": item.client_id} for item in clients]}

PROVEEDORES:
{[{"nombre": item.name, "email": item.email, "telefono": item.phone, "id": item.supplier_id} for item in suppliers]}

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
    require_permission(user, "ai.read")
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
