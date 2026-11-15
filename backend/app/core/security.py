"""Password hashing helpers (argon2)"""
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

ph = PasswordHasher()


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return ph.verify(hashed_password, plain_password)   # hash FIRST, password second
    except (VerificationError, InvalidHashError):
        # VerificationError covers VerifyMismatch (wrong password);
        # InvalidHashError means the stored hash is malformed
        return False