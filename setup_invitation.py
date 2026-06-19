import asyncio
import os
os.environ['DATABASE_URL'] = "postgresql://invoice:invoice_password@localhost:5440/invoice"
os.environ['PYTHONPATH'] = "/home/yvniel/fintral/backend"

from app.database import get_db
from app.models.user import User
from app.models.organization import Organization
from app.models.invitation import Invitation
from app.core.security import get_password_hash
from sqlalchemy import select
import secrets

async def setup_test():
    async for db in get_db():
        result = await db.execute(select(User).where(User.email == "admin@fintral.do"))
        admin = result.scalar_one_or_none()
        if admin:
            admin.is_active = True
            admin.is_superuser = True
            await db.commit()
            print(f"Admin activado: {admin.id}")
        
        result = await db.execute(select(Organization).where(Organization.owner_id == admin.id))
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
            await db.commit()
            await db.refresh(org)
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
        await db.commit()
        await db.refresh(invitation)
        
        print(f"\n✅ Invitación creada:")
        print(f"   Token: {token}")
        print(f"   Email invitado: {invitation.email}")
        print(f"   Organización: {org.name} ({org.id})")
        print(f"   URL: http://localhost:3000/accept-invite?token={token}")
        break

asyncio.run(setup_test())