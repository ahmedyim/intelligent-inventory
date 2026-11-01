from pydantic_settings import BaseSettings,SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL:str
    ALGORITHM:str="HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES:int=15
    REFRESH_TOKEN_EXPIRE_DAY:int=7
    ACCESS_TOKEN_SECRET_KEY:str
    REFRESH_TOKEN_SECRET_KEY:str
    RESET_TOKEN_EXPIRE_MINUTES: int = 30          # used by crud/auth.py (forgot password)
    FRONTEND_URL: str = "http://localhost:3000"   # used to build the reset link
    SUPER_ADMIN_EMAIL:str
    SUPER_ADMIN_PASSWORD:str
    SUPER_ADMIN_FULL_NAME:str
    SUPER_ADMIN_PHONE:str
    model_config=SettingsConfigDict(
    env_file=".env",
    env_file_encoding='utf-8',
    extra='ignore'
)
settings=Settings()