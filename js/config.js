/*
 * Configuración de conexión con Supabase.
 *
 * Encuentra estos dos valores en tu proyecto de Supabase:
 *   Project Settings → API (o "Data API")
 *     - Project URL           → SUPABASE_URL
 *     - anon / public key     → SUPABASE_ANON_KEY
 *
 * La clave "anon" está hecha para usarse en el navegador y puede subirse a GitHub:
 * los datos quedan protegidos por el inicio de sesión y por las reglas de seguridad
 * (RLS) del archivo supabase/schema.sql.
 *
 * NUNCA pegues aquí la clave "service_role": esa da acceso total a la base de datos.
 */
window.ARAM_CONFIG = {
  SUPABASE_URL: "https://eztlrdhjzrkgzogdlzvs.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6dGxyZGhqenJrZ3pvZ2RsenZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MTQwNDcsImV4cCI6MjEwODA5MDA0N30.KIDq2wekph9vTOxrHbkQurXLE9790hdeL01ZQqfzym4"
};
