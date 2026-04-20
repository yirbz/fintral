from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from app.database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    tax_id = Column(String)
    plan = Column(String, default="Free Plan")
    created_at = Column(DateTime, default=datetime.utcnow)
