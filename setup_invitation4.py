import sys
sys.path.insert(0, '/home/yvniel/fintral/backend')

import os
with open('/tmp/db_pw.txt') as f:
    pw = f.read().strip()
os.environ['DATABASE_URL'] = "postgresql://invoice:***@localhost:5440/invoice"

from app.database import get_db
from app.models.user import User
from app.models.organization import Organization
from app.models.invitation import Invitation
from sqlalchemy import select
import secrets

# Forzar reconexión con la URL correcta
import app.database as db_module
db_module.engine = db_module.get_engine()

db_gen = get_db()
db = next(db_gen)

try:
    result = db.execute(select(User).where(User.email == "admin@fintral.do"))
    admin = result.scalar_one_or_none()
    if admin:
        admin.is_active = True
        admin.is_superuser = True
        db.commit()
        print(f"Admin activado: {admin.id}")
    else:
        print("Admin no encontrado")
        db_gen.close()
        exit(1)
    
    result = db.execute(select(Organization).where(Organization.owner_id == admin.id))
    org = result.scalar_one_or_none()
    if not org:
        org = Organization(
            name="Fintral Test Org",
            rnc="131123456",
            email="org@fintral.do",
            owner_id=admin.id,
            is_active=True
        )
        db.add(org)
        db.commit()
        db.refresh(org)
        print(f"Org creada: {org.id}")
    
    token = secrets.token_urlsafe(32)
    invitation = Invitation(
        email="invitado@ejemplo.com",
        token=token,
        organization_id=org.id,
        role="member",
        invited_by=admin.id
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    
    print("\n✅ Invitación creada:")
    print(f"   Token: {token}")
    print(f"   Email invitado: {invitation.email}")
    print(f"   Organización: {org.name} ({org.id})")
    print(f"   URL: http://localhost:3000/accept-invite?token={token}")
finally:
    db_gen.close()