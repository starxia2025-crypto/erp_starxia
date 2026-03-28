# Starxia ERP en Easypanel

## Arquitectura recomendada

- Servicio `starxia-erp-api`: FastAPI en `backend`
- Servicio `starxia-erp-web`: build estatico React en `frontend`
- Servicio `starxia-erp-db`: Postgres gestionado por Easypanel

## Variables backend

Usa estas variables en el servicio API:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/starxia_erp
JWT_SECRET=pon-aqui-un-secreto-largo-y-unico
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-mini
CORS_ORIGINS=https://app.tudominio.com,https://tudominio.com
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
ACCESS_TOKEN_EXPIRE_DAYS=7
```

## Variables frontend

Usa estas variables en el servicio web:

```env
REACT_APP_BACKEND_URL=https://api.tudominio.com
WDS_SOCKET_PORT=0
ENABLE_HEALTH_CHECK=false
```

## Comandos

### Backend

- Install: `pip install -r requirements.txt`
- Run: `uvicorn server:app --host 0.0.0.0 --port 8000`
- Working directory: `backend`

### Frontend

- Install: `npm install --legacy-peer-deps`
- Build: `npm run build`
- Publish directory: `build`
- Working directory: `frontend`

## Dominios

- `api.tudominio.com` -> servicio backend
- `app.tudominio.com` -> servicio frontend

## Notas

- El backend crea las tablas automaticamente al arrancar por primera vez.
- El primer usuario que se registra crea tambien la empresa y un almacen principal.
- Si quieres usar el dominio raiz para la app, ajusta `CORS_ORIGINS` para incluirlo.
- Si trabajas con HTTPS, deja `COOKIE_SECURE=true`.
- Si haces pruebas en local con HTTP, usa `COOKIE_SECURE=false`.
