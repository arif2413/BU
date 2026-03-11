import os
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv

# Ensure .env is loaded before reading environment variables,
# regardless of import order.
load_dotenv()


@dataclass
class Settings:
    jwt_secret_key: str = os.environ.get("JWT_SECRET_KEY", "change-this-secret")
    jwt_algorithm: str = os.environ.get("JWT_ALGORITHM", "HS256")
    jwt_access_token_expires_minutes: int = int(
        os.environ.get("JWT_EXPIRES_MINUTES", "60")
    )

    # OAuth placeholders – require real keys in production
    google_client_id: Optional[str] = os.environ.get("GOOGLE_CLIENT_ID")
    google_client_secret: Optional[str] = os.environ.get("GOOGLE_CLIENT_SECRET")


settings = Settings()

