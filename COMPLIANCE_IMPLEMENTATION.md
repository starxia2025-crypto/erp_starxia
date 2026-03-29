# Compliance Implementation

## Objetivo

Adaptar el ERP SaaS multi-tenant para operar en Espana con una base tecnica y funcional alineada con:

- Reglamento de facturacion espanol.
- Real Decreto 1007/2023.
- Orden HAC/1177/2024.
- RGPD y LOPDGDD.

## Cambios implementados

### 1. Facturacion legal y trazabilidad fiscal

- Se ha reforzado el modelo de `invoices` con:
  - `series`
  - `number`
  - `issue_date`
  - `operation_date`
  - `invoice_type`
  - `simplified`
  - `rectified_invoice_id`
  - `currency`
  - `pdf_path`
  - `immutable_at`
- La numeracion ya es correlativa por serie mediante `get_next_invoice_number`.
- Las facturas emitidas no pueden borrarse. Se bloquea el `DELETE` y se exige anular o rectificar.
- Se permite:
  - anular facturas mediante registro fiscal de `anulacion`
  - generar facturas rectificativas enlazadas a la factura origen
- Se generan registros fiscales inmutables en `invoice_records` con:
  - `record_type`
  - `canonical_payload`
  - `hash_current`
  - `hash_previous`
  - `generated_at`
  - `signed`
  - `sent_to_aeat`
- Se ha normalizado el payload fiscal con `canonical_json`.
- Se ha anadido exportacion estructurada de registros por factura y exportacion global preparada para VERI*FACTU.
- Se ha anadido generacion de PDF legible de factura desde backend.

### 2. Base VERI*FACTU preparada

- Se ha creado `invoice_records` como modelo de dominio para registros de alta y anulacion.
- Se ha creado `system_events` para trazabilidad interna con encadenamiento hash.
- Se ha separado una capa de adaptacion AEAT en `backend/compliance_services.py`:
  - `AeatSubmissionAdapter`
  - `MockAeatSubmissionAdapter`
- El export global de registros incluye estructura preparada para futura remision automatica.
- El estado de cada factura puede consultarse visualmente desde frontend y exportarse.

### 3. RGPD / LOPDGDD

- Se han creado tablas globales para:
  - `legal_documents`
  - `legal_acceptances`
  - `processing_activities`
  - `security_audit_logs`
- En registro de empresa se exige aceptar:
  - terminos y condiciones
  - politica de privacidad
- La aceptacion guarda evidencia tecnica:
  - version del documento
  - fecha y hora
  - IP
  - user agent
  - usuario
  - empresa
- Se ha implementado deteccion de reaceptacion pendiente cuando cambia la version del documento.
- Se ha creado base operativa para derechos:
  - exportacion de datos
  - solicitud de supresion
  - solicitud de desactivacion
- Se ha anadido un modulo inicial de RAT en configuracion con alta de actividades de tratamiento.

### 4. UX legal y de contratacion

- Landing publica con:
  - checkboxes no premarcados
  - enlaces visibles a documentos legales
  - version visible de terminos y privacidad
- Footer legal publico y autenticado con:
  - terminos
  - privacidad
  - cookies
  - encargado del tratamiento
  - contacto legal
- Configuracion de empresa organizada en pestanas:
  - Fiscal
  - Legal
  - Privacidad y datos
- Banner interno si hay documentos pendientes de reaceptacion.

### 5. Seguridad y auditoria

- Se refuerza la auditoria de eventos de:
  - login
  - logout
  - registro
  - aceptaciones legales
  - cambios de empresa
  - exportaciones de privacidad
  - actividades de tratamiento
- Se mantienen contrasenas hasheadas con `passlib/bcrypt`.
- Se soportan roles:
  - owner
  - admin
  - manager
  - sales
  - warehouse
  - employee
  - advisor
- El frontend restringe vistas y el backend aplica permisos por empresa y por rol.
- El asistente IA se apoya en el mismo modelo de permisos del usuario.

## Cobertura normativa aproximada

### Reglamento de facturacion espanol

- Numeracion por serie y correlativa.
- Distincion basica entre factura completa, simplificada y rectificativa.
- Conservacion de informacion esencial y bloqueo de borrado destructivo.

### Real Decreto 1007/2023 y Orden HAC/1177/2024

- Registros de facturacion.
- Trazabilidad.
- Encadenamiento hash.
- Base para inalterabilidad.
- Exportacion estructurada y desacople de futura remision.

### RGPD / LOPDGDD

- Evidencia de aceptacion.
- Versionado documental.
- Registro inicial de actividades de tratamiento.
- Base para derechos del interesado.
- Base de auditoria y seguridad.

## Decisiones de arquitectura

- Se ha mantenido el esquema `public` para identidad global y cumplimiento transversal.
- Cada empresa conserva su schema propio para aislamiento funcional.
- La parte de cumplimiento se ha anadido de forma incremental sobre el backend actual, evitando ruptura del ERP existente.
- Se ha priorizado:
  - trazabilidad
  - no borrado de documentos fiscales emitidos
  - simplicidad operativa
  - base evolutiva para futuras normas

## Tests implementados

Se han anadido pruebas para:

- correlatividad por serie
- bloqueo de borrado de factura emitida
- generacion de factura rectificativa
- cadena hash de registros fiscales
- almacenamiento de aceptacion legal con evidencia tecnica
- reaceptacion cuando cambia la version del documento

## Limitaciones y cautelas

- El contenido juridico de los documentos legales seed es orientativo y debe ser revisado por asesoria.
- La firma avanzada o sello electronico no se ha implementado todavia.
- La remision automatica a AEAT queda preparada pero no activada.
- El RAT es una base funcional inicial, no un modulo experto completo.
- El flujo de ejercicio de derechos registra y soporta solicitudes, pero la ejecucion operativa y validacion juridica de cada caso debe completarse.
- La anulacion de factura se implementa como evento y estado interno; su encaje exacto en todos los supuestos fiscales debe validarse en despliegue real.

## Archivos clave modificados

- `backend/server.py`
- `backend/compliance_services.py`
- `frontend/src/pages/Landing.jsx`
- `frontend/src/pages/Invoices.jsx`
- `frontend/src/pages/Settings.jsx`
- `frontend/src/components/layout/Layout.jsx`
- `frontend/src/components/layout/LegalFooter.jsx`
- `frontend/src/pages/LegalDocumentPage.jsx`
- `tests/test_compliance.py`

## Recomendacion operativa

Antes de uso comercial real:

1. Validar textos legales con asesoria especializada.
2. Validar flujos fiscales con asesor fiscal y proveedor certificado.
3. Ejecutar pruebas end-to-end sobre factura, rectificativa y anulacion.
4. Decidir estrategia final de firma, sello y remision AEAT.
