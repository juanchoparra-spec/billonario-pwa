# TradeLog

App de registro de operaciones (Opciones, Acciones, Deportes) con saldo, abonos/retiros, edición/borrado y exportación a Excel. Los datos se guardan en una base de datos Supabase, accesible desde cualquier dispositivo.

## 1. Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta gratuita.
2. Click en **"New project"**. Ponle un nombre (ej. `tradelog`) y una contraseña para la base de datos (guárdala, no la necesitarás para esto pero es buena práctica).
3. Espera 1-2 minutos a que se cree el proyecto.

## 2. Crear las tablas

1. En el menú izquierdo, ve a **"SQL Editor"**.
2. Click en **"New query"**.
3. Abre el archivo `supabase_schema.sql` (incluido en este proyecto), copia todo su contenido y pégalo en el editor.
4. Click en **"Run"**. Deberías ver "Success. No rows returned".

Esto crea las tablas `trades` y `movements` donde se guardará tu historial.

## 3. Obtener las credenciales

1. En el menú izquierdo, ve a **"Project Settings" → "API"**.
2. Copia:
   - **Project URL** (algo como `https://xxxxx.supabase.co`)
   - **anon public key** (una clave larga que empieza con `eyJ...`)

## 4. Configurar el proyecto local

1. Copia el archivo `.env.example` y renómbralo a `.env`.
2. Pega tus valores:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

3. Instala dependencias y prueba localmente:

```bash
npm install
npm run dev
```

Abre el enlace que aparece (normalmente `http://localhost:5173`). Ya debería guardar y leer datos de Supabase.

## 5. Subir a GitHub

```bash
git init
git add .
git commit -m "TradeLog con Supabase"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/tradelog.git
git push -u origin main
```

El archivo `.env` **no se sube** (está en `.gitignore`) para no exponer tus credenciales en el repositorio.

## 6. Desplegar en Netlify

1. Entra a [netlify.com](https://www.netlify.com) e inicia sesión.
2. Click en **"Add new site" → "Import an existing project"** y selecciona tu repositorio.
3. Netlify detecta automáticamente la configuración (`netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
4. **Antes de hacer deploy**, ve a **"Add environment variables"** (o luego en "Site settings → Environment variables") y agrega:
   - `VITE_SUPABASE_URL` = tu Project URL
   - `VITE_SUPABASE_ANON_KEY` = tu anon public key
5. Click en **"Deploy site"**.

En unos minutos tendrás un enlace público (`https://tu-sitio.netlify.app`) que lee y escribe en la misma base de datos de Supabase, accesible desde cualquier dispositivo.

## Notas

- La clave "anon public" está diseñada para usarse en el navegador; no es secreta en el mismo sentido que una clave de servidor, pero aun así no se sube al repo por buenas prácticas.
- Las políticas de seguridad (RLS) del SQL incluido permiten acceso total sin login, pensado para uso personal. Si compartes el enlace, cualquiera con él podría ver/editar los datos. Si quieres agregar una contraseña o login más adelante, se puede hacer con Supabase Auth.
- El botón **"Exportar Excel"** sigue funcionando igual, ahora como respaldo adicional de tus datos.
