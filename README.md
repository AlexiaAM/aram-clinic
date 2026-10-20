# ARAM · Clínica de rehabilitación física

Aplicación web para administrar la clínica desde el celular o la computadora:

- **Pacientes** con historial clínico (evaluaciones, notas de sesión con escala de dolor EVA, alta).
- **Citas** con agenda semanal, citas recurrentes y aviso de horarios que se cruzan.
- **Finanzas**: cobro de sesiones, ventas de pomadas y material, gastos y balance.
- **Reportes** semanales, mensuales y anuales, exportables a **Excel**.

La app es una página web estática (HTML, CSS y JavaScript). Los datos viven en **Supabase**, una base de datos PostgreSQL en la nube con plan gratuito. Por eso el celular y la computadora ven siempre la misma información.

```
aram/
├── index.html              Estructura de la app
├── css/estilos.css         Diseño (se adapta a celular y computadora)
├── js/config.js            ← Aquí van tus datos de Supabase
├── js/app.js               Lógica de la app
├── supabase/schema.sql     Tablas y reglas de seguridad de la base de datos
├── manifest.webmanifest    Permite instalarla en la pantalla de inicio del celular
└── img/                    Íconos
```

---

## Paso 1 · Crear la base de datos en Supabase

1. Crea una cuenta gratuita en [supabase.com](https://supabase.com) y presiona **New project**.
   Elige un nombre (por ejemplo `aram`), una contraseña para la base de datos y la región más cercana.
2. Cuando el proyecto esté listo, abre **SQL Editor → New query**.
3. Abre el archivo `supabase/schema.sql` y **cambia el correo de la última línea** por el tuyo.
4. Pega todo el contenido en el editor y presiona **Run**. Debe decir *Success*.

## Paso 2 · Crear tu usuario

1. Ve a **Authentication → Users → Add user → Create new user**.
2. Escribe el **mismo correo** que pusiste en el paso anterior y una contraseña.
   Marca **Auto Confirm User**.
3. Para que nadie más pueda registrarse, ve a **Authentication → Sign In / Providers** (en algunas versiones, **Authentication → Settings**) y desactiva **Allow new users to sign up**.

> **¿Otra persona necesita acceso?** Por ejemplo, recepción.
> 1. Créale un usuario como en el punto 2.
> 2. Agrega su correo en **SQL Editor**:
>    `insert into miembros (email) values ('recepcion@correo.com');`
>
> Para quitarle el acceso, borra su fila de la tabla `miembros` desde **Table Editor**.

## Paso 3 · Conectar la app con Supabase

1. En Supabase abre **Project Settings → API** (o **Data API**).
2. Copia la **Project URL** y la clave **anon public**.
3. Pégalas en `js/config.js`:

```js
window.ARAM_CONFIG = {
  SUPABASE_URL: "https://abcdefghijk.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJI..."
};
```

La clave *anon* puede subirse a GitHub sin problema: está hecha para usarse en el navegador. Tus datos quedan protegidos por el inicio de sesión y por las reglas de seguridad del `schema.sql`.

**Nunca uses la clave `service_role`.** Esa da acceso total a la base de datos.

## Paso 4 · Subir a GitHub

1. Crea un repositorio nuevo en [github.com/new](https://github.com/new), por ejemplo `aram-clinica`.
2. Sube los archivos. Tienes dos formas:
   - **Desde el navegador:** en el repositorio presiona **Add file → Upload files** y arrastra todo el contenido de la carpeta `aram` (no la carpeta en sí, sino lo que tiene adentro).
   - **Desde la terminal:**

```bash
cd aram
git init
git add .
git commit -m "ARAM: primera versión"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/aram-clinica.git
git push -u origin main
```

## Paso 5 · Publicar la app (hosting gratuito)

### Opción A · GitHub Pages
1. En el repositorio ve a **Settings → Pages**.
2. En **Source** elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`, y guarda.
3. En uno o dos minutos la app estará en `https://TU-USUARIO.github.io/aram-clinica/`.

### Opción B · Netlify o Vercel
1. Entra a [netlify.com](https://netlify.com) o [vercel.com](https://vercel.com) con tu cuenta de GitHub.
2. Importa el repositorio. No necesita comando de compilación (build) y la carpeta de publicación es la raíz.
3. Cada vez que subas cambios a GitHub, la app se actualiza sola.

## Paso 6 · Usarla en el celular

1. Abre la dirección de la app en el navegador del celular e inicia sesión.
2. Agrégala a la pantalla de inicio:
   - **iPhone (Safari):** Compartir → **Agregar a inicio**.
   - **Android (Chrome):** menú ⋮ → **Agregar a pantalla principal** o **Instalar app**.

Se abrirá como una app más, con el ícono de ARAM. Los cambios que hagas en un dispositivo aparecen al instante en los demás.

---

## Primer uso

- En **Ajustes** escribe el nombre del fisioterapeuta, el precio por sesión y el símbolo de moneda.
- Si quieres explorar la app antes de cargar datos reales, usa **Cargar datos de ejemplo**. Cuando termines, bórralos con el botón **Eliminar datos de ejemplo**. Tus registros reales no se tocan.

## Respaldos

- Exporta a Excel desde **Finanzas** y **Reportes** de forma periódica.
- En Supabase puedes descargar cualquier tabla en CSV desde **Table Editor → Export**.
- El plan gratuito de Supabase **pausa el proyecto si pasa una semana sin uso**. Se reactiva desde el panel con un clic y los datos no se pierden. Con el uso diario de la clínica no debería pausarse.

## Problemas comunes

| Mensaje o síntoma | Solución |
|---|---|
| "Configuración pendiente" | Falta llenar `js/config.js` (paso 3). |
| "Correo o contraseña incorrectos" | Revisa el usuario en **Authentication → Users**. Desde ahí también puedes cambiar la contraseña. |
| "El correo … no está autorizado" | Agrega ese correo a la tabla `miembros` (paso 2). |
| "No se pudieron cargar los datos" | Revisa que hayas ejecutado `schema.sql` completo y que el proyecto no esté pausado. |
| Los cambios no aparecen en el otro dispositivo | Recarga la página. Si sigue igual, vuelve a ejecutar `schema.sql`, que activa la sincronización en tiempo real. |

## Datos técnicos

- Sin compilación ni dependencias que instalar. Las librerías se cargan desde CDN:
  - Supabase JS 2.45.4 (jsDelivr)
  - SheetJS 0.18.5 para Excel (cdnjs)
  - Google Fonts
- Tablas:
  - `pacientes`, `citas`, `historial`, `gastos`, `ingresos` y `config`.
  - `miembros` guarda los correos con acceso.
  - Todas tienen RLS (Row Level Security) activado: solo un usuario con sesión iniciada y cuyo correo esté en `miembros` puede leer o escribir.
- Para probarla en tu computadora sin subirla, abre la carpeta con un servidor local, por ejemplo `npx serve aram` o la extensión *Live Server* de VS Code, y entra a la dirección que te indique.
