from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAY: int = 7
    ACCESS_TOKEN_SECRET_KEY: str
    REFRESH_TOKEN_SECRET_KEY: str
    RESET_TOKEN_EXPIRE_MINUTES: int = 30          # used by crud/auth.py (forgot password)
    FRONTEND_URL: str = "http://localhost:3000"   # used to build the reset link and for CORS
    SUPER_ADMIN_EMAIL: str
    SUPER_ADMIN_PASSWORD: str
    SUPER_ADMIN_FULL_NAME: str
    SUPER_ADMIN_PHONE: str

    # ---- refresh-token cookie ----
    COOKIE_SECURE: bool = False                   # MUST be True in production (HTTPS)
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
    COOKIE_DOMAIN: str | None = None              # e.g. ".myshop.com" for api.myshop.com + app.myshop.com
    REFRESH_COOKIE_NAME: str = "refresh_token"
    REFRESH_COOKIE_PATH: str = "/api/v1/auth"     # the cookie is sent ONLY to these URLs

    # ---- CSRF header check on login/refresh/logout ----
    CSRF_REQUIRED: bool = True                    # set CSRF_REQUIRED=false in .env for development

    # extra allowed browser origins (FRONTEND_URL is always allowed)
    CORS_ORIGINS: list[str] = []

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def allowed_origins(self) -> list[str]:
        """FRONTEND_URL plus CORS_ORIGINS, without duplicates or trailing slashes."""
        origins = [self.FRONTEND_URL, *self.CORS_ORIGINS]
        return list(dict.fromkeys(o.rstrip("/") for o in origins))

    @model_validator(mode="after")
    def _check_cookie_settings(self):
        # browsers reject SameSite=None cookies that are not Secure
        if self.COOKIE_SAMESITE == "none" and not self.COOKIE_SECURE:
            raise ValueError("COOKIE_SAMESITE=none requires COOKIE_SECURE=true")
        return self


settings = Settings()