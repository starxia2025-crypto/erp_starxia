import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("OPENAI_API_KEY", "")

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import server  # noqa: E402


for table in server.TenantBase.metadata.tables.values():
    table.schema = None


def make_session():
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    server.PublicBase.metadata.create_all(engine)
    server.TenantBase.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    return engine, SessionLocal()


def make_company():
    return server.CompanyModel(
        company_id="comp_test",
        schema_name="tenant_test",
        name="Empresa Demo",
        legal_name="Empresa Demo SL",
        tax_id="B12345678",
        billing_email="billing@example.com",
        fiscal_series_config={"default": {"series": "F", "next_number": 1}},
        verifactu_enabled=True,
        aeat_submission_enabled=False,
    )


def make_user(role="admin"):
    return server.UserModel(
        user_id="user_test",
        email="admin@example.com",
        password_hash="hashed",
        name="Admin",
        role=role,
        company_id="comp_test",
    )


def make_request():
    return SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"), headers={"user-agent": "pytest"})


def make_invoice(invoice_id="inv_1", series="F", number=1, total=121.0):
    now = server.datetime.now(server.timezone.utc)
    return server.InvoiceModel(
        invoice_id=invoice_id,
        series=series,
        number=number,
        invoice_number=f"{series}-{str(number).zfill(6)}",
        client_id="cli_1",
        client_name="Cliente Demo",
        issue_date=now,
        operation_date=now,
        invoice_type="complete",
        simplified=False,
        items=[
            {
                "product_id": "prod_1",
                "product_name": "Producto Demo",
                "quantity": 1,
                "price": 100.0,
                "total": 100.0,
            }
        ],
        subtotal=100.0,
        tax=21.0,
        total=total,
        currency="EUR",
        status="issued",
        immutable_at=now,
        company_id="comp_test",
    )


class ComplianceTests(unittest.TestCase):
    def test_invoice_numbering_is_correlative_by_series(self):
        _, db = make_session()
        try:
            user = make_user()
            db.add_all(
                [
                    make_invoice("inv_a", "F", 1),
                    make_invoice("inv_b", "F", 2),
                    make_invoice("inv_c", "R", 1, total=-121.0),
                ]
            )
            db.commit()

            self.assertEqual(server.get_next_invoice_number("F", user, db), 3)
            self.assertEqual(server.get_next_invoice_number("R", user, db), 2)
        finally:
            db.close()

    def test_issued_invoice_cannot_be_deleted(self):
        _, db = make_session()
        try:
            with self.assertRaises(server.HTTPException) as exc:
                server.delete_invoice("inv_1", make_user(), db)
            self.assertEqual(exc.exception.status_code, 400)
            self.assertIn("cannot be deleted", exc.exception.detail)
        finally:
            db.close()

    def test_rectificative_invoice_is_created_linked_to_source(self):
        engine, db = make_session()
        original_public_session = server.PublicSessionLocal
        server.PublicSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
        try:
            company = make_company()
            user = make_user()
            source_invoice = make_invoice("inv_src", "F", 1, total=121.0)
            db.add(company)
            db.add(source_invoice)
            db.commit()

            rectified = server.rectify_invoice("inv_src", user, db)
            self.assertEqual(rectified["invoice_type"], "rectificativa")
            self.assertEqual(rectified["rectified_invoice_id"], "inv_src")
            self.assertEqual(rectified["series"], "R")

            created_records = db.query(server.InvoiceRecordModel).filter(server.InvoiceRecordModel.invoice_id == rectified["invoice_id"]).all()
            self.assertEqual(len(created_records), 1)
            self.assertEqual(created_records[0].record_type, "alta")
        finally:
            server.PublicSessionLocal = original_public_session
            db.close()

    def test_invoice_record_hash_chain_links_previous_record(self):
        _, db = make_session()
        try:
            company = make_company()
            user = make_user()
            invoice_one = make_invoice("inv_1", "F", 1)
            invoice_two = make_invoice("inv_2", "F", 2)
            db.add(company)
            db.add(invoice_one)
            db.add(invoice_two)
            db.flush()

            first_record = server.create_invoice_record(db, user, company, invoice_one, "alta")
            db.flush()
            second_record = server.create_invoice_record(db, user, company, invoice_two, "alta")
            db.flush()

            self.assertIsNone(first_record.hash_previous)
            self.assertEqual(second_record.hash_previous, first_record.hash_current)
            self.assertTrue(second_record.hash_current)
        finally:
            db.close()

    def test_legal_acceptance_is_stored_with_technical_evidence(self):
        _, db = make_session()
        try:
            acceptance = server.record_legal_acceptance(
                db,
                user_id="user_test",
                company_id="comp_test",
                document_code="terms",
                document_version="2026.03",
                request=make_request(),
            )
            db.commit()

            self.assertTrue(acceptance.accepted)
            self.assertEqual(acceptance.ip_address, "127.0.0.1")
            self.assertEqual(acceptance.user_agent, "pytest")
        finally:
            db.close()

    def test_reacceptance_is_required_when_document_version_changes(self):
        _, db = make_session()
        try:
            db.add_all(
                [
                    make_company(),
                    server.LegalDocumentModel(
                        document_id="ldoc_old",
                        code="terms",
                        version="2026.03",
                        title="Terminos",
                        content="v1",
                        is_active=True,
                        requires_acceptance=True,
                        published_at=server.datetime(2026, 3, 1, tzinfo=server.timezone.utc),
                    ),
                    server.LegalDocumentModel(
                        document_id="ldoc_new",
                        code="terms",
                        version="2026.04",
                        title="Terminos",
                        content="v2",
                        is_active=True,
                        requires_acceptance=True,
                        published_at=server.datetime(2026, 4, 1, tzinfo=server.timezone.utc),
                    ),
                ]
            )
            db.add(
                server.LegalAcceptanceModel(
                    acceptance_id="lacc_1",
                    user_id="user_test",
                    company_id="comp_test",
                    document_code="terms",
                    document_version="2026.03",
                    accepted=True,
                    accepted_at=server.datetime.now(server.timezone.utc),
                )
            )
            db.commit()

            pending = server.get_required_legal_reacceptances(db, make_user())
            self.assertEqual(len(pending), 1)
            self.assertEqual(pending[0]["code"], "terms")
            self.assertEqual(pending[0]["version"], "2026.04")
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
