# Zulycell — Documentación Técnica de Formularios
> Fecha: 20 octubre 2026 | Propósito: realizar un sistema pos
> 

---

## CONVENCIONES DE TIPOS DE DATO

| Símbolo | Tipo | Descripción |
|---------|------|-------------|
| `STR` | String / Texto | Cadena de caracteres alfanumérica |
| `INT` | Integer | Número entero sin decimales |
| `DEC` | Decimal | Número con punto decimal (ej. precios) |
| `TS` | Timestamp | Fecha y hora (ISO 8601) |
| `DATE` | Date | Solo fecha (YYYY-MM-DD) |
| `BOOL` | Boolean | Verdadero / Falso (toggle, checkbox) |
| `SEL` | Select / Enum | Lista desplegable de opciones fijas |
| `IMG` | Imagen | Archivo de imagen (JPG/PNG) |
| `TEL` | Teléfono | Número telefónico, formato local |
| `EMAIL` | Email | Dirección de correo electrónico |
| `BARCODE` | Código de barras | EAN-13 o UPC-A |

**Notación de restricciones:**
- `R` = Campo requerido (obligatorio)
- `O` = Campo opcional
- `AUTO` = Se genera automáticamente (no editable por usuario)
- `[n]` = Longitud máxima en caracteres
- `[n,m]` = Rango permitido de valor numérico

---

## ÍNDICE DE FORMULARIOS

1. [Registro de Negocio / Cuenta](#1-registro-de-negocio--cuenta)
2. [Balance / Punto de Venta (POS)](#2-balance--punto-de-venta-pos)
3. [Registro de Venta](#3-formulario-registro-de-venta)
4. [Registro de Gasto](#4-formulario-registro-de-gasto)
5. [Inventario — Crear Producto](#5-inventario--crear-producto)
6. [Inventario — Variantes de Producto](#6-inventario--variantes-de-producto)
7. [Inventario — Ajuste de Stock](#7-inventario--ajuste-de-stock)
8. [Catálogo Virtual](#8-catálogo-virtual)
9. [Clientes — Crear/Editar](#9-clientes--crearedited)
10. [Clientes — Registrar Deuda / Abono](#10-clientes--registrar-deuda--abono)
11. [Proveedores — Crear/Editar](#11-proveedores--crearedited)
12. [Proveedores — Registrar Compra](#12-proveedores--registrar-compra)
13. [Proveedores — Registrar Pago](#13-proveedores--registrar-pago)
14. [Cotizaciones ](#14-cotizaciones-)
15. [Empleados — Crear/Editar](#15-empleados--crearedited)
16. [Recetas ](#16-recetas--plan-pro)
17. [Factura Electrónica )](#17-factura-electrónica--plan-pro)
18. [Sitio Web / Tienda Online ](#18-sitio-web--tienda-online-)
19. [Estadísticas — Filtros de Reporte ](#19-estadísticas--filtros-de-reporte-)
20. [Configuraciones del Negocio](#20-configuraciones-del-negocio)
21. [QR de Pago](#22-qr-de-pago)

---

## 1. Registro de Negocio / Cuenta

**Ruta:** `login.zulycell.co` → "Crea una cuenta"  
**Propósito:** Crear cuenta nueva de negocio en zulycell 
**Autenticación:** Sin código ni contraseña — usa código OTP enviado por WhatsApp o email

### Hoja 1 — Identificación

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Número de celular o email | `STR` / `EMAIL` / `TEL` | R | Celular: 10 dígitos; Email: formato válido | Canal de envío del código OTP |

### Hoja 2 — Verificación OTP

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Código de verificación | `INT` | R | 4–6 dígitos, expira en ~5 min | Código enviado por WhatsApp o correo |

### Hoja 3 — Datos del Negocio

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Nombre del negocio | `STR` | R | max [100] chars | Nombre comercial que aparece en reportes |
| 2 | País | `SEL` | R | 21 países disponibles | Determina moneda y formato fiscal |
| 3 | Tipo de negocio / Categoría | `SEL` | R | Gastronómico, Comercio, Servicios, Mercados, Otro | Define configuraciones por defecto |
| 4 | Nombre del propietario | `STR` | R | max [100] chars | Nombre del administrador |

**Botones:**
- `Enviar código` → envía OTP
- `Reenviar código` → disponible después de ~60 segundos
- `Verificar` → valida OTP y avanza
- `Continuar` → guarda datos del negocio

---

## 2. Balance / Punto de Venta (POS)

**Ruta:** `web.zulycell.co/balance`  
**Propósito:** Pantalla principal de registro rápido de transacciones  
**Hojas/Tabs disponibles:** `Ventas` | `Gastos`

### Vista general — Balance

| Elemento | Tipo | Descripción |
|----------|------|-------------|
| Buscador de productos | `STR` — búsqueda en tiempo real | Filtra por nombre o código de barras |
| Lector de código de barras | `BARCODE` (EAN-13 / UPC-A) | Activa cámara o lector Bluetooth |
| Lista de productos | Grilla/Lista | Muestra foto, nombre, precio |
| Carrito de venta | AUTO | Acumula productos seleccionados |
| Total | `DEC` — AUTO | Suma automática de items en carrito |

**Botones principales:**
- `Vender` (botón verde) → abre formulario de registro de venta
- `Gasto` → abre formulario de registro de gasto
- `Buscar` → campo de texto para filtrar productos
- `Escanear` → activa cámara/lector de barras

---

## 3. Formulario — Registro de Venta

**Ruta:** `web.zulycell.co/balance` → botón `Vender`  
**Plan:** Gratuito y Premium  
**Propósito:** Registrar una transacción de venta al cliente

### Hoja 1 — Selección de Productos

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Búsqueda de producto | `STR` | R | Búsqueda por nombre o código barras | Filtra del catálogo de inventario |
| 2 | Producto(s) seleccionado(s) | `SEL` (lista) | R | Mínimo 1 producto | Items que componen la venta |
| 3 | Cantidad por producto | `INT` | R | [1, 99999] entero positivo | Unidades vendidas por ítem |
| 4 | Precio unitario | `DEC` | R | [0.01, 9999999.99] — 2 decimales | Se precarga del inventario, editable |
| 5 | Descuento por ítem | `DEC` o `INT` | O | Monto fijo o % sobre precio | Descuento aplicado a ese producto |
| 6 | Subtotal por ítem | `DEC` | AUTO | cantidad × precio − descuento | Calculado automáticamente |

### Hoja 2 — Resumen y Pago

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Descuento global | `DEC` o `INT` | O | Monto fijo o porcentaje [0–100%] | Descuento sobre el total de la venta |
| 2 | Total a cobrar | `DEC` | AUTO | Suma de items − descuento global | Se muestra en grande |
| 3 | Método de pago | `SEL` | R | Efectivo / Tarjeta / Transferencia / Nequi / Crédito (fiado) | Define si genera deuda o se cobra en el momento |
| 4 | Monto recibido | `DEC` | O | Solo si método = Efectivo; ≥ Total | Para calcular vuelto |
| 5 | Vuelto / Cambio | `DEC` | AUTO | Monto recibido − Total | Solo visible si método = Efectivo |
| 6 | Cliente | `SEL` / `STR` | O | Buscar en lista o crear rápido | Asocia venta al historial del cliente |
| 7 | Notas / Observaciones | `STR` | O | max [255] chars | Comentario interno de la venta |
| 8 | Fecha de venta | `TS` | AUTO | Timestamp del servidor al confirmar | Se asigna automáticamente |
| 9 | Número de venta | `INT` | AUTO | Correlativo autogenerado, incremental | ID único de la transacción |

### Hoja 3 — Comprobante (post-venta)

| # | Elemento | Tipo | Descripción |
|---|----------|------|-------------|
| 1 | Vista previa del comprobante | Pantalla | Muestra: negocio, fecha, items, total, método de pago |
| 2 | Compartir por WhatsApp | Acción | Genera imagen/PDF y abre WhatsApp |
| 3 | Descargar PDF | Acción | Descarga comprobante en PDF |
| 4 | Imprimir | Acción | Envía a impresora conectada |
| 5 | Nueva venta | Acción | Limpia el carrito y vuelve al POS |

**Botones:**
- `Agregar producto` → abre selector de catálogo
- `Aplicar descuento` → modal de descuento
- `Seleccionar cliente` → búsqueda en lista de clientes
- `Confirmar venta` → guarda y muestra comprobante
- `Cancelar` → descarta la venta en curso

---

## 4. Formulario — Registro de Gasto

**Ruta:** `web.zulycell.co/balance` → tab `Gastos` o botón `Gasto`  
**Plan:** Gratuito y Premium  
**Propósito:** Registrar salidas de dinero del negocio

### Campos del Formulario

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Monto del gasto | `DEC` | R | [0.01, 9999999.99] — 2 decimales, positivo | Valor del egreso |
| 2 | Categoría del gasto | `SEL` | R | Arriendo / Servicios públicos / Nómina / Compra de mercancía / Transporte / Publicidad / Otros | Clasificación del egreso |
| 3 | Descripción / Concepto | `STR` | O | max [255] chars | Detalle del gasto |
| 4 | Proveedor asociado | `SEL` | O | Buscar en lista de proveedores | Vincula el gasto a un proveedor |
| 5 | Método de pago | `SEL` | O | Efectivo / Tarjeta / Transferencia / A crédito | Cómo se pagó el gasto |
| 6 | ¿Actualiza inventario? | `BOOL` | O | Solo si categoría = Compra de mercancía | Suma unidades al stock |
| 7 | Producto asociado | `SEL` | O | Solo si actualiza inventario; buscar en catálogo | Qué producto se compró |
| 8 | Cantidad comprada | `INT` | O | [1, 99999]; solo si actualiza inventario | Unidades que entran al stock |
| 9 | Fecha del gasto | `TS` | R | Default = ahora; editable a fecha anterior | Timestamp del egreso |
| 10 | Comprobante / Imagen | `IMG` | O | JPG/PNG, max ~5MB | Foto de la factura o recibo |

**Botones:**
- `Guardar gasto` → confirma y registra
- `Cancelar` → descarta el formulario

---

## 5. Inventario — Crear / Editar Producto

**Ruta:** `web.zulycell.co/inventory` → `Crear producto`  
 
**Propósito:** Alta de nuevos productos al catálogo del negocio

### Hoja 1 — Información Básica

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Nombre del producto | `STR` | R | max [100] chars, no vacío | Nombre que aparece en POS y reportes |
| 2 | Código de barras | `BARCODE` | O | EAN-13 (13 dígitos) o UPC-A (12 dígitos); numérico | Escaneable con cámara o lector Bluetooth |
| 3 | Categoría | `SEL` / `STR` | O | Lista de categorías propias + "Nueva categoría" | Agrupa productos en reportes |
| 4 | Foto del producto | `IMG` | O | JPG/PNG; para catálogo virtual | Imagen visible en catálogo y POS |
| 5 | Descripción | `STR` | O | max [500] chars | Detalle visible en catálogo virtual |

### Hoja 2 — Precios y Stock

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Precio de costo | `DEC` | O | [0.00, 9999999.99] — 2 decimales, ≥ 0 | Precio al que se compra (para margen) |
| 2 | Precio de venta | `DEC` | R | [0.01, 9999999.99] — 2 decimales, > 0 | Precio al cliente |
| 3 | Margen de ganancia | `DEC` | AUTO | Calculado: ((venta−costo)/costo)×100 | Se muestra como % automático |
| 4 | Cantidad en stock | `INT` | O | [0, 999999] — entero no negativo | Unidades disponibles actuales |
| 5 | Alerta de stock bajo | `INT` | O | Default = 5 unidades; [0, 9999] | Resalta en rojo cuando el stock cae a este valor |
| 6 | Unidad de medida | `SEL` | O | Unidad / Kilogramo / Litro / Metro / Caja | Para mercados que venden por peso/volumen |

### Hoja 3 — Variantes (si aplica)

Ver sección 6.

**Botones:**
- `Guardar producto` → crea/actualiza producto
- `Agregar variante` → expande la sección de variantes
- `Escanear código de barras` → activa cámara
- `Eliminar producto` → baja lógica (pide confirmación)
- `Cancelar` → descarta cambios

### Carga Masiva desde Excel

**Ruta:** Inventario → `Importar desde Excel`

| # | Columna Excel | Tipo | R/O | Descripción |
|---|---------------|------|-----|-------------|
| A | Nombre | `STR` | R | Nombre del producto |
| B | Código de barras | `STR` | O | EAN-13 o UPC-A |
| C | Precio de costo | `DEC` | O | Número con hasta 2 decimales |
| D | Precio de venta | `DEC` | R | Número positivo |
| E | Categoría | `STR` | O | Texto libre; se crea si no existe |
| F | Cantidad | `INT` | O | Entero ≥ 0 |

**Botones:**
- `Descargar plantilla Excel` → descarga el template vacío
- `Subir archivo` → input file (`.xlsx`, `.xls`, `.csv`)
- `Importar` → procesa el archivo

---

## 6. Inventario — Variantes de Producto

**Propósito:** Definir sub-versiones de un producto (talla, color, presentación)

### Formulario de Variante

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Tipo de variante | `SEL` / `STR` | R | Talla / Color / Presentación / Personalizado | Dimensión de la variante |
| 2 | Valor de la variante | `STR` | R | max [50] chars | Ej: "XL", "Rojo", "500ml" |
| 3 | Precio de venta (variante) | `DEC` | O | [0.01, 9999999.99] | Si difiere del precio base |
| 4 | Precio de costo (variante) | `DEC` | O | [0.00, 9999999.99] | Si difiere del costo base |
| 5 | Stock de la variante | `INT` | R | [0, 999999] — entero ≥ 0 | Stock independiente por variante |
| 6 | Código de barras (variante) | `BARCODE` | O | EAN-13 / UPC-A | Código único por variante |

**Botones:**
- `+ Agregar variante` → agrega otra fila de variante
- `Eliminar variante` → borra esa fila
- `Guardar` → confirma todas las variantes

---

## 7. Inventario — Ajuste de Stock

**Propósito:** Corrección manual del stock (merma, pérdida, conteo físico)

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Producto | `SEL` | R | Búsqueda en catálogo | Producto a ajustar |
| 2 | Tipo de ajuste | `SEL` | R | Entrada / Salida / Corrección | Suma, resta, o reemplaza el stock |
| 3 | Cantidad | `INT` | R | [1, 999999] si Entrada/Salida; [0,999999] si Corrección | Unidades del ajuste |
| 4 | Motivo | `STR` | O | max [255] chars | Razón del ajuste (merma, robo, etc.) |
| 5 | Fecha del ajuste | `TS` | AUTO | Timestamp del servidor | Se registra automáticamente |

---

## 8. Catálogo Virtual

**Ruta:** `web.zulycell.co/catalog` o Sitio Web    
**Propósito:** Tienda digital del negocio con link y QR compartible

### Configuración del Catálogo

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Nombre del negocio | `STR` | AUTO | Heredado de Configuraciones | Aparece en cabecera del catálogo |
| 2 | Logo del negocio | `IMG` | O | JPG/PNG, max ~5MB | Imagen en la cabecera |
| 3 | Banner / imagen de portada | `IMG` | O | JPG/PNG, recomendado 1200×400px | Imagen de encabezado del catálogo |
| 4 | Color principal | `SEL` / HEX | O | Selector de color | Personalización visual |
| 5 | Descripción del negocio | `STR` | O | max [500] chars | Texto introductorio del catálogo |
| 6 | WhatsApp de contacto | `TEL` | O | 10 dígitos sin espacios | Para que clientes contacten al vendedor |
| 7 | Productos visibles | `BOOL` por producto | O | Toggle ON/OFF por producto | Cuáles aparecen en el catálogo |

### QR del Catálogo

| # | Elemento | Descripción |
|---|----------|-------------|
| 1 | Código QR | Imagen generada automáticamente; apunta a la URL del catálogo |
| 2 | Link del catálogo | `STR` / URL — autogenerado, formato `zulycell.co/catalogo/[id-negocio]` |
| 3 | Compartir QR | Descarga imagen PNG del QR o comparte por WhatsApp |

---

## 9. Clientes — Crear / Editar

**Ruta:** `web.zulycell.co/clients` → `Crear cliente`   
**Propósito:** Alta de clientes para historial, crédito y cobranza

### Formulario

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Nombre | `STR` | R | max [100] chars, no vacío | Nombre completo o razón social |
| 2 | Número de celular | `TEL` | O | 10 dígitos (Colombia); formato local según país | Teléfono de contacto |
| 3 | Número de documento | `STR` | O | max [20] chars; acepta guiones y letras (ej. NIT) | Cédula, NIT, RUC, RUT, etc. |
| 4 | Dirección | `STR` | O | max [255] chars | Dirección de entrega o fiscal |
| 5 | Email | `EMAIL` | O | Formato email válido | Para envío de comprobantes |

### Datos Automáticos (no editables manualmente)

| # | Campo | Tipo | Descripción |
|---|-------|------|-------------|
| 1 | Historial de compras | Lista de ventas | Ventas asociadas a este cliente |
| 2 | Total comprado | `DEC` AUTO | Suma de todas las ventas |
| 3 | Deuda actual | `DEC` AUTO | Saldo pendiente por cobrar |
| 4 | Fecha de registro | `TS` AUTO | Timestamp de creación del cliente |

### Vista de Lista de Clientes

| Columna | Tipo | Descripción |
|---------|------|-------------|
| Nombre | `STR` | Nombre del cliente |
| Celular | `TEL` | Número de contacto |
| Documento | `STR` | Número de identificación |
| Total por cobrar | `DEC` | Deuda pendiente (verde = pagado, rojo = debe) |
| Acciones | Botón | `Ver detalle` → abre ficha completa |

**Botones:**
- `Crear cliente` → abre formulario
- `Buscar cliente` → campo de texto (búsqueda en tiempo real)
- `Ver detalle` → ficha del cliente con historial
- `Editar` → edita los datos de la ficha
- `Eliminar` → baja lógica (pide confirmación)

---

## 10. Clientes — Registrar Deuda / Abono (Cuentas por Cobrar)

**Propósito:** Control de ventas a crédito (fiado) y cobros parciales

### Formulario — Nueva Deuda

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Cliente | `SEL` | R | Buscar en lista de clientes | A quién se le fía |
| 2 | Monto de la deuda | `DEC` | R | [0.01, 9999999.99] — 2 decimales | Valor total a crédito |
| 3 | Descripción | `STR` | O | max [255] chars | Concepto de lo que se fió |
| 4 | Fecha | `TS` | AUTO | Timestamp de la operación | Registrado automáticamente |

### Formulario — Registrar Abono / Pago

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Monto del abono | `DEC` | R | [0.01, saldo_pendiente] — no puede superar la deuda | Pago parcial o total |
| 2 | Método de pago | `SEL` | O | Efectivo / Transferencia / Tarjeta / Nequi | Cómo pagó el cliente |
| 3 | Fecha del abono | `TS` | AUTO | Timestamp del abono | Automático |
| 4 | Notas | `STR` | O | max [255] chars | Observación sobre el pago |

**Botones:**
- `Registrar deuda` → crea la deuda
- `Registrar abono` → descuenta del saldo pendiente
- `Enviar recordatorio` → envía mensaje WhatsApp al cliente
- `Ver historial` → lista de abonos y deudas del cliente

---

## 11. Proveedores — Crear / Editar

**Ruta:** `web.zulucell.co/suppliers` → `Crear proveedor`  
**Propósito:** Registro de proveedores para gestión de compras y cuentas por pagar

### Formulario

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Nombre | `STR` | R | max [100] chars, no vacío | Nombre de la empresa o persona |
| 2 | Celular / Teléfono | `TEL` | O | 10 dígitos (Colombia); formato local según país | Teléfono de contacto principal |
| 3 | Documento (NIT/RUT/etc.) | `STR` | O | max [20] chars; acepta guiones | Número de identificación tributaria |
| 4 | Dirección | `STR` | O | max [255] chars | Dirección física o de despacho |
| 5 | Email | `EMAIL` | O | Formato email válido | Para órdenes de compra y contacto |
| 6 | Notas | `STR` | O | max [500] chars | Observaciones generales del proveedor |

### Vista de Lista de Proveedores (confirmada por captura)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| Nombre | `STR` | Nombre del proveedor |
| Celular | `TEL` | Número de contacto |
| Documento | `STR` | Número de identificación |
| Total por pagar | `DEC` | Deuda pendiente con ese proveedor |
| Acciones | Botón | `Detalle` → ficha del proveedor |

**Estadísticas en cabecera:**
- `Total de proveedores` — `INT` COUNT
- `Total por pagar` — `DEC` SUM de saldos pendientes

**Botones:**
- `Crear proveedor` → abre formulario
- `Buscar un proveedor` → campo de búsqueda en tiempo real
- `Detalle` → abre ficha del proveedor

---

## 12. Proveedores — Registrar Compra

**Propósito:** Registrar una compra a un proveedor (actualiza inventario automáticamente)

### Formulario

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Proveedor | `SEL` | R | Buscar en lista de proveedores | Quién suministra |
| 2 | Producto(s) comprado(s) | `SEL` (lista) | R | Buscar en catálogo; min 1 item | Items de la compra |
| 3 | Cantidad por producto | `INT` | R | [1, 999999] entero positivo | Unidades recibidas |
| 4 | Precio de costo unitario | `DEC` | R | [0.01, 9999999.99] — 2 decimales | Precio al que se compró |
| 5 | Total de la compra | `DEC` | AUTO | Σ (cantidad × costo) | Calculado automáticamente |
| 6 | Método de pago | `SEL` | R | Efectivo / Transferencia / Tarjeta / A crédito | Si es "A crédito" → genera cuenta por pagar |
| 7 | Fecha de la compra | `DATE` | R | Default = hoy; permite fecha anterior | `YYYY-MM-DD` |
| 8 | Número de factura / referencia | `STR` | O | max [50] chars | Referencia de la factura del proveedor |
| 9 | Imagen de la factura | `IMG` | O | JPG/PNG, max ~5MB | Foto de la factura física |
| 10 | Notas | `STR` | O | max [255] chars | Observaciones de la compra |

**Efecto automático:** Al guardar, suma las unidades compradas al stock del inventario.

**Botones:**
- `Guardar compra` → confirma y actualiza inventario
- `Cancelar` → descarta

---

## 13. Proveedores — Registrar Pago (Cuentas por Pagar)

**Propósito:** Abonar o pagar deuda con un proveedor por compra a crédito

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Monto del pago | `DEC` | R | [0.01, saldo_pendiente] — 2 decimales | Pago parcial o total al proveedor |
| 2 | Método de pago | `SEL` | O | Efectivo / Transferencia / Tarjeta | Cómo se pagó |
| 3 | Fecha del pago | `TS` | AUTO | Timestamp del sistema | Registrado automáticamente |
| 4 | Notas | `STR` | O | max [255] chars | Referencia del pago |

---

## 14. Cotizaciones 👑

**Ruta:** `web.zulicell.co/quotes`  
**Propósito:** Generar cotizaciones formales para clientes

### Formulario

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Cliente | `SEL` / `STR` | O | Buscar en lista o ingresar nombre libre | Destinatario de la cotización |
| 2 | Fecha de la cotización | `DATE` | AUTO | Default = hoy | `YYYY-MM-DD` |
| 3 | Fecha de vencimiento / vigencia | `DATE` | O | ≥ fecha de cotización | Hasta cuándo aplica el precio |
| 4 | Número de cotización | `INT` | AUTO | Correlativo autogenerado | ID único de la cotización |
| 5 | Producto(s) | `SEL` (lista) | R | Del catálogo de inventario; min 1 | Items cotizados |
| 6 | Cantidad por ítem | `INT` | R | [1, 99999] entero positivo | Unidades cotizadas |
| 7 | Precio unitario | `DEC` | R | [0.01, 9999999.99] — editable | Precio de venta (precargado del catálogo) |
| 8 | Descuento por ítem | `DEC` o `INT` | O | Monto fijo o % | Descuento sobre ese ítem |
| 9 | Descuento global | `DEC` o `INT` | O | Sobre el subtotal total | Descuento adicional general |
| 10 | Notas / Condiciones | `STR` | O | max [500] chars | Términos y condiciones de la cotización |
| 11 | Total cotizado | `DEC` | AUTO | Σ items − descuentos | Se calcula en tiempo real |

**Botones:**
- `Guardar cotización` → crea la cotización
- `Descargar PDF` → genera PDF de la cotización
- `Compartir por WhatsApp` → envía al cliente
- `Convertir en venta` → registra la venta directamente desde la cotización
- `Duplicar` → copia la cotización para editar
- `Eliminar` → borra (pide confirmación)

---

## 15. Empleados — Crear / Editar

**Ruta:** `web.zulycell.co/employees`  
**Propósito:** Gestión de personal con control de accesos al sistema

### Formulario

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Nombre del empleado | `STR` | R | max [100] chars | Nombre completo |
| 2 | Número de celular / WhatsApp | `TEL` | R | 10 dígitos (Colombia) | Para enviar invitación de acceso |
| 3 | Cargo / Rol | `STR` | O | max [100] chars | Descripción del puesto |
| 4 | Permisos de módulos | `BOOL` por módulo | R | Toggle ON/OFF por cada módulo | Qué puede ver/usar el empleado |

### Permisos Disponibles (toggle ON/OFF por módulo)

| Módulo | Tipo | Descripción del permiso |
|--------|------|------------------------|
| Ver ventas | `BOOL` | Puede ver el historial de ventas |
| Registrar ventas | `BOOL` | Puede crear nuevas ventas en el POS |
| Ver gastos | `BOOL` | Puede ver los gastos registrados |
| Registrar gastos | `BOOL` | Puede crear nuevos gastos |
| Ver inventario | `BOOL` | Puede consultar el catálogo y stock |
| Editar inventario | `BOOL` | Puede crear/editar productos |
| Ver clientes | `BOOL` | Puede consultar la lista de clientes |
| Editar clientes | `BOOL` | Puede crear/editar clientes |
| Ver estadísticas | `BOOL` | Puede ver reportes y estadísticas |
| Ver caja / balance | `BOOL` | Puede ver el balance diario |

**Botones:**
- `Agregar empleado` → envía invitación por WhatsApp al celular registrado
- `Editar permisos` → actualiza los accesos
- `Eliminar empleado` → revoca acceso

---

## 16. Recetas 👑 (Plan Pro)

**Propósito:** Para negocios gastronómicos — define los insumos que componen un plato/producto  
**Plan:** Exclusivo Plan Pro

### Formulario — Crear Receta

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Nombre de la receta / plato | `STR` | R | max [100] chars | Nombre del plato o producto final |
| 2 | Categoría | `SEL` | O | Del catálogo de categorías | Clasificación (entrada, principal, bebida, etc.) |
| 3 | Ingrediente(s) | `SEL` (lista) | R | Del inventario; mínimo 1 | Insumos que componen la receta |
| 4 | Cantidad por ingrediente | `DEC` | R | [0.001, 9999] — hasta 3 decimales (ej. 0.250 kg) | Cantidad de insumo por porción |
| 5 | Unidad del ingrediente | `SEL` | R | Gramo / Kilogramo / Mililitro / Litro / Unidad | Medida del insumo |
| 6 | Costo total de la receta | `DEC` | AUTO | Σ (cantidad × costo insumo) | Calculado automáticamente |
| 7 | Precio de venta del plato | `DEC` | R | [0.01, 9999999.99] | Precio al cliente |
| 8 | Margen de ganancia | `DEC` | AUTO | ((venta−costo)/costo)×100 | Porcentaje calculado |
| 9 | Foto del plato | `IMG` | O | JPG/PNG | Para catálogo |
| 10 | Notas / Descripción | `STR` | O | max [500] chars | Descripción del plato |

**Efecto:** Al registrar una venta de este plato, descuenta automáticamente los ingredientes del inventario.

---

## 17. Factura Electrónica 👑 (Plan Pro)

**Plan:** Exclusivo Plan Pro — ilimitada  
**Propósito:** Emisión de documentos tributarios electrónicos válidos legalmente

### Formulario

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Tipo de documento | `SEL` | R | Factura de venta / Nota crédito / Nota débito | Tipo de documento a emitir |
| 2 | Cliente | `SEL` | R | De la lista de clientes (debe tener documento) | Receptor de la factura |
| 3 | Nombre del receptor | `STR` | AUTO | Precargado del cliente | Se puede editar |
| 4 | NIT / RUT / Documento del receptor | `STR` | R | max [20] chars; requerido para factura electrónica | Identificación tributaria del comprador |
| 5 | Dirección del receptor | `STR` | R | max [255] chars | Domicilio fiscal |
| 6 | Email del receptor | `EMAIL` | R | Para envío del XML/PDF de la factura | Correo donde se envía la factura |
| 7 | Producto(s) / Servicio(s) | `SEL` (lista) | R | Del catálogo | Items facturados |
| 8 | Cantidad | `INT` | R | [1, 99999] | Unidades |
| 9 | Precio unitario | `DEC` | R | [0.01, 9999999.99] | Valor unitario |
| 10 | Impuesto / IVA | `SEL` / `DEC` | R | 0% / 5% / 19% (Colombia) — según país | Tarifa de impuesto aplicable |
| 11 | Descuento | `DEC` | O | Monto o porcentaje | Descuento aplicado |
| 12 | Subtotal (antes de impuesto) | `DEC` | AUTO | Calculado | |
| 13 | Total impuesto | `DEC` | AUTO | Calculado | |
| 14 | Total factura | `DEC` | AUTO | Subtotal + impuesto − descuento | |
| 15 | Método de pago | `SEL` | R | Efectivo / Tarjeta / Transferencia / A crédito | |
| 16 | Fecha de emisión | `DATE` | AUTO | Fecha del sistema | `YYYY-MM-DD` |
| 17 | Notas / Observaciones | `STR` | O | max [500] chars | |

**Botones:**
- `Emitir factura` → envía a la DIAN (Colombia) o entidad equivalente
- `Previsualizar` → vista previa antes de emitir
- `Descargar PDF` → descarga la factura
- `Enviar por email` → envía al receptor
- `Anular factura` → genera nota crédito

---

## 18. Sitio Web / Tienda Online 👑

**Propósito:** Configurar la tienda virtual pública del negocio  


### Formulario — Configuración General

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Nombre de la tienda | `STR` | R | max [100] chars | Aparece en la tienda pública |
| 2 | Logo | `IMG` | O | JPG/PNG, recomendado cuadrado | Logo de la tienda |
| 3 | Banner de portada | `IMG` | O | JPG/PNG | Imagen principal de la tienda |
| 4 | Descripción del negocio | `STR` | O | max [500] chars | Texto de bienvenida |
| 5 | WhatsApp para pedidos | `TEL` | O | 10 dígitos | Número donde llegan los pedidos |
| 6 | Color de la tienda | `SEL` / HEX | O | Paleta de colores predefinidos | Personalización visual |
| 7 | Dominio / URL de la tienda | `STR` | AUTO | `zulycellco/tienda/[slug-negocio]` | Generado automáticamente |

### QR de la Tienda

| # | Elemento | Tipo | Descripción |
|---|----------|------|-------------|
| 1 | Código QR | `IMG` AUTO | Generado automáticamente |
| 2 | Descargar QR | Acción | Descarga PNG del QR |
| 3 | Compartir enlace | Acción | Copia URL o comparte por WhatsApp |
| 4 | Imprimir QR | Acción | Envía a impresora |

---

## 19. Estadísticas — Filtros de Reporte 👑

**Ruta:** `web.zulucell.co/reportes`  
**Plan:** Esencial y Pro (Premium)  
**Propósito:** Análisis del rendimiento del negocio

### Panel de Filtros

| # | Campo | Tipo | R/O | Opciones / Restricciones | Descripción |
|---|-------|------|-----|--------------------------|-------------|
| 1 | Rango de fechas | `DATE` range | O | Desde / Hasta; DATE picker | Período de análisis |
| 2 | Período rápido | `SEL` | O | Hoy / Esta semana / Este mes / Este año / Personalizado | Acceso rápido a rangos |
| 3 | Empleado | `SEL` | O | Lista de empleados registrados | Filtra ventas por vendedor |
| 4 | Método de pago | `SEL` | O | Efectivo / Tarjeta / Transferencia / Todos | Filtra por forma de cobro |
| 5 | Categoría de producto | `SEL` | O | Lista de categorías del inventario | Filtra por tipo de producto |
| 6 | Producto específico | `SEL` | O | Búsqueda en catálogo | Filtra por ítem individual |

### Métricas Mostradas

| Métrica | Tipo | Descripción |
|---------|------|-------------|
| Total de ventas | `DEC` | Suma de ventas en el período |
| Número de transacciones | `INT` | Cantidad de ventas |
| Ticket promedio | `DEC` | Total ventas / número transacciones |
| Productos más vendidos | Lista `STR` + `INT` | Ranking por unidades vendidas |
| Ingresos vs Egresos | `DEC` comparativo | Balance del período |
| Evolución diaria/semanal | Gráfica | Serie temporal de ventas |
| Métodos de pago | % por tipo | Distribución de cobros |

### Descarga de Reportes

| # | Formato | Contenido |
|---|---------|-----------|
| 1 | PDF | Reporte visual con gráficas |
| 2 | Excel/CSV | Datos crudos de todas las transacciones |

---

## 20. Configuraciones del Negocio

**Ruta:** `web.zulycell.co/settings`  
**Plan:** Todos  
**Propósito:** Ajustar datos del negocio y parámetros del sistema

### Formulario — Datos del Negocio

| # | Campo | Tipo | R/O | Restricciones | Descripción |
|---|-------|------|-----|---------------|-------------|
| 1 | Nombre del negocio | `STR` | R | max [100] chars | Nombre en reportes y comprobantes |
| 2 | Tipo de negocio | `SEL` | O | Gastronómico, Comercio, Servicios, Mercados | Categoría del negocio |
| 3 | País | `SEL` | R | Lista de 21 países | Afecta moneda y normativa fiscal |
| 4 | Moneda | `STR` | AUTO | Según país seleccionado | COP, MXN, PEN, USD, etc. |
| 5 | Logo del negocio | `IMG` | O | JPG/PNG | Aparece en comprobantes y catálogo |
| 6 | Dirección | `STR` | O | max [255] chars | Aparece en facturas |
| 7 | Teléfono del negocio | `TEL` | O | Formato local | Aparece en comprobantes |
| 8 | Email del negocio | `EMAIL` | O | Formato email válido | Para comunicaciones |
| 9 | NIT / RUT del negocio | `STR` | O | max [20] chars | Para facturación electrónica |

### Configuración de Comprobantes

| # | Campo | Tipo | R/O | Descripción |
|---|-------|------|-----|-------------|
| 1 | Mostrar logo en comprobante | `BOOL` | O | Toggle ON/OFF |
| 2 | Mensaje de pie de página | `STR` | O | max [255] chars — ej: "¡Gracias por su compra!" |
| 3 | Numeración de comprobantes | `INT` | O | Número inicial de correlativo |

---



## 21. QR de Pago

**Propósito:** Generar código QR para que clientes paguen directamente (integración con pasarelas de pago)

| # | Campo | Tipo | R/O | Descripción |
|---|-------|------|-----|-------------|
| 1 | Monto a cobrar | `DEC` | O | Si se deja vacío, el cliente ingresa el monto | `[0.01, 9999999.99]` |
| 2 | Descripción del cobro | `STR` | O | max [255] chars | Concepto del pago |
| 3 | QR generado | `IMG` AUTO | — | Código QR válido para el monto especificado |
| 4 | Compartir QR | Acción | — | Descarga o comparte la imagen |
| 5 | Enlace de pago | `STR` / URL AUTO | — | URL alternativa al QR |

---

## RESUMEN CONSOLIDADO — TODOS LOS CAMPOS

| Módulo | Total de campos | Requeridos | Opcionales | Auto |
|--------|:--------------:|:----------:|:----------:|:----:|
| Registro de Negocio | 7 | 4 | 0 | 3 |
| Venta | 14 | 5 | 6 | 3 |
| Gasto | 10 | 3 | 6 | 1 |
| Producto (básico) | 9 | 2 | 5 | 2 |
| Variante de Producto | 6 | 3 | 3 | 0 |
| Ajuste de Stock | 5 | 3 | 1 | 1 |
| Cliente | 9 | 1 | 4 | 4 |
| Deuda/Abono Cliente | 8 | 2 | 4 | 2 |
| Proveedor | 10 | 1 | 5 | 4 |
| Compra a Proveedor | 10 | 6 | 4 | 0 |
| Pago a Proveedor | 4 | 1 | 2 | 1 |
| Cotización | 11 | 4 | 5 | 2 |
| Empleado | 14 | 2 | 2 | 10 |
| Receta (Pro) | 10 | 5 | 3 | 2 |
| Factura Electrónica (Pro) | 17 | 10 | 4 | 3 |
| Catálogo / Tienda Web | 8 | 1 | 6 | 1 |
| Estadísticas (filtros) | 6 | 0 | 6 | 0 |
| Configuraciones | 9 | 2 | 7 | 0 |
| **TOTAL** | **~167** | **~55** | **~73** | **~39** |

---

## NOTAS TÉCNICAS

- **Autenticación:** Sin contraseña. Login mediante OTP (código de 4–6 dígitos) enviado por WhatsApp o email. Token de sesión con expiración configurable.
- **Sincronización:** Tiempo real en la nube. Múltiples dispositivos simultáneos.
- **Moneda:** Decimal con 2 cifras. Signo y formato según país (COP sin decimales en display, aunque internamente se manejan).
- **Timestamps:** Se asignan en el servidor (UTC o zona local del negocio según configuración).
- **Imágenes:** JPG/PNG. Comprimidas automáticamente por la plataforma.
- **Códigos de barras soportados:** EAN-13 (13 dígitos) y UPC-A (12 dígitos). No soporta QR en productos.
- **Texto libre:** Generalmente VARCHAR con límite entre 50 y 500 caracteres según el campo.
- **Campos numéricos de precio:** Decimal positivo, 2 decimales máximo. No acepta negativos.
- **Stock:** Entero no negativo. Se bloquea la venta si no hay stock (o se permite con advertencia según configuración).
- **Límite gratuito:** Número limitado de productos, clientes y proveedores. Sin datos exactos publicados.
- **API pública:** No existe documentación pública de API (swagger/OpenAPI no disponible).

---



> ⚠️ Los tipos de dato exactos (VARCHAR length, precisión decimal interna, validaciones de front-end) son estimaciones basadas en el comportamiento documentado públicamente. Para la especificación técnica exacta del backend contactar: hola@zulycell.co
