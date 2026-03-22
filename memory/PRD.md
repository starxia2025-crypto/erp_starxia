# CRM Business Hub - PRD

## Original Problem Statement
Sistema web tipo CRM online, responsive, moderno minimalista con dashboard que contenga:
- Maestro de gestión de clientes, tipos de clientes, pedidos/albaranes, facturas
- Maestro de gestión de proveedores, tipos de proveedores, órdenes de compra, facturas de compra
- Módulo de inventario con posibilidad de subir archivo CSV, tipos de productos
- Módulo de inventario por almacenes
- Informes básicos de gestión con exportación a Excel
- Módulo de enviar emails automáticos (recordatorio de pagos, avisos de cobros)
- Módulo de seguridad multiusuario, multiempresas, multialmacén
- Agente de IA alimentado del sistema para ayudar al usuario

## User Choices
- **IA**: OpenAI GPT-5.2 con Emergent LLM Key
- **Emails**: Gmail API (pendiente de credenciales)
- **Auth**: Google Auth via Emergent
- **Diseño**: Modo oscuro, colores naranja (#FF5500) y negro

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI + Python
- **Database**: MongoDB
- **AI**: OpenAI GPT-5.2 via emergentintegrations
- **Auth**: Emergent Google OAuth

## Core Requirements (Static)
1. Multi-tenant CRM (multi-empresa, multi-almacén, multi-usuario)
2. Gestión completa de clientes con tipos
3. Gestión completa de proveedores con tipos
4. Inventario con importación CSV
5. Pedidos/albaranes y facturas de venta
6. Órdenes de compra y facturas de compra
7. Informes con exportación a Excel
8. Asistente IA integrado
9. Sistema de emails automáticos

## What's Been Implemented (Jan 22, 2026)
- [x] Landing page con Google Auth
- [x] Dashboard con métricas principales
- [x] Gestión de clientes (CRUD completo)
- [x] Tipos de cliente
- [x] Gestión de proveedores (CRUD completo)
- [x] Tipos de proveedor
- [x] Gestión de productos (CRUD + importación CSV)
- [x] Tipos de producto
- [x] Gestión de almacenes
- [x] Inventario por almacén con importación CSV
- [x] Pedidos/Albaranes (crear, ver, actualizar estado)
- [x] Facturas de venta (crear, ver, actualizar estado)
- [x] Órdenes de compra (crear, ver, actualizar estado)
- [x] Facturas de compra (crear, ver, actualizar estado)
- [x] Informes con exportación a Excel (8 tipos de reporte)
- [x] Configuración de empresa
- [x] Asistente IA con GPT-5.2
- [x] Sistema multi-empresa y multi-almacén
- [x] Diseño responsive (móvil, tablet, desktop)
- [x] Tema oscuro con naranja y negro

## Pending Features (P0/P1)
### P0 (Requiere credenciales de usuario)
- [ ] Módulo de emails automáticos (Gmail API) - requiere GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET

### P1 (Mejoras futuras)
- [ ] Notificaciones en tiempo real
- [ ] Dashboard con gráficos avanzados
- [ ] Generación de PDF para facturas
- [ ] Búsqueda avanzada con filtros
- [ ] Historial de cambios/auditoría

## Next Tasks
1. Integrar Gmail API cuando el usuario proporcione credenciales
2. Agregar recordatorios automáticos de pagos
3. Implementar generación de PDF para documentos
4. Agregar más widgets al dashboard
