#!/usr/bin/env python3
"""
Script de diagnóstico para verificar la configuración de la base de datos
"""
import os
import sys
from dotenv import load_dotenv

def main():
    print("🔍 Diagnóstico de Base de Datos")
    print("=" * 40)
    
    # Cargar variables de entorno
    load_dotenv()
    
    # Verificar variables de entorno importantes
    port = os.getenv("PORT")
    database_url = os.getenv("DATABASE_URL")
    is_heroku = port is not None
    
    print(f"PORT: {port}")
    print(f"¿Es Heroku?: {is_heroku}")
    
    if database_url:
        # Ocultar la contraseña por seguridad
        safe_url = database_url
        if "@" in safe_url:
            parts = safe_url.split("@")
            user_pass = parts[0].split("://")[1]
            if ":" in user_pass:
                user = user_pass.split(":")[0]
                safe_url = safe_url.replace(user_pass, f"{user}:***")
        print(f"DATABASE_URL: {safe_url}")
    else:
        print("DATABASE_URL: ❌ NO CONFIGURADA")
    
    print("\n🧪 Probando conexión...")
    
    # Ensure the parent directory is in the python path
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    try:
        from app.database import engine
        from app.config import IS_HEROKU
        print(f"Detectado como Heroku: {IS_HEROKU}")
        
        from sqlalchemy import text
        # Probar conexión
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1")).fetchone()
            if result:
                print("✅ Conexión exitosa")
                
                # Verificar qué base de datos estamos usando
                if str(engine.url).startswith("sqlite"):
                    print("📄 Usando SQLite")
                elif str(engine.url).startswith("postgresql"):
                    print("🐘 Usando PostgreSQL")
                else:
                    print(f"❓ Base de datos desconocida: {engine.url}")
            else:
                print("❌ Error en la consulta de prueba")
                
    except Exception as e:
        print(f"❌ Error de conexión: {e}")
        sys.exit(1)
    
    print("\n✅ Diagnóstico completado")

if __name__ == "__main__":
    main() 