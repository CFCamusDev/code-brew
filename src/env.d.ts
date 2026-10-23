declare namespace App {
  interface Locals {
    /** Usuario del panel con sesión válida (solo en rutas /admin y /api/admin). */
    admin: import('./lib/server/auth').AdminUser | null;
  }
}
