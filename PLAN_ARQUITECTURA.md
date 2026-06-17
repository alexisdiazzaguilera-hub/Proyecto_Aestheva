# PLAN_ARQUITECTURA.md — Aestheva OS

> Documento de arquitectura para convertir `aestheva-calculadora.html` en una aplicación web real con backend, base de datos y control de acceso por roles.

---

## 1. Hallazgos del Paso 0 — Auditoría

### 1.1 Campos y Lógica del HTML

El archivo `aestheva-calculadora.html` es una aplicación de contabilidad clínica completa (1,902 líneas) con 11 tabs y los siguientes módulos:

#### Entidades capturadas (inputs reales):

| Entidad | Campos clave |
|---|---|
| **Producto** | nombre, categoría, costo_unitario, precio_venta, unidad, stock, stock_mín, rendimiento, notas |
| **Servicio** | nombre, SKU, área (cosmiatra/estético/nutrición), precio_venta, duración_min, equipo |
| **Receta** | servicio → lista de (producto, cantidad) + costo_variable |
| **Venta** | servicio, profesional, precio, método_pago, promo, insumo_estimado |
| **Gasto** | fecha, concepto, categoría, monto |

#### Fórmulas embebidas (todas deben replicarse en backend):

**Costo de servicio:**
```
costoTotal = insumo + banco + comProveedor + comAd1 + comAd2 + deprEquipo + costoFijoServicio

banco          = precio × tasaBanco (0%, 3%, 9%)
comProveedor   = precio × 15%        (estético)
               | $150 fijo           (cosmiatra, sin paquete)
               | precio × 10%        (cosmiatra, paquete)
               | $250 fijo           (nutrición)
costoFijoHora  = $260,000 × 40% / 180h  (estético)
               | $260,000 × 35% / 360h  (cosmiatra, 2 cabinas)
               | $260,000 × 25% / 180h  (nutrición)
deprEquipo     = (costoEquipo / 24 meses) / sesionesAlMes
margen         = precio - costoTotal
margenPct      = margen / precio × 100
```

**Punto de equilibrio:**
```
breakEven = $260,000 / (1 - pctInsumo - pctComision - pctBanco)
metaUtilidad  = ($260,000 + utilidadDeseada) / (1 - totalVariablePct)
```

**Costos de receta:**
```
costoPorAplicación = (rendimiento > 1) ? costoUnitario / rendimiento : costoUnitario
costoReceta = Σ(costoPorAplicación × cantidad) + costoVariable
```

#### Reglas de negocio hardcodeadas (deben migrar a `config_params`):

- Costo fijo mensual: **$260,000**
- Vida útil equipos: **24 meses**
- Costos equipos: Hydrafacial $40k, RF $100k, Bioestimulación $250k, Presoterapia $6k
- Días laborables: 20 L-V + 4 sábados = 24/mes
- Ticket promedio: $2,492

---

### 1.2 Estado del Legacy Java (`DataClientes`)

**Veredicto: código muerto. Descartar.**

- `Paciente.java`: clase de datos sin getters/setters ni lógica. Solo constructor.
- `DataClientes.java`: driver de consola con 2 pacientes hardcodeados. Sin persistencia, sin integración.
- No hay ningún overlap con el sistema COFEPRIS ni con la calculadora HTML.
- **Acción:** ignorar completamente. No preservar.

---

### 1.3 Stack Recomendado

| Capa | Tecnología | Justificación |
|---|---|---|
| **Backend API** | FastAPI 0.111 (Python 3.12) | Async nativo, Pydantic → JSON limpio, OpenAPI auto-generado, ecosistema Python para data science |
| **Base de Datos** | PostgreSQL 16 | Row-Level Security nativa, `NUMERIC(14,2)` para moneda, window functions para KPIs |
| **ORM / Migraciones** | SQLAlchemy 2.0 async + Alembic | Soporte para raw SQL en RLS, migraciones versionadas |
| **Auth** | JWT (python-jose) + bcrypt (passlib) | Stateless, compatible con dos roles |
| **Frontend** | React 18 + Vite | Migrar tabs del HTML uno a uno, reutilizar CSS variables existentes |
| **Despliegue** | Docker Compose → Railway o Render | Un solo desarrollador, bajo overhead operacional |

**Por qué no Django:** Su ORM dificulta `SET LOCAL` de variables de sesión PostgreSQL (necesarias para RLS). **Por qué no Flask:** Sin async nativo, sin validación automática de requests.

---

## 2. Arquitectura de Datos

### 2.1 Esquema de Tablas

```
users           → id, email, display_name, password_hash, role (administrador|recepcionista)
staff           → id, name, area, commission_type, commission_value
equipment       → id, name, internal_key, acquisition_cost, useful_life_months, monthly_sessions_default
products        → id, name, category, unit_cost, sale_price, unit_of_measure, stock_quantity, stock_min, yield_per_unit, notes
services        → id, sku, name, area, sale_price, duration_min, equipment_id, variable_cost
service_recipes → id, service_id, product_id, quantity
clients         → id, full_name, phone_hash   ← PII, acceso solo administrador
client_tokens   → id, client_id, token        ← pseudónimo reversible con CLINIC_SECRET
periods         → id, period_month (DATE), is_closed
sales           → id, period_id, service_id, service_name_snapshot, staff_id, client_token_id, sale_price, payment_method, promo_tag, supply_cost_est, sale_date, created_by
expenses        → id, period_id, expense_date, concept, category, amount, created_by
config_params   → key, value, description     ← costo fijo mensual, tasas, etc.
```

**Reglas de tipos:**
- Todos los montos: `NUMERIC(14,2)` (nunca FLOAT)
- PKs: `UUID` con `gen_random_uuid()`
- Períodos: `DATE` almacenado como primer día del mes (`2025-04-01`)

### 2.2 Vistas para el Catálogo Asimétrico

```sql
-- Lo que ve la recepcionista (sin costos)
CREATE VIEW v_services_public AS
SELECT id, sku, name, area, duration_min
FROM services WHERE is_active = TRUE;

-- Lo que ve el administrador (con costo de receta calculado)
CREATE VIEW v_services_admin AS
SELECT s.*,
  COALESCE((
    SELECT SUM(
      CASE WHEN p.yield_per_unit > 1
           THEN (p.unit_cost / p.yield_per_unit) * sr.quantity
           ELSE p.unit_cost * sr.quantity
      END)
    FROM service_recipes sr JOIN products p ON p.id = sr.product_id
    WHERE sr.service_id = s.id
  ), 0) + s.variable_cost AS recipe_cost_total
FROM services s WHERE s.is_active = TRUE;
```

---

## 3. Separación de Permisos (Backend + DB)

**Decisión: PostgreSQL RLS + variable de sesión inyectada por FastAPI en cada request.**

Rechazado: ocultar componentes en el frontend, dos usuarios de DB separados.

### Flujo por request:

```
JWT en header → FastAPI verifica token → extrae role
→ Dependency get_db_with_role ejecuta:
     SET LOCAL app.current_role = 'recepcionista' | 'administrador'
→ Políticas RLS en PostgreSQL filtran filas según ese valor
```

### Políticas RLS críticas:

```sql
-- products, services, expenses: solo administrador
CREATE POLICY admin_only ON products
  USING (current_setting('app.current_role', TRUE) = 'administrador');

-- clients: solo administrador
CREATE POLICY admin_only ON clients
  USING (current_setting('app.current_role', TRUE) = 'administrador');

-- sales: ambos roles pueden leer/insertar
-- pero el endpoint de recepcionista usa v_services_public, nunca la tabla completa
```

La recepcionista **nunca recibe** un campo de costo porque:
1. La vista `v_services_public` no los incluye
2. La RLS bloquea acceso directo a las tablas sensibles
3. Los endpoints admin tienen `Depends(require_admin)` a nivel de ruta

---

## 4. Exportación Segura a Marketing (Tratamiento de PII)

**Problema:** La agencia de marketing necesita `(tratamiento, cliente)` pero el nombre y teléfono real son PII bajo la LFPDPPP mexicana.

**Solución: pseudonimización con HMAC-SHA256**

```
clients.id (UUID) + CLINIC_SECRET (env var) → HMAC-SHA256 → token
```

El token se guarda en `client_tokens.token`. La tabla `sales` almacena solo `client_token_id`, nunca `client_id`.

**Export de marketing (endpoint admin):**
```json
{ "treatment": "Hydrafacial", "date": "2025-04-15", "client_token": "8f3a2c9d..." }
```

La agencia ve que el mismo token tuvo dos tratamientos en abril — útil para segmentación — sin saber quién es. Revertir el token a identidad real requiere `CLINIC_SECRET` que solo existe en el servidor.

---

## 5. Plan de Implementación por Fases

Cada fase termina en un entregable que puedes probar manualmente antes de dar luz verde a la siguiente.

---

### Fase 1 — Autenticación + Catálogo de Servicios (1 semana)
**Objetivo:** Probar que el stack completo funciona de punta a punta con el dato más simple.

**Entregables:**
- Scaffolding FastAPI (routers, modelos, schemas, dependencies, alembic)
- Migración: tablas `users`, `services`, `equipment`
- `POST /auth/token` → devuelve JWT
- `GET /services/catalog` → `v_services_public` para recepcionista, `v_services_admin` para admin
- RLS en tabla `services` activado y probado
- React: pantalla de login + un tab con la tabla de servicios

**Prueba manual:** Login como recepcionista → la lista de servicios no muestra precios. Login como admin → la lista muestra precio y costo de receta.

---

### Fase 2 — Gestión Completa del Catálogo + Importación Legacy (1 semana)
**Objetivo:** El admin puede gestionar el catálogo completo y migrar los datos existentes del HTML.

**Entregables:**
- Migración: tablas `products`, `service_recipes`, `staff`, `config_params`
- CRUD endpoints para productos y servicios (solo admin)
- `POST /services/{id}/recipe` y `PUT /services/{id}/recipe`
- `POST /import/json` → acepta el formato de respaldo del localStorage (`aestheva_v3_data`)
- React: tabs Inventario y Recetas con modales portados del HTML

**Prueba manual:** Importar el archivo JSON de respaldo existente. Verificar que todos los productos y servicios aparecen y que los costos de receta coinciden con los de la calculadora HTML.

---

### Fase 3 — Registro de Visitas + Split de Roles (1 semana)
**Objetivo:** La recepcionista puede registrar ventas. La separación de roles es efectiva.

**Entregables:**
- Migración: tablas `clients`, `client_tokens`, `periods`, `sales`
- `GET /periods` → crea automáticamente el periodo del mes en curso si no existe
- `POST /sales` → recepcionista puede crear ventas; el dropdown de servicios usa `v_services_public`
- `GET /sales?period=YYYY-MM` → recepcionista ve nombre, profesional, precio; admin ve todo
- React: tab Ventas del Mes con formulario sensible al rol

**Prueba manual:** Recepcionista registra una venta → no puede ver margen ni costo de insumo. Admin ve la misma venta con todas las columnas financieras.

---

### Fase 4 — Gastos + Dashboard Financiero (1 semana)
**Objetivo:** El admin tiene visibilidad financiera completa. El dashboard se calcula en el servidor.

**Entregables:**
- Migración: tabla `expenses`
- CRUD para gastos (solo admin, RLS aplicado)
- `GET /dashboard/summary?period=YYYY-MM` → KPIs del mes (ventas totales, gastos, déficit/superávit, alertas de stock)
- `GET /dashboard/annual` → array de 12 meses para Chart.js
- React: tabs Dashboard, Gastos, Análisis Anual

**Prueba manual:** Cargar datos de ejemplo de abril desde el HTML (`$162,020` en ventas, déficit de `$97,980`). Verificar que el dashboard muestra exactamente los mismos valores.

---

### Fase 5 — Exportaciones + Herramientas Financieras (1 semana)
**Objetivo:** Todas las herramientas del admin funcionales. Exportaciones listas para data science.

**Entregables:**
- `GET /exports/{entity}?format=json|csv` para productos, servicios, ventas, gastos
- `GET /exports/marketing?period=YYYY-MM` → export pseudonimizado sin PII
- `GET /dashboard/depreciation` → tabla de depreciación calculada en servidor
- `GET /dashboard/breakeven` → punto de equilibrio con parámetros configurables
- React: tabs Depreciación, Punto de Equilibrio, Capacidad Instalada, Simulador de Descuentos

**Prueba manual:** Descargar CSV de ventas de abril. Abrir en Excel y verificar columnas, fechas ISO 8601 y montos. Descargar export de marketing y confirmar que no hay ningún campo de PII.

---

### Fase 6 — Hardening + Migración a Producción (1 semana)
**Objetivo:** Aplicación lista para uso real. Datos históricos migrados.

**Entregables:**
- Rate limiting con `slowapi`
- HTTPS forzado (Caddy o TLS de plataforma)
- `POST /import/json` maneja el formato completo incluyendo `ventasPorMes` y `gastosPorMes`
- Flujo de recuperación de contraseña (email via Resend)
- Cierre de períodos: el admin puede cerrar un mes; los períodos cerrados son de solo lectura
- Script de backup automatizado (`pg_dump` a S3 o equivalente)
- Deploy en Railway o Render con gestión de variables de entorno

**Prueba manual:** Importar todos los datos históricos desde el respaldo de localStorage. Verificar que la gráfica anual muestra los meses históricos correctamente desde la URL de producción.

---

## 6. Diagrama de Arquitectura

```
Browser (React + Vite)
    │
    │  HTTPS / JWT Bearer Token
    ▼
FastAPI Application
    ├── /auth          → JWT issue/refresh
    ├── /services      → catálogo con RLS (dos vistas según rol)
    ├── /products      → solo administrador
    ├── /sales         → recepcionista inserta, admin lee todo
    ├── /expenses      → solo administrador
    ├── /dashboard     → solo administrador, KPIs calculados en servidor
    └── /exports       → solo administrador, JSON + CSV + marketing pseudonimizado
         │
         │  asyncpg connection pool
         │  SET LOCAL app.current_role = '{role}' por cada request
         ▼
PostgreSQL 16
    ├── RLS Policies   → filtrado de filas según app.current_role
    ├── v_services_public   → SKU + nombre (recepcionista)
    ├── v_services_admin    → fila completa + costo de receta (admin)
    └── v_monthly_summary   → agregados P&L por período
```

---

## 7. Preguntas de Aclaración

Antes de comenzar la Fase 1, necesito respuesta a estas preguntas:

1. **Usuarios iniciales:** ¿Cuántas recepcionistas hay? ¿Necesitamos soporte para múltiples cuentas desde el inicio, o empezamos con una cuenta por rol (1 admin + 1 recepcionista)?

2. **Identificación de clientes:** ¿La recepcionista siempre captura el nombre del cliente al registrar una visita, o es frecuente el cliente "anónimo" (sin nombre)? Esto afecta si el campo de nombre es obligatorio o opcional.

3. **Costo fijo de $260,000:** ¿Este número cambia mes a mes o es constante por todo 2025? ¿Debería ser un parámetro editable por el admin o podemos hardcodearlo como `config_param`?

4. **Dominio del frontend:** ¿La app web será accesible solo dentro de la clínica (red local / VPN) o necesita ser accesible desde internet (móvil de la dueña, trabajo remoto)?

5. **Datos históricos:** ¿Tienes un archivo de respaldo JSON del localStorage con datos reales que debamos migrar en la Fase 2/6, o partimos de cero?
